"""
Entry point redirector — the real module is now at core/cli.py.
Run via:   python -m core.cli
Or use:    Start_Misaka_Cipher.bat --cli
"""
import sys
import subprocess
sys.exit(subprocess.call([sys.executable, "-m", "core.cli"] + sys.argv[1:]))
