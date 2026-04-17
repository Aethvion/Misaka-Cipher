"""
Aethvion Suite - Professional Graphical Installer v3
═════════════════════════════════════════════════════
Advanced Orchestrator for Aethvion Suite Deployment.
"""

import sys
import os
import subprocess
import threading
import time
import webbrowser
import customtkinter as ctk
from pathlib import Path
from PIL import Image

# Configuration
VERSION = "14.0"
ACCENT_COLOR = "#6366f1"  # Indigo
BG_COLOR = "#090b0f"      # Deepest Black
SUCCESS_COLOR = "#10b981" # Emerald
PANEL_COLOR = "#15181e"   # Panel base
DEBUG_MODE = False

class AethvionInstaller(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        # Window Configuration
        self.title(f"Aethvion Suite Deployment Engine")
        width, height = 800, 560
        self.geometry(f"{width}x{height}")
        self._center_window(width, height)
        self.resizable(False, False)
        
        # Theme
        ctk.set_appearance_mode("dark")
        self.configure(fg_color=BG_COLOR)

        # Environment Paths
        self.project_root = Path(__file__).parent.parent.parent
        self.setup_dir = self.project_root / "setup"
        self.logo_path = self.project_root / "assets" / "aethvion" / "aethvion_logo.png"

        # State Tracking
        self.installing = False
        self.complete = False
        self._current_progress = 0.0

        self._create_layout()

    def _center_window(self, w, h):
        x = (self.winfo_screenwidth() // 2) - (w // 2)
        y = (self.winfo_screenheight() // 2) - (h // 2)
        self.geometry(f"{w}x{h}+{x}+{y}")

    def _create_layout(self):
        # ── Sidebar Visual ──────────────────────────────────────────────────
        self.sidebar = ctk.CTkFrame(self, width=240, corner_radius=0, fg_color=PANEL_COLOR)
        self.sidebar.pack(side="left", fill="y")
        
        # Branded Logo
        try:
            pil_img = Image.open(self.logo_path)
            # Center-fit logic
            w, h = pil_img.size
            ratio = 180 / w
            logo_ctk = ctk.CTkImage(light_image=pil_img, dark_image=pil_img, size=(180, h * ratio))
            self.logo = ctk.CTkLabel(self.sidebar, image=logo_ctk, text="")
            self.logo.pack(pady=(50, 20))
        except Exception:
            self.logo = ctk.CTkLabel(self.sidebar, text="✦ AETHVION", font=("Inter", 24, "bold"), text_color=ACCENT_COLOR)
            self.logo.pack(pady=50)

        self.info_box = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        self.info_box.pack(fill="x", padx=30, side="bottom", pady=40)
        
        ctk.CTkLabel(self.info_box, text="BUILD VERSION", font=("Inter", 10, "bold"), text_color="#475569").pack(anchor="w")
        ctk.CTkLabel(self.info_box, text=f"Release {VERSION} - Stable", font=("Inter", 12), text_color="#94a3b8").pack(anchor="w", pady=(0, 10))
        
        ctk.CTkLabel(self.info_box, text="ENVIRONMENT", font=("Inter", 10, "bold"), text_color="#475569").pack(anchor="w")
        ctk.CTkLabel(self.info_box, text="Local Intelligence Hub", font=("Inter", 12), text_color="#94a3b8").pack(anchor="w")

        # ── Main Content Area ───────────────────────────────────────────────
        self.main_content = ctk.CTkFrame(self, fg_color="transparent")
        self.main_content.pack(side="right", fill="both", expand=True, padx=50, pady=50)

        self.view_container = ctk.CTkFrame(self.main_content, fg_color="transparent")
        self.view_container.pack(fill="both", expand=True)

        self._show_welcome_view()

    def _show_welcome_view(self):
        self.header = ctk.CTkLabel(self.view_container, text="System Orchestrator", font=("Inter", 32, "bold"), text_color="white")
        self.header.pack(anchor="w")

        self.sub_header = ctk.CTkLabel(self.view_container, text="Kernel Deployment and Environment Synchronization", font=("Inter", 14), text_color=ACCENT_COLOR)
        self.sub_header.pack(anchor="w", pady=(0, 40))

        self.desc = ctk.CTkLabel(
            self.view_container,
            text="You are about to deploy the Aethvion Suite core framework. "
                 "This process will automate the construction of the Python dependency graph, "
                 "structure local intelligence storage, and synchronize cross-app assets.\n\n"
                 "Estimated Completion: 2-5 minutes depending on bandwidth.",
            font=("Inter", 13),
            text_color="#94a3b8",
            wraplength=420,
            justify="left"
        )
        self.desc.pack(anchor="w", pady=(0, 60))

        self.deploy_btn = ctk.CTkButton(
            self.view_container,
            text="SYNCHRONIZE SYSTEM",
            font=("Inter", 14, "bold"),
            height=50,
            width=240,
            fg_color=ACCENT_COLOR,
            hover_color="#4f46e5",
            command=self.start_deployment
        )
        self.deploy_btn.pack(anchor="w")

    def _show_deployment_view(self):
        for widget in self.view_container.winfo_children():
            widget.destroy()

        self.status_title = ctk.CTkLabel(self.view_container, text="Synchronizing Kernel...", font=("Inter", 18, "bold"), text_color="white")
        self.status_title.pack(anchor="w")

        self.status_sub = ctk.CTkLabel(self.view_container, text="Phase 1: Analyzing local environment", font=("Inter", 13), text_color="#94a3b8")
        self.status_sub.pack(anchor="w", pady=(5, 15))

        # Progress bar with Percentage
        self.bar_container = ctk.CTkFrame(self.view_container, fg_color="transparent")
        self.bar_container.pack(fill="x", pady=(0, 20))
        
        self.progress_bar = ctk.CTkProgressBar(self.bar_container, height=10, progress_color=ACCENT_COLOR, fg_color="#1e293b")
        self.progress_bar.pack(side="left", fill="x", expand=True)
        self.progress_bar.set(0)

        self.pct_label = ctk.CTkLabel(self.bar_container, text="0%", font=("Inter", 12, "bold"), text_color=ACCENT_COLOR, width=50)
        self.pct_label.pack(side="right", padx=(10, 0))

        # Log Console
        self.console = ctk.CTkTextbox(
            self.view_container,
            height=240,
            fg_color="#050608",
            text_color="#cbd5e1",
            font=("Consolas", 11),
            border_width=1,
            border_color="#1e293b",
            padx=15,
            pady=15
        )
        self.console.pack(fill="x")
        self.console.insert("end", "[SYS] Initiating Aethvion Kernel deployment...\n")
        self.console.configure(state="disabled")

    def log(self, message):
        self.console.configure(state="normal")
        self.console.insert("end", f"› {message.strip()}\n")
        self.console.see("end")
        self.console.configure(state="disabled")

    def update_pct(self, value):
        self._current_progress = value
        self.progress_bar.set(value)
        self.pct_label.configure(text=f"{int(value * 100)}%")

    def start_deployment(self):
        if self.installing: return
        self.installing = True
        self._show_deployment_view()
        threading.Thread(target=self._run_deployment_thread, daemon=True).start()

    def _exec(self, script, start_pct, end_pct, status_text):
        path = self.setup_dir / script
        if not path.exists():
            self.after(0, lambda: self.log(f"CRITICAL: Resource {script} missing."))
            return False
            
        self.after(0, lambda: self.status_sub.configure(text=status_text))
        
        proc = subprocess.Popen(
            [str(path)],
            cwd=str(self.project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        
        # Simple progress interpolation while running
        steps = 10
        increment = (end_pct - start_pct) / steps
        
        def pipe_reader():
            for line in iter(proc.stdout.readline, ""):
                if line:
                    self.after(0, lambda l=line: self.log(l))
            proc.stdout.close()

        reader_thread = threading.Thread(target=pipe_reader, daemon=True)
        reader_thread.start()
        
        for i in range(steps):
            if proc.poll() is not None: break
            time.sleep(0.5)
            self.after(0, lambda v=start_pct + (i * increment): self.update_pct(v))
            
        proc.wait()
        self.after(0, lambda: self.update_pct(end_pct))
        return proc.returncode == 0

    def _run_deployment_thread(self):
        try:
            # Stage 1: Dependency Graph (0 -> 40%)
            if not self._exec("setup_environment.bat", 0.0, 0.4, "Synchronizing Dependency Graph"):
                raise Exception("Kernel environment calibration failed.")

            # Stage 2: Intelligence Structure (40 -> 60%)
            if not self._exec("setup_directories.bat", 0.4, 0.6, "Constructing Intelligence Storage"):
                raise Exception("Sub-system directory structure failed.")

            # Stage 3: Asset Optimization (60 -> 90%)
            if not self._exec("update_to_latest.bat", 0.6, 0.9, "Optimizing Neural Assets"):
                raise Exception("External assets synchronization failed.")

            # Finalize (90 -> 100%)
            self.after(0, lambda: self.status_sub.configure(text="Deployment Successful. Synchronizing Launch Hub."))
            self.after(0, lambda: self.update_pct(1.0))
            time.sleep(1.5)
            self.after(0, self._show_success_view)

        except Exception as e:
            self.after(0, lambda: self.status_sub.configure(text="DEPLOYMENT TERMINATED", text_color="#ef4444"))
            self.after(0, lambda m=str(e): self.log(f"ALERT: {m}"))

    def _show_success_view(self):
        for widget in self.view_container.winfo_children():
            widget.destroy()

        self.complete = True
        
        self.win_header = ctk.CTkLabel(self.view_container, text="Deployment Complete", font=("Inter", 24, "bold"), text_color=SUCCESS_COLOR)
        self.win_header.pack(anchor="w")

        self.win_sub = ctk.CTkLabel(
            self.view_container,
            text="The Aethvion Suite kernel is now fully operational and synchronized. "
                 "All local intelligence paths have been established.",
            font=("Inter", 13),
            text_color="#94a3b8",
            wraplength=420,
            justify="left"
        )
        self.win_sub.pack(anchor="w", pady=(10, 50))

        self.launch_btn = ctk.CTkButton(
            self.view_container,
            text="LAUNCH MISSION CONTROL",
            font=("Inter", 14, "bold"),
            height=50,
            width=260,
            fg_color=SUCCESS_COLOR,
            hover_color="#059669",
            command=self.finalize_and_launch
        )
        self.launch_btn.pack(anchor="w")

    def finalize_and_launch(self):
        # Trigger the browser app-mode launch via launcher.py
        launch_script = self.project_root / "Start_Aethvion.bat"
        # We start the ACTUAL app launch now that it's installed
        subprocess.Popen([str(launch_script)], cwd=str(self.project_root), creationflags=subprocess.CREATE_NO_WINDOW)
        self.destroy()
        sys.exit(0)

if __name__ == "__main__":
    app = AethvionInstaller()
    app.mainloop()
