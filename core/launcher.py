"""
core/launcher.py
────────────────
Aethvion Suite — Master Process Launcher

Starts every app server as a child process, tracks their PIDs, and cleans them
all up on exit (Ctrl-C, SIGTERM, or normal return).

Modes
─────
  --consumer   Silent consumer mode.  Uses pythonw.exe + CREATE_NO_WINDOW so
               no black CMD windows are visible anywhere.  The launcher itself
               is also expected to be started via pythonw.exe (from the BAT).

  --dev        Developer mode.  Uses python.exe so each server gets its own
               visible console window with live log output.

Optional flags
──────────────
  --apps code,hardwareinfo,...
               Comma-separated list of optional apps to launch alongside the
               dashboard.  Recognised names: code, hardwareinfo, vtuber, audio

Usage
─────
  # Consumer (silent, no windows):
  pythonw core\\launcher.py --consumer --apps code,hardwareinfo

  # Developer (visible console per server):
  python core\\launcher.py --dev --apps code
"""

from __future__ import annotations

import argparse
import atexit
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent
VENV_DIR = ROOT / ".venv" / "Scripts"
VENV_PYTHON = VENV_DIR / "python.exe"
VENV_PYTHONW = VENV_DIR / "pythonw.exe"

# ── App registry ──────────────────────────────────────────────────────────────
# Each entry describes one server process.
#   module : passed as `python -m <module>` (mutually exclusive with script)
#   script : path relative to ROOT, passed as `python <script>`
#   port   : the default port (informational — actual port decided by server)
#   title  : human-readable label for log output

APP_REGISTRY: dict[str, dict] = {
    "dashboard": {
        "module": "core.main",
        "port": 8080,
        "title": "Nexus Dashboard",
        "required": True,
    },
    "code": {
        "script": "apps/code/code_server.py",
        "port": 8083,
        "title": "Code IDE",
        "required": False,
    },
    "hardwareinfo": {
        "script": "apps/hardwareinfo/hardware_server.py",
        "port": 8084,
        "title": "Hardware Info",
        "required": False,
    },
    "vtuber": {
        "script": "apps/vtuber/vtuber_server.py",
        "port": 8082,
        "title": "VTuber",
        "required": False,
    },
    "audio": {
        "script": "apps/audio/audio_server.py",
        "port": 8086,
        "title": "Audio",
        "required": False,
    },
}

# ── Child-process tracking ─────────────────────────────────────────────────────

_child_procs: list[subprocess.Popen] = []
_child_lock = threading.Lock()


def _register(proc: subprocess.Popen) -> None:
    with _child_lock:
        _child_procs.append(proc)


def _cleanup() -> None:
    """Terminate all child processes, then kill any that refuse to stop."""
    with _child_lock:
        procs = list(_child_procs)

    if not procs:
        return

    print("\n[Launcher] Sending SIGTERM to all child processes…")
    for proc in procs:
        try:
            proc.terminate()
        except Exception:
            pass

    # Give them up to 4 seconds to shut down gracefully
    deadline = time.time() + 4.0
    for proc in procs:
        remaining = max(0.0, deadline - time.time())
        try:
            proc.wait(timeout=remaining)
        except Exception:
            pass

    # Force-kill stragglers
    for proc in procs:
        try:
            if proc.poll() is None:
                proc.kill()
                print(f"[Launcher] Force-killed PID {proc.pid}")
        except Exception:
            pass

    print("[Launcher] All child processes stopped.")


atexit.register(_cleanup)


def _signal_handler(sig: int, frame) -> None:  # type: ignore[type-arg]
    print(f"\n[Launcher] Caught signal {sig}. Shutting down…")
    _cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_python(consumer: bool) -> str:
    """Return the right Python executable for the requested mode."""
    if consumer:
        if VENV_PYTHONW.exists():
            return str(VENV_PYTHONW)
        return "pythonw"
    else:
        if VENV_PYTHON.exists():
            return str(VENV_PYTHON)
        return "python"


def _build_env() -> dict[str, str]:
    """Build the subprocess environment — suppress per-server browser opens."""
    env = os.environ.copy()
    env["AETHVION_NO_BROWSER"] = "1"          # servers must not open their own browser
    env["PYTHONPATH"] = str(ROOT)             # make sure `core.*` imports resolve
    env["PYTHONUNBUFFERED"] = "1"             # live log output in dev mode
    return env


def _launch_process(name: str, cfg: dict, consumer: bool) -> subprocess.Popen | None:
    """Start a single app server. Returns the Popen object or None on failure."""
    python = _get_python(consumer)
    env = _build_env()

    if "module" in cfg:
        cmd = [python, "-m", cfg["module"]]
    else:
        cmd = [python, str(ROOT / cfg["script"])]

    popen_kwargs: dict = {
        "cwd": str(ROOT),
        "env": env,
    }

    if consumer:
        # Completely silent — no window, no stdio
        popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        popen_kwargs["stdout"] = subprocess.DEVNULL
        popen_kwargs["stderr"] = subprocess.DEVNULL
    else:
        # Dev mode — let each process inherit the parent's stdio or get its own
        # window so logs are visible.  On Windows we use CREATE_NEW_CONSOLE so
        # each server gets its own titled CMD window.
        if os.name == "nt":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE

    try:
        proc = subprocess.Popen(cmd, **popen_kwargs)
        _register(proc)
        port = cfg.get("port", "?")
        print(f"[Launcher]  ✓  {cfg['title']:<20} PID {proc.pid:<6}  →  http://localhost:{port}")
        return proc
    except FileNotFoundError:
        print(f"[Launcher]  ✗  {cfg['title']} — executable not found: {python}")
        return None
    except Exception as exc:
        print(f"[Launcher]  ✗  {cfg['title']} — {exc}")
        return None


def _monitor_dashboard(proc: subprocess.Popen, consumer: bool) -> None:
    """Restart the dashboard if it crashes (runs in a daemon thread)."""
    while True:
        time.sleep(5)
        if proc.poll() is not None:
            print("[Launcher] Dashboard crashed — restarting…")
            new_proc = _launch_process("dashboard", APP_REGISTRY["dashboard"], consumer)
            if new_proc:
                proc = new_proc  # update local reference


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aethvion Suite Master Launcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--consumer",
        action="store_true",
        help="Silent mode: pythonw.exe, no visible windows",
    )
    mode_group.add_argument(
        "--dev",
        action="store_true",
        help="Developer mode: python.exe, each server gets its own console",
    )
    parser.add_argument(
        "--apps",
        default="",
        metavar="NAME[,NAME]",
        help="Comma-separated optional apps to start (e.g. code,hardwareinfo)",
    )
    parser.add_argument(
        "--browser",
        choices=["app", "web", "none"],
        default="app",
        help=(
            "How to open the dashboard in the browser after launch.\n"
            "  app  – Chrome/Edge --app= mode (no URL bar, native-app feel)\n"
            "  web  – normal browser tab\n"
            "  none – do not open any browser"
        ),
    )
    args = parser.parse_args()

    consumer = args.consumer and not args.dev
    mode_label = "CONSUMER" if consumer else "DEV"
    browser_mode: str = args.browser

    # ── Banner ────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"  AETHVION SUITE LAUNCHER  [{mode_label} MODE]")
    print("=" * 60)

    # ── Load .env ─────────────────────────────────────────────────────────────
    env_path = ROOT / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass

    # ── Determine which optional apps to start ────────────────────────────────
    extra_names: list[str] = []
    if args.apps:
        for name in args.apps.split(","):
            name = name.strip()
            if not name:
                continue
            if name in APP_REGISTRY:
                extra_names.append(name)
            else:
                known = ", ".join(k for k in APP_REGISTRY if not APP_REGISTRY[k]["required"])
                print(f"[Launcher] Unknown app '{name}'. Known optional apps: {known}")

    # ── Launch dashboard (always first) ───────────────────────────────────────
    print()
    dashboard_proc = _launch_process("dashboard", APP_REGISTRY["dashboard"], consumer)

    # ── Launch optional apps ──────────────────────────────────────────────────
    for app_name in extra_names:
        _launch_process(app_name, APP_REGISTRY[app_name], consumer)

    print()

    # ── Open the dashboard in browser app-mode ────────────────────────────────
    if dashboard_proc:
        dashboard_port = int(os.environ.get("PORT", APP_REGISTRY["dashboard"]["port"]))

        def _open_dashboard_browser() -> None:
            if browser_mode == "none":
                return
            # Give the server a couple of seconds to bind its port before we try
            time.sleep(2.5)
            # Temporarily unset the env var so THIS process can open the browser
            saved = os.environ.pop("AETHVION_NO_BROWSER", None)
            try:
                from core.utils.browser import open_app_window
                open_app_window(
                    f"http://localhost:{dashboard_port}",
                    delay=0,           # we already slept
                    background=False,
                    app_mode=(browser_mode == "app"),
                )
            finally:
                if saved is not None:
                    os.environ["AETHVION_NO_BROWSER"] = saved

        threading.Thread(target=_open_dashboard_browser, daemon=True).start()

        # Monitor and auto-restart the dashboard in a daemon thread
        threading.Thread(
            target=_monitor_dashboard,
            args=(dashboard_proc, consumer),
            daemon=True,
        ).start()

    # ── Keep launcher alive ───────────────────────────────────────────────────
    if consumer:
        # Consumer mode: stay silent, just spin forever
        try:
            while True:
                time.sleep(10)
        except (KeyboardInterrupt, SystemExit):
            pass
    else:
        # Dev mode: show a concise status line every 30 s
        print("[Launcher] All processes running. Press Ctrl+C to stop all.\n")
        try:
            while True:
                time.sleep(30)
                alive = []
                with _child_lock:
                    for proc in _child_procs:
                        if proc.poll() is None:
                            alive.append(proc.pid)
                print(f"[Launcher] Alive PIDs: {alive}")
        except (KeyboardInterrupt, SystemExit):
            pass


if __name__ == "__main__":
    main()
