"""
Entry point redirector — the real module is now at core/main.py.
Run via:   python -m core.main
Or use:    Start_Misaka_Cipher.bat
"""
import sys
import subprocess
sys.exit(subprocess.call([sys.executable, "-m", "core.main"] + sys.argv[1:]))
