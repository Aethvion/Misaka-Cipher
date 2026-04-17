"""
Aethvion Suite - Graphical Installer v4
========================================
Vertical step-list design with per-step progress.
Auto-starts on launch. No technical jargon.
"""

import sys
import subprocess
import threading
import time
import re
import customtkinter as ctk
from pathlib import Path
from PIL import Image

# ── Theme ──────────────────────────────────────────────────────────────────────
BG          = "#0c0e14"
PANEL       = "#13161e"
BORDER      = "#1e2330"
ACCENT      = "#6366f1"
SUCCESS     = "#10b981"
ERROR       = "#ef4444"
TEXT        = "#e2e8f0"
MUTED       = "#475569"
STEP_ACTIVE = "#c7d2fe"

ctk.set_appearance_mode("dark")


class StepRow(ctk.CTkFrame):
    """One row in the installation step list."""

    ICON_PENDING = "○"
    ICON_ACTIVE  = "›"
    ICON_DONE    = "✓"
    ICON_ERROR   = "✗"

    def __init__(self, master, title: str, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)

        self._title = title
        self._state = "pending"   # pending | active | done | error

        # ── Icon ───────────────────────────────────────────────────────────────
        self.icon_lbl = ctk.CTkLabel(
            self, text=self.ICON_PENDING,
            font=("Inter", 16), text_color=MUTED, width=24
        )
        self.icon_lbl.grid(row=0, column=0, rowspan=2, padx=(0, 12), sticky="ns")

        # ── Title + pct ────────────────────────────────────────────────────────
        self.title_lbl = ctk.CTkLabel(
            self, text=title,
            font=("Inter", 13), text_color=MUTED, anchor="w"
        )
        self.title_lbl.grid(row=0, column=1, sticky="ew")

        self.pct_lbl = ctk.CTkLabel(
            self, text="",
            font=("Inter", 11), text_color=MUTED, anchor="e", width=42
        )
        self.pct_lbl.grid(row=0, column=2, sticky="e")

        # ── Sub-label (hidden until active) ────────────────────────────────────
        self.sub_lbl = ctk.CTkLabel(
            self, text="",
            font=("Inter", 11), text_color=MUTED, anchor="w"
        )
        # not shown until active

        # ── Progress bar (hidden until active) ─────────────────────────────────
        self.bar = ctk.CTkProgressBar(
            self, height=4, progress_color=ACCENT, fg_color=BORDER
        )
        self.bar.set(0)
        # not shown until active

        self.columnconfigure(1, weight=1)

    # ── Public state setters ──────────────────────────────────────────────────

    def set_active(self, sub: str = ""):
        self._state = "active"
        self.icon_lbl.configure(text=self.ICON_ACTIVE, text_color=ACCENT)
        self.title_lbl.configure(text_color=TEXT)
        self.pct_lbl.configure(text="0%", text_color=ACCENT)
        self.bar.set(0)
        self.bar.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(4, 0))
        self.sub_lbl.configure(text=sub or "")
        self.sub_lbl.grid(row=1, column=1, columnspan=2, sticky="ew")

    def set_progress(self, value: float, sub: str = ""):
        """value: 0.0–1.0"""
        self.bar.set(value)
        self.pct_lbl.configure(text=f"{int(value * 100)}%")
        if sub:
            self.sub_lbl.configure(text=sub)

    def set_done(self):
        self._state = "done"
        self.bar.configure(progress_color=SUCCESS)
        self.bar.set(1.0)
        self.pct_lbl.configure(text="100%", text_color=SUCCESS)
        self.icon_lbl.configure(text=self.ICON_DONE, text_color=SUCCESS)
        self.title_lbl.configure(text_color=SUCCESS)
        self.sub_lbl.configure(text="")

    def set_error(self, msg: str = ""):
        self._state = "error"
        self.bar.configure(progress_color=ERROR)
        self.icon_lbl.configure(text=self.ICON_ERROR, text_color=ERROR)
        self.title_lbl.configure(text_color=ERROR)
        self.pct_lbl.configure(text="", text_color=ERROR)
        if msg:
            self.sub_lbl.configure(text=msg, text_color=ERROR)


class AethvionInstaller(ctk.CTk):

    STEPS = [
        "Preparing Environment",
        "Collecting Packages",
        "Installing Packages",
        "Setting Up Aethvion Suite",
        "Finalizing",
    ]

    def __init__(self):
        super().__init__()

        self.project_root = Path(__file__).parent.parent.parent
        self.setup_dir    = self.project_root / "setup"
        self.logo_path    = self.project_root / "assets" / "aethvion" / "aethvion_logo.png"

        self._done = False
        self._failed = False

        # Window
        W, H = 560, 520
        self.title("Aethvion Suite")
        self.geometry(f"{W}x{H}")
        self._center(W, H)
        self.resizable(False, False)
        self.configure(fg_color=BG)

        self._build_ui()

        # Auto-start after a brief moment (lets window render first)
        self.after(350, self._start_install)

    # ── Geometry ──────────────────────────────────────────────────────────────

    def _center(self, w, h):
        self.geometry(f"{w}x{h}+{(self.winfo_screenwidth()-w)//2}+{(self.winfo_screenheight()-h)//2}")

    # ── UI Construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        outer = ctk.CTkFrame(self, fg_color=BG)
        outer.pack(fill="both", expand=True, padx=40, pady=36)

        # Logo / title
        self._build_header(outer)

        # Divider
        ctk.CTkFrame(outer, height=1, fg_color=BORDER).pack(fill="x", pady=(20, 24))

        # Step card
        card = ctk.CTkFrame(outer, fg_color=PANEL, corner_radius=12,
                            border_width=1, border_color=BORDER)
        card.pack(fill="x")

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=24, pady=20)

        self.step_rows: list[StepRow] = []
        for i, title in enumerate(self.STEPS):
            row = StepRow(inner, title)
            row.pack(fill="x", pady=(0, 14 if i < len(self.STEPS) - 1 else 0))
            self.step_rows.append(row)

        # Status line below card
        self.status_lbl = ctk.CTkLabel(
            outer, text="Starting up…",
            font=("Inter", 12), text_color=MUTED
        )
        self.status_lbl.pack(anchor="w", pady=(16, 0))

        # Launch button (hidden until success)
        self.launch_btn = ctk.CTkButton(
            outer,
            text="Launch Aethvion Suite",
            font=("Inter", 14, "bold"),
            height=46,
            fg_color=SUCCESS,
            hover_color="#059669",
            command=self._launch
        )
        # shown only after success

    def _build_header(self, parent):
        hdr = ctk.CTkFrame(parent, fg_color="transparent")
        hdr.pack(fill="x")

        # Logo
        try:
            pil = Image.open(self.logo_path)
            ratio = 120 / pil.size[0]
            img = ctk.CTkImage(light_image=pil, dark_image=pil,
                               size=(120, int(pil.size[1] * ratio)))
            ctk.CTkLabel(hdr, image=img, text="").pack(anchor="w")
        except Exception:
            ctk.CTkLabel(hdr, text="✦ AETHVION",
                         font=("Inter", 22, "bold"), text_color=ACCENT).pack(anchor="w")

        ctk.CTkLabel(
            hdr, text="Setting up Aethvion Suite",
            font=("Inter", 20, "bold"), text_color=TEXT
        ).pack(anchor="w", pady=(12, 2))

        ctk.CTkLabel(
            hdr, text="This only takes a few minutes.",
            font=("Inter", 13), text_color=MUTED
        ).pack(anchor="w")

    # ── Thread-safe helpers ───────────────────────────────────────────────────

    def _ui(self, fn):
        """Schedule fn on the main thread."""
        self.after(0, fn)

    def _step_active(self, idx: int, sub: str = ""):
        self._ui(lambda: self.step_rows[idx].set_active(sub))

    def _step_progress(self, idx: int, value: float, sub: str = ""):
        self._ui(lambda: self.step_rows[idx].set_progress(value, sub))

    def _step_done(self, idx: int):
        self._ui(lambda: self.step_rows[idx].set_done())

    def _step_error(self, idx: int, msg: str = ""):
        self._ui(lambda: self.step_rows[idx].set_error(msg))

    def _status(self, text: str):
        self._ui(lambda: self.status_lbl.configure(text=text))

    # ── Installation Logic ────────────────────────────────────────────────────

    def _start_install(self):
        threading.Thread(target=self._install_thread, daemon=True).start()

    def _install_thread(self):
        try:
            self._phase_environment()   # Step 0
            self._phase_pip()           # Steps 1 + 2
            self._phase_setup()         # Step 3
            self._phase_finalize()      # Step 4
            self._show_success()
        except Exception as exc:
            self._status(f"Something went wrong: {exc}")

    # ── Phase 0: Prepare Environment ─────────────────────────────────────────

    def _phase_environment(self):
        """Create .venv if missing."""
        self._step_active(0, "Checking your system…")
        self._status("Preparing your environment…")

        venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"

        if not venv_python.exists():
            self._step_progress(0, 0.3, "Creating isolated environment…")
            self._run_silent(["python", "-m", "venv", str(self.project_root / ".venv")])
            self._step_progress(0, 0.7, "Upgrading package tools…")
            self._run_silent([str(venv_python), "-m", "pip", "install",
                              "--upgrade", "pip", "--quiet"])
        else:
            self._step_progress(0, 0.8, "Environment ready")

        self._step_done(0)

    # ── Phase 1+2: pip install with live parsing ──────────────────────────────

    def _phase_pip(self):
        """
        Run `pip install -e ".[memory]"` (fall back to `pip install -e .`) and
        parse stdout to animate steps 1 (Collecting) and 2 (Installing).
        """
        venv_pip = self.project_root / ".venv" / "Scripts" / "pip.exe"

        self._step_active(1, "Scanning required packages…")
        self._status("Gathering packages…")

        cmd_full    = [str(venv_pip), "install", "-e", ".[memory]", "--progress-bar", "off"]
        cmd_minimal = [str(venv_pip), "install", "-e", ".",          "--progress-bar", "off"]

        success = self._run_pip(cmd_full)
        if not success:
            self._status("Trying a lighter install…")
            success = self._run_pip(cmd_minimal)

        if not success:
            self._step_error(1, "Package collection failed")
            self._step_error(2, "Skipped due to earlier error")
            raise Exception("Package installation failed.")

    def _run_pip(self, cmd: list) -> bool:
        """
        Stream pip output, animate step 1 (collecting) and step 2 (installing).
        Returns True if pip exited 0.
        """
        collecting_pkgs: list[str] = []
        installing_pkgs: list[str] = []
        phase = 1          # 1 = Collecting, 2 = Installing
        step1_active = True
        step2_active = False

        proc = subprocess.Popen(
            cmd,
            cwd=str(self.project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

        # Smooth progress animation thread for the slow parts
        self._pip_proc = proc
        self._pip_phase = 1
        anim = threading.Thread(target=self._pip_anim, daemon=True)
        anim.start()

        for raw in iter(proc.stdout.readline, ""):
            line = raw.strip()
            if not line:
                continue

            # ── Collecting phase ──────────────────────────────────────────────
            m = re.match(r"Collecting ([^\s;>=<!(]+)", line)
            if m:
                pkg = m.group(1)
                if pkg not in collecting_pkgs:
                    collecting_pkgs.append(pkg)
                if not step1_active:
                    step1_active = True
                    self._step_active(1, f"Found {pkg}")
                n = len(collecting_pkgs)
                self._step_progress(1, min(0.95, n / max(n + 5, 20)),
                                    f"Found {n} package{'s' if n != 1 else ''}…")
                continue

            # ── Transition to installing ──────────────────────────────────────
            if "Installing collected packages" in line:
                phase = 2
                self._pip_phase = 2
                # parse names from this line if present
                rest = line.replace("Installing collected packages:", "").strip()
                if rest:
                    installing_pkgs = [p.strip() for p in rest.split(",") if p.strip()]
                self._step_done(1)
                step2_active = True
                total = len(installing_pkgs) or len(collecting_pkgs) or 1
                self._step_active(2, f"Installing 0 of {total} packages…")
                continue

            # ── Installing individual package ─────────────────────────────────
            mi = re.match(r"\s*installing\s+([^\s]+)", line, re.IGNORECASE)
            if mi and phase == 2:
                pkg = mi.group(1)
                if pkg not in installing_pkgs:
                    installing_pkgs.append(pkg)
                done  = len(installing_pkgs)
                total = max(done, len(collecting_pkgs), 1)
                pct   = min(0.95, done / total)
                self._step_progress(2, pct, f"Installing {done} of {total} packages…")
                continue

            # ── Successfully installed ────────────────────────────────────────
            if line.startswith("Successfully installed"):
                pkgs = line.replace("Successfully installed", "").strip().split()
                total = len(pkgs) or len(collecting_pkgs)
                if not step2_active:
                    self._step_done(1)
                    self._step_active(2, f"Installing {total} packages…")
                self._step_progress(2, 1.0, f"Installed {total} packages")
                continue

            # ── Already satisfied ─────────────────────────────────────────────
            if "already satisfied" in line.lower() and phase == 1:
                n = len(collecting_pkgs) + 1
                self._step_progress(1, min(0.95, n / 20), "Packages already up to date")

        proc.stdout.close()
        proc.wait()

        # Make sure both steps finish visually
        if proc.returncode == 0:
            if step1_active and not step2_active:
                # Everything was already installed
                self._step_done(1)
                self._step_active(2, "Packages already up to date")
                self._step_done(2)
            elif step2_active:
                self._step_done(2)
        else:
            if step1_active and not step2_active:
                self._step_error(1, "Download failed")
            elif step2_active:
                self._step_error(2, "Installation failed")

        return proc.returncode == 0

    def _pip_anim(self):
        """Gentle progress animation while pip runs (fills to 90%, never completes)."""
        step1_val = 0.0
        step2_val = 0.0
        while True:
            if not hasattr(self, "_pip_proc") or self._pip_proc.poll() is not None:
                break
            phase = getattr(self, "_pip_phase", 1)
            if phase == 1:
                if step1_val < 0.88:
                    step1_val = min(0.88, step1_val + 0.012)
                    self._step_progress(1, step1_val)
            else:
                if step2_val < 0.88:
                    step2_val = min(0.88, step2_val + 0.018)
                    self._step_progress(2, step2_val)
            time.sleep(0.4)

    # ── Phase 3: Setup directories + config ──────────────────────────────────

    def _phase_setup(self):
        self._step_active(3, "Creating your workspace folders…")
        self._status("Setting up Aethvion Suite…")

        dirs_bat = self.setup_dir / "setup_directories.bat"
        if dirs_bat.exists():
            self._step_progress(3, 0.3, "Building folder structure…")
            self._run_silent([str(dirs_bat)])

        self._step_progress(3, 0.6, "Applying default settings…")
        self._copy_config(".env.example",                        ".env")
        self._copy_config("core/config/security.yaml.example",  "core/config/security.yaml")

        self._step_progress(3, 0.9, "Almost there…")
        time.sleep(0.4)
        self._step_done(3)

    def _copy_config(self, src_rel: str, dst_rel: str):
        src = self.project_root / Path(src_rel)
        dst = self.project_root / Path(dst_rel)
        if src.exists() and not dst.exists():
            import shutil
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)

    # ── Phase 4: Finalize ─────────────────────────────────────────────────────

    def _phase_finalize(self):
        self._step_active(4, "Finishing up…")
        self._status("Almost ready…")
        time.sleep(0.8)
        self._step_done(4)

    # ── Success UI ────────────────────────────────────────────────────────────

    def _show_success(self):
        self._done = True
        self._status("Aethvion Suite is ready!")
        self._ui(lambda: self.launch_btn.pack(fill="x", pady=(16, 0)))

    # ── Launch ────────────────────────────────────────────────────────────────

    def _launch(self):
        launch_bat = self.project_root / "Start_Aethvion.bat"
        subprocess.Popen(
            [str(launch_bat)],
            cwd=str(self.project_root),
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        self.destroy()
        sys.exit(0)

    # ── Subprocess helper ─────────────────────────────────────────────────────

    def _run_silent(self, cmd: list) -> int:
        """Run a command, discard output, return exit code.
        .bat files are wrapped in 'cmd /c' automatically."""
        resolved = list(cmd)
        if resolved and str(resolved[0]).lower().endswith(".bat"):
            resolved = ["cmd", "/c"] + resolved
        proc = subprocess.run(
            resolved,
            cwd=str(self.project_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return proc.returncode


if __name__ == "__main__":
    app = AethvionInstaller()
    app.mainloop()
