"""
Aethvion Suite - Professional Installer v7
═══════════════════════════════════════════
Fully transparent design with granular PIP tracking and expandable technical log.
"""

import sys
import subprocess
import threading
import time
import re
import customtkinter as ctk
from pathlib import Path
from PIL import Image, ImageDraw

# ── Theme ──────────────────────────────────────────────────────────────────────
BG_START    = "#0c0e14" 
BG_END      = "#1c2033" 
ACCENT      = "#6366f1"
SUCCESS     = "#10b981"
ERROR       = "#ef4444"
TEXT        = "#e2e8f0"
MUTED       = "#64748b"
BORDER      = "#2e364a"

class StepRow(ctk.CTkFrame):
    ICON_PENDING = "○"
    ICON_ACTIVE  = "›"
    ICON_DONE    = "✓"
    ICON_ERROR   = "✗"

    def __init__(self, master, title: str, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.columnconfigure(1, weight=1)

        self.icon_lbl = ctk.CTkLabel(self, text=self.ICON_PENDING, font=("Inter", 14), text_color=MUTED, width=20)
        self.icon_lbl.grid(row=0, column=0, padx=(0, 10), sticky="nw")

        self.title_lbl = ctk.CTkLabel(self, text=title, font=("Inter", 13), text_color=MUTED, anchor="w")
        self.title_lbl.grid(row=0, column=1, sticky="nw")

        self.pct_lbl = ctk.CTkLabel(self, text="", font=("Inter", 11), text_color=MUTED, anchor="e", width=40)
        self.pct_lbl.grid(row=0, column=2, sticky="ne")

        self.sub_lbl = ctk.CTkLabel(self, text="", font=("Inter", 10), text_color=MUTED, anchor="w", height=14)
        self.sub_lbl.grid(row=1, column=1, columnspan=2, sticky="nw")

        self.bar = ctk.CTkProgressBar(self, height=4, progress_color=ACCENT, fg_color="#1e2330")
        self.bar.set(0)
        self.bar.grid(row=2, column=1, columnspan=2, sticky="ew", pady=(2, 0))
        self.bar.grid_remove()

    def set_active(self, sub: str = ""):
        self.icon_lbl.configure(text=self.ICON_ACTIVE, text_color=ACCENT)
        self.title_lbl.configure(text_color=TEXT)
        self.pct_lbl.configure(text="0%", text_color=ACCENT)
        self.bar.grid()
        if sub: self.sub_lbl.configure(text=sub)

    def set_progress(self, value: float, sub: str = ""):
        self.bar.set(value)
        self.pct_lbl.configure(text=f"{int(value * 100)}%")
        if sub: self.sub_lbl.configure(text=sub)

    def set_done(self):
        self.bar.configure(progress_color=SUCCESS)
        self.bar.set(1.0)
        self.pct_lbl.configure(text="100%", text_color=SUCCESS)
        self.icon_lbl.configure(text=self.ICON_DONE, text_color=SUCCESS)
        self.title_lbl.configure(text_color=SUCCESS)
        self.sub_lbl.configure(text="")

    def set_error(self, msg: str = ""):
        self.bar.configure(progress_color=ERROR)
        self.icon_lbl.configure(text=self.ICON_ERROR, text_color=ERROR)
        self.title_lbl.configure(text_color=ERROR)
        if msg: self.sub_lbl.configure(text=msg, text_color=ERROR)

class AethvionInstaller(ctk.CTk):
    STEPS = [
        "Checking Python Environment",
        "Preparing Download List",
        "Installing Libraries",
        "Setting up Project Folders",
        "Finalizing Settings",
    ]

    def __init__(self):
        super().__init__()
        self.project_root = Path(__file__).parent.parent.parent
        self.setup_dir    = self.project_root / "setup"
        self.logo_path    = self.project_root / "assets" / "aethvion" / "aethvion_logo.png"

        # Window
        W, H = 540, 600
        self.title("Aethvion Suite Setup")
        self._center(W, H)
        self.resizable(False, False)
        
        self._create_gradient_bg(W, H)
        self._build_ui()
        self.after(500, self._start_install)

    def _center(self, w, h):
        self.geometry(f"{w}x{h}+{(self.winfo_screenwidth()-w)//2}+{(self.winfo_screenheight()-h)//2}")

    def _create_gradient_bg(self, w, h):
        img = Image.new("RGB", (w, h), BG_START)
        draw = ImageDraw.Draw(img)
        for i in range(h):
            r1, g1, b1 = int(BG_START[1:3], 16), int(BG_START[3:5], 16), int(BG_START[5:7], 16)
            r2, g2, b2 = int(BG_END[1:3], 16), int(BG_END[3:5], 16), int(BG_END[5:7], 16)
            r = int(r1 + (r2 - r1) * (i / h))
            g = int(g1 + (g2 - g1) * (i / h))
            b = int(b1 + (b2 - b1) * (i / h))
            draw.line([(0, i), (w, i)], fill=(r, g, b))
        self.bg_img = ctk.CTkImage(light_image=img, dark_image=img, size=(w, h))
        ctk.CTkLabel(self, image=self.bg_img, text="").place(x=0, y=0, relwidth=1, relheight=1)

    def _build_ui(self):
        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.pack(fill="both", expand=True, padx=40, pady=(40, 20))

        # Header
        hdr = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        hdr.pack(fill="x")
        
        try:
            pil = Image.open(self.logo_path)
            ratio = 110 / pil.size[0]
            img = ctk.CTkImage(light_image=pil, dark_image=pil, size=(110, int(pil.size[1] * ratio)))
            ctk.CTkLabel(hdr, image=img, text="").pack(anchor="center")
        except:
            ctk.CTkLabel(hdr, text="✦ AETHVION", font=("Inter", 24, "bold"), text_color=ACCENT).pack(anchor="center")

        ctk.CTkLabel(hdr, text="Aethvion Suite Setup", font=("Inter", 22, "bold"), text_color=TEXT).pack(pady=(12, 0))
        ctk.CTkLabel(hdr, text="Local Intelligence Dashboard Deployment", font=("Inter", 12), text_color=MUTED).pack()

        # Step List
        self.scroll_frame = ctk.CTkScrollableFrame(self.main_frame, fg_color="transparent", height=240)
        self.scroll_frame.pack(fill="x", pady=20)

        self.step_rows = []
        for i, title in enumerate(self.STEPS):
            row = StepRow(self.scroll_frame, title)
            row.pack(fill="x", pady=(0, 10))
            self.step_rows.append(row)

        # Foldout Console
        self.console_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.console_frame.pack(fill="x")

        self.console_btn = ctk.CTkButton(self.console_frame, text="View Installation Logs ▼", font=("Inter", 11), fg_color="transparent", text_color=MUTED, hover_color="#1e2330", height=20, command=self._toggle_console)
        self.console_btn.pack(pady=(0, 5))

        self.console_box = ctk.CTkTextbox(self.console_frame, height=0, fg_color="#080a0d", text_color="#a1a1aa", font=("Consolas", 10), border_width=1, border_color=BORDER)
        self.console_box.pack(fill="x")
        self.console_box.configure(state="disabled")

        self.launch_btn = ctk.CTkButton(self.main_frame, text="OPEN DASHBOARD", font=("Inter", 14, "bold"), height=46, fg_color=SUCCESS, hover_color="#059669", command=self._launch)

    def _toggle_console(self):
        if self.console_box.cget("height") == 0:
            self.console_box.configure(height=120)
            self.console_btn.configure(text="Hide Installation Logs ▲")
        else:
            self.console_box.configure(height=0)
            self.console_btn.configure(text="View Installation Logs ▼")

    def log(self, text):
        self.console_box.configure(state="normal")
        self.console_box.insert("end", f"> {text.strip()}\n")
        self.console_box.see("end")
        self.console_box.configure(state="disabled")

    def _ui(self, fn): self.after(0, fn)
    def _step_active(self, idx, sub=""): self._ui(lambda: self.step_rows[idx].set_active(sub))
    def _step_progress(self, idx, val, sub=""): self._ui(lambda: self.step_rows[idx].set_progress(val, sub))
    def _step_done(self, idx): self._ui(lambda: self.step_rows[idx].set_done())
    def _step_error(self, idx, msg=""): self._ui(lambda: self.step_rows[idx].set_error(msg))

    def _start_install(self): threading.Thread(target=self._install_thread, daemon=True).start()

    def _install_thread(self):
        try:
            # Step 1: Environment
            self._step_active(0, "Analyzing host...")
            venv = self.project_root / ".venv"
            if not venv.exists():
                self._step_progress(0, 0.4, "Creating environment...")
                subprocess.run(["python", "-m", "venv", str(venv)], creationflags=subprocess.CREATE_NO_WINDOW)
            self._step_progress(0, 0.8, "Updating tools...")
            subprocess.run([str(venv/"Scripts"/"python.exe"), "-m", "pip", "install", "--upgrade", "pip", "--quiet"], creationflags=subprocess.CREATE_NO_WINDOW)
            self._step_done(0)

            # Step 2 & 3: Libraries
            self._phase_pip(1, 2)

            # Step 4: Folders
            self._step_active(3, "Structuring project directories...")
            subprocess.run(["cmd", "/c", str(self.setup_dir/"setup_directories.bat")], creationflags=subprocess.CREATE_NO_WINDOW)
            self._step_done(3)

            # Step 5: Finalize
            self._step_active(4, "Synchronizing settings...")
            time.sleep(1)
            self._step_done(4)
            
            self._ui(lambda: self.launch_btn.pack(fill="x", pady=20))
        except Exception as e:
            self._ui(lambda m=str(e): self.log(f"Setup Error: {m}"))

    def _phase_pip(self, s1, s2):
        self._step_active(s1, "Gathering package requirements...")
        pip_exe = str(self.project_root/".venv"/"Scripts"/"pip.exe")
        
        proc = subprocess.Popen([pip_exe, "install", "-e", ".[memory]", "--progress-bar", "off"], cwd=str(self.project_root), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, creationflags=subprocess.CREATE_NO_WINDOW)
        
        all_pkgs = []
        installed_count = 0
        current_phase = 1 
        
        for line in iter(proc.stdout.readline, ""):
            line = line.strip()
            if not line: continue
            self._ui(lambda l=line: self.log(l))

            # Detect collection phase
            if "Collecting" in line:
                pkg = line.split("Collecting")[-1].strip().split()[0]
                if pkg not in all_pkgs: all_pkgs.append(pkg)
                self._step_progress(s1, min(0.98, len(all_pkgs)/25), f"Found {pkg}...")
            
            # Transition to installation
            elif "Installing collected packages" in line:
                current_phase = 2
                self._step_done(s1)
                self._step_active(s2, f"Installing {len(all_pkgs)} libraries...")
                # Try to parse the list of packages from the 'Installing collected packages:' line
                list_match = line.split("Installing collected packages:")
                if len(list_match) > 1:
                    # Overwrite all_pkgs with actual final list if possible
                    actual_list = [p.strip() for p in list_match[1].split(",") if p.strip()]
                    if actual_list: all_pkgs = actual_list

            # Track individual installations
            elif current_phase == 2:
                # pip often prints 'Installing xxx' or 'Successfully installed xxx'
                if line.startswith("Installing"):
                    pkg = line.split("Installing")[-1].strip().split()[0]
                    self._step_progress(s2, min(0.99, (installed_count+0.5)/max(len(all_pkgs), 1)), f"Linking {pkg}...")
                elif "Successfully installed" in line:
                    # Count how many packages in this string
                    pkgs_in_line = line.replace("Successfully installed", "").strip().split()
                    installed_count += len(pkgs_in_line)
                    total = max(len(all_pkgs), 1)
                    pct = min(1.0, installed_count / total)
                    self._step_progress(s2, pct, f"Installed {installed_count} of {total} libraries")

        proc.wait()
        self._step_done(s1)
        self._step_done(s2)

    def _launch(self):
        subprocess.Popen([str(self.project_root/"Start_Aethvion.bat")], cwd=str(self.project_root), creationflags=subprocess.CREATE_NEW_CONSOLE)
        self.destroy()
        sys.exit(0)

if __name__ == "__main__":
    AethvionInstaller().mainloop()
