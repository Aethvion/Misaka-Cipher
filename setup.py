"""
Misaka Cipher - Setup Utility
Automates dependency installation, environment configuration, and directory initialization.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def print_banner():
    print("\n" + "=" * 60)
    print("      MISAKA CIPHER - SYSTEM SETUP & INITIALIZATION")
    print("=" * 60 + "\n")

def check_python_version():
    print("[1/5] Checking Python version...")
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 10):
        print(f"❌ Error: Python 3.10+ is required. Current version: {major}.{minor}")
        sys.exit(1)
    print(f"✅ Python {major}.{minor} detected.")

def install_dependencies():
    print("\n[2/5] Installing dependencies from requirements.txt...")
    req_file = Path("requirements.txt")
    if not req_file.exists():
        print("❌ Error: requirements.txt not found.")
        sys.exit(1)
    
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
        print("✅ Dependencies installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error: Failed to install dependencies: {e}")
        sys.exit(1)

def setup_environment():
    print("\n[3/5] Configuring environment variables...")
    env_file = Path(".env")
    example_file = Path(".env.example")
    
    if env_file.exists():
        print("ℹ️  .env file already exists. Skipping.")
    elif example_file.exists():
        shutil.copy(example_file, env_file)
        print("✅ Created .env from .env.example. PLEASE EDIT IT TO ADD YOUR API KEYS!")
    else:
        # Create a basic .env if neither exists
        with open(env_file, 'w') as f:
            f.write("# Misaka Cipher Environment Variables\n")
            f.write("GOOGLE_AI_API_KEY=your_key_here\n")
            f.write("OPENAI_API_KEY=your_key_here\n")
            f.write("GROK_API_KEY=your_key_here\n")
        print("✅ Created basic .env file. PLEASE EDIT IT TO ADD YOUR API KEYS!")

def initialize_directories():
    print("\n[4/5] Initializing system directories...")
    dirs = [
        "logs",
        "outputfiles",
        "memory/storage/workspaces",
        "memory/storage/graphs",
        "tools/generated",
        "web/static/assets"
    ]
    
    for d in dirs:
        p = Path(d)
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)
            print(f"✅ Created directory: {d}")
        else:
            print(f"ℹ️  Directory exists: {d}")

def finalize_setup():
    print("\n[5/5] Finalizing setup...")
    print("\n" + "-" * 60)
    print("SETUP COMPLETE!")
    print("-" * 60)
    print("\nNext Steps:")
    print("1. Edit the .env file and add your API keys (Google AI is recommended).")
    print("2. Run 'python main.py' to launch the web dashboard.")
    print("3. Or run 'python main.py --cli' for the interactive terminal.")
    print("\nWelcome to the Nexus, Operator.\n")

if __name__ == "__main__":
    try:
        print_banner()
        check_python_version()
        install_dependencies()
        setup_environment()
        initialize_directories()
        finalize_setup()
    except KeyboardInterrupt:
        print("\n\nSetup aborted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error during setup: {e}")
        sys.exit(1)
