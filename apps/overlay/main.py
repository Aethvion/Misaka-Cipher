"""
apps/overlay/main.py
────────────────────
Aethvion Suite — Desktop Overlay Sidecar

A lightweight system-tray companion that lets you ask questions about your
screen without opening the dashboard browser tab.

Hotkey : Ctrl+Shift+Space  (captures screen → opens floating input window)
Tray   : right-click icon for quick actions

Dependencies (pip install ...):
    PyQt6   pystray   Pillow   mss   keyboard

Usage:
    python apps/overlay/main.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Optional

# ── Project root on sys.path ──────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

# ── Discover dashboard port ───────────────────────────────────────────────────
def _find_dashboard_port() -> int:
    """Read data/system/ports.json written by the launcher to find the live port."""
    try:
        ports_file = ROOT / "data" / "system" / "ports.json"
        if ports_file.exists():
            data = json.loads(ports_file.read_text(encoding="utf-8"))
            for port, name in data.items():
                if "dashboard" in str(name).lower() or "nexus" in str(name).lower():
                    return int(port)
    except Exception:
        pass
    return 8080  # safe default


DASHBOARD_URL = f"http://localhost:{_find_dashboard_port()}"

# ── Qt availability check ─────────────────────────────────────────────────────
try:
    from PyQt6.QtWidgets import (
        QApplication, QWidget, QVBoxLayout, QHBoxLayout,
        QTextEdit, QLineEdit, QPushButton, QLabel, QFrame,
    )
    from PyQt6.QtCore import Qt, QThread, pyqtSignal, QObject, QPoint
    from PyQt6.QtGui import QFont

    HAS_QT = True
except ImportError:
    HAS_QT = False

# ── Screenshot helper ─────────────────────────────────────────────────────────

def take_screenshot_b64() -> Optional[str]:
    """Capture the primary monitor and return a base64-encoded PNG string."""
    try:
        import mss
        with mss.mss() as sct:
            # monitors[0] = all combined, monitors[1] = primary
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            sct_img = sct.grab(monitor)

        # Convert to PNG via Pillow
        from PIL import Image
        img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except ImportError as e:
        print(f"[Overlay] Screenshot dependency missing ({e}). Install mss and Pillow.")
        return None
    except Exception as e:
        print(f"[Overlay] Screenshot failed: {e}")
        return None


# ── API worker (runs in QThread) ──────────────────────────────────────────────

class AskWorker(QObject):
    finished = pyqtSignal(str)
    error    = pyqtSignal(str)

    def __init__(self, question: str, screenshot_b64: Optional[str], dashboard_url: str):
        super().__init__()
        self.question       = question
        self.screenshot_b64 = screenshot_b64
        self.dashboard_url  = dashboard_url

    def run(self) -> None:
        try:
            import urllib.request

            payload = json.dumps({
                "question":       self.question,
                "screenshot_b64": self.screenshot_b64,
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{self.dashboard_url}/api/overlay/ask",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data    = json.loads(resp.read().decode("utf-8"))
                answer  = data.get("answer", "(no response)")
            self.finished.emit(answer)
        except Exception as e:
            self.error.emit(str(e))


# ── Floating overlay window ───────────────────────────────────────────────────

class OverlayWindow(QWidget):
    """
    Borderless, always-on-top floating window with an indigo dark theme.
    Can be dragged by clicking anywhere in the title bar area.
    """

    # Signal emitted from hotkey/tray threads to trigger show
    show_overlay = pyqtSignal(str)   # base64 screenshot (may be "")

    def __init__(self, dashboard_url: str):
        super().__init__()
        self._dashboard_url  = dashboard_url
        self._screenshot_b64: Optional[str] = None
        self._drag_pos: Optional[QPoint]    = None
        self._worker_thread: Optional[QThread] = None
        self._worker: Optional[AskWorker]       = None

        self._build_ui()

        # Cross-thread signal → main-thread slot
        self.show_overlay.connect(self._on_show_overlay)

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool          # omit from taskbar
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMinimumSize(480, 320)
        self.resize(540, 400)

        # Outer layout (transparent gap around container for shadow illusion)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(8, 8, 8, 8)

        container = QFrame(self)
        container.setObjectName("aovContainer")
        outer.addWidget(container)

        container.setStyleSheet("""
            QFrame#aovContainer {
                background-color: rgba(12, 12, 22, 230);
                border: 1px solid rgba(99, 102, 241, 130);
                border-radius: 14px;
            }
        """)

        layout = QVBoxLayout(container)
        layout.setContentsMargins(16, 14, 16, 16)
        layout.setSpacing(10)

        # ── Title bar ─────────────────────────────────────────────────────────
        title_row = QHBoxLayout()
        title_row.setSpacing(8)

        dot = QLabel("◈")
        dot.setStyleSheet("color: rgba(99,102,241,255); font-size: 15px;")

        title = QLabel("Ask about screen")
        title.setStyleSheet(
            "color: rgba(200,200,224,220); font-size: 13px; font-weight: 600;"
        )

        self._hotkey_lbl = QLabel("Ctrl+Shift+Space")
        self._hotkey_lbl.setStyleSheet(
            "color: rgba(120,120,150,180); font-size: 11px;"
        )

        close_btn = QPushButton("✕")
        close_btn.setFixedSize(26, 26)
        close_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                color: rgba(160,160,180,200);
                border: none;
                border-radius: 13px;
                font-size: 12px;
            }
            QPushButton:hover {
                background: rgba(220,55,55,180);
                color: white;
            }
        """)
        close_btn.clicked.connect(self.hide)

        title_row.addWidget(dot)
        title_row.addWidget(title)
        title_row.addStretch()
        title_row.addWidget(self._hotkey_lbl)
        title_row.addWidget(close_btn)
        layout.addLayout(title_row)

        # Separator
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setMaximumHeight(1)
        sep.setStyleSheet("background: rgba(99,102,241,55);")
        layout.addWidget(sep)

        # ── Response area ─────────────────────────────────────────────────────
        self._response = QTextEdit()
        self._response.setReadOnly(True)
        self._response.setMinimumHeight(150)
        self._response.setPlaceholderText("Response will appear here…")
        self._response.setFont(QFont("Segoe UI", 12))
        self._response.setStyleSheet("""
            QTextEdit {
                background: rgba(8, 8, 18, 190);
                color: rgba(210,210,235,245);
                border: 1px solid rgba(99,102,241,55);
                border-radius: 9px;
                padding: 10px;
            }
            QScrollBar:vertical {
                background: rgba(20,20,35,180);
                width: 6px;
                border-radius: 3px;
            }
            QScrollBar::handle:vertical {
                background: rgba(99,102,241,150);
                border-radius: 3px;
            }
        """)
        layout.addWidget(self._response)

        # ── Input row ─────────────────────────────────────────────────────────
        input_row = QHBoxLayout()
        input_row.setSpacing(8)

        self._input = QLineEdit()
        self._input.setPlaceholderText("What do you want to know about this screen?")
        self._input.setFont(QFont("Segoe UI", 12))
        self._input.setStyleSheet("""
            QLineEdit {
                background: rgba(18,18,32,210);
                color: rgba(220,220,245,255);
                border: 1px solid rgba(99,102,241,100);
                border-radius: 9px;
                padding: 8px 12px;
            }
            QLineEdit:focus {
                border-color: rgba(99,102,241,210);
            }
        """)
        self._input.returnPressed.connect(self._send)

        self._send_btn = QPushButton("Ask")
        self._send_btn.setFixedSize(64, 38)
        self._send_btn.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        self._send_btn.setStyleSheet("""
            QPushButton {
                background: rgba(99,102,241,210);
                color: white;
                border: none;
                border-radius: 9px;
            }
            QPushButton:hover   { background: rgba(99,102,241,255); }
            QPushButton:pressed { background: rgba(79,82,221,255); }
            QPushButton:disabled {
                background: rgba(50,50,70,160);
                color: rgba(110,110,130,200);
            }
        """)
        self._send_btn.clicked.connect(self._send)

        input_row.addWidget(self._input)
        input_row.addWidget(self._send_btn)
        layout.addLayout(input_row)

        # Status label
        self._status = QLabel("")
        self._status.setStyleSheet("color: rgba(130,130,158,200); font-size: 11px;")
        layout.addWidget(self._status)

        # Centre on primary screen
        screen = QApplication.primaryScreen()
        if screen:
            sg = screen.availableGeometry()
            self.move(
                sg.center().x() - self.width() // 2,
                sg.center().y() - self.height() // 2,
            )

    # ── Slot: activated by hotkey / tray ─────────────────────────────────────

    def _on_show_overlay(self, screenshot_b64: str) -> None:
        self._screenshot_b64 = screenshot_b64 or None
        self._response.clear()
        self._input.clear()
        self._send_btn.setEnabled(True)
        hint = "Screenshot captured." if screenshot_b64 else "No screenshot available."
        self._status.setText(f"{hint}  Type your question and press Enter.")
        self.show()
        self.raise_()
        self.activateWindow()
        self._input.setFocus()

    # ── Send question ─────────────────────────────────────────────────────────

    def _send(self) -> None:
        question = self._input.text().strip()
        if not question:
            return

        self._send_btn.setEnabled(False)
        self._status.setText("Thinking…")
        self._response.clear()

        # Clean up any previous thread
        if self._worker_thread and self._worker_thread.isRunning():
            self._worker_thread.quit()
            self._worker_thread.wait(2000)

        self._worker_thread = QThread()
        self._worker = AskWorker(question, self._screenshot_b64, self._dashboard_url)
        self._worker.moveToThread(self._worker_thread)

        self._worker_thread.started.connect(self._worker.run)
        self._worker.finished.connect(self._on_response)
        self._worker.error.connect(self._on_error)
        self._worker.finished.connect(self._worker_thread.quit)
        self._worker.error.connect(self._worker_thread.quit)

        self._worker_thread.start()

    def _on_response(self, text: str) -> None:
        self._response.setPlainText(text)
        self._status.setText("Done.")
        self._send_btn.setEnabled(True)

    def _on_error(self, err: str) -> None:
        self._response.setPlainText(f"Error: {err}")
        self._status.setText("Request failed.")
        self._send_btn.setEnabled(True)

    # ── Drag the frameless window by clicking anywhere ────────────────────────

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, event) -> None:
        if self._drag_pos is not None and (event.buttons() & Qt.MouseButton.LeftButton):
            self.move(event.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, event) -> None:
        self._drag_pos = None


# ── Hotkey listener (daemon thread) ──────────────────────────────────────────

def start_hotkey_listener(window: OverlayWindow) -> None:
    """Register Ctrl+Shift+Space as a global hotkey in a background thread."""

    def _run() -> None:
        try:
            import keyboard as kb

            def _trigger() -> None:
                # Capture screen BEFORE the overlay appears
                scr = take_screenshot_b64()
                window.show_overlay.emit(scr or "")

            kb.add_hotkey("ctrl+shift+space", _trigger, suppress=False)
            print("[Overlay] Hotkey registered: Ctrl+Shift+Space")
            kb.wait()          # blocks thread until keyboard exits
        except ImportError:
            print("[Overlay] 'keyboard' not installed — hotkey disabled. Run: pip install keyboard")
        except Exception as e:
            print(f"[Overlay] Hotkey listener error: {e}")

    t = threading.Thread(target=_run, daemon=True, name="overlay-hotkey")
    t.start()


# ── Tray icon (daemon thread) ─────────────────────────────────────────────────

def _make_tray_image():
    """Return a 32×32 RGBA Pillow image for the tray icon."""
    from PIL import Image, ImageDraw, ImageFont

    img  = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Indigo filled circle
    draw.ellipse([1, 1, 30, 30], fill=(99, 102, 241, 255))
    # Simple "A" letter
    try:
        draw.text((9, 6), "A", fill=(255, 255, 255, 255))
    except Exception:
        pass
    return img


def start_tray(window: OverlayWindow, qt_app: QApplication) -> None:
    """Create a system tray icon in a background thread."""

    def _run() -> None:
        try:
            import pystray

            img = _make_tray_image()

            def _on_ask(icon, item) -> None:
                scr = take_screenshot_b64()
                window.show_overlay.emit(scr or "")

            def _on_dashboard(icon, item) -> None:
                import webbrowser
                webbrowser.open(DASHBOARD_URL)

            def _on_quit(icon, item) -> None:
                icon.stop()
                qt_app.quit()

            menu = pystray.Menu(
                pystray.MenuItem(
                    "Ask about screen  (Ctrl+Shift+Space)",
                    _on_ask,
                    default=True,
                ),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Open Dashboard", _on_dashboard),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Quit Overlay", _on_quit),
            )

            icon = pystray.Icon(
                name="aethvion-overlay",
                icon=img,
                title="Aethvion Overlay",
                menu=menu,
            )
            print("[Overlay] Tray icon active.")
            icon.run()

        except ImportError as e:
            print(f"[Overlay] Tray dependency missing ({e}). Run: pip install pystray Pillow")
        except Exception as e:
            print(f"[Overlay] Tray error: {e}")

    t = threading.Thread(target=_run, daemon=True, name="overlay-tray")
    t.start()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    if not HAS_QT:
        print(
            "[Overlay] PyQt6 is not installed.\n"
            "          Run: pip install PyQt6\n"
            "          Then restart the overlay."
        )
        sys.exit(1)

    # Windows: DPI awareness so text/scaling is crisp
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

    # Re-detect port now (may have changed if dashboard restarted)
    url = f"http://localhost:{_find_dashboard_port()}"

    qt_app = QApplication(sys.argv)
    qt_app.setApplicationName("Aethvion Overlay")
    qt_app.setQuitOnLastWindowClosed(False)   # keep alive when overlay hides

    window = OverlayWindow(dashboard_url=url)

    start_hotkey_listener(window)
    start_tray(window, qt_app)

    print(
        f"[Overlay] Started — dashboard at {url}\n"
        "[Overlay] Press Ctrl+Shift+Space or use the tray icon to activate."
    )

    sys.exit(qt_app.exec())


if __name__ == "__main__":
    main()
