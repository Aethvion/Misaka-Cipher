@echo off
setlocal EnableDelayedExpansion

:: ── 1. Configuration ────────────────────────────────────────
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: ── 2. Installation Check ──────────────────────────────────
:: We check for core dependencies. If any fail, we need the installer.
set "ALREADY_INSTALLED=1"

if not exist ".venv\Scripts\python.exe" set "ALREADY_INSTALLED=0"
if not exist "core\launcher.py" set "ALREADY_INSTALLED=0"

if "!ALREADY_INSTALLED!"=="1" (
    ".venv\Scripts\python.exe" -c "import fastapi, customtkinter, PIL" >nul 2>&1
    if !errorlevel! neq 0 set "ALREADY_INSTALLED=0"
)

:: ── 3. Optimized Execution Path ────────────────────────────
if "!ALREADY_INSTALLED!"=="1" (
    :: Silent Background Launch
    start "" /b ".venv\Scripts\pythonw.exe" core\launcher.py --consumer --browser app
    exit
) else (
    :: Launch Orchestrator Silently
    start "" /b setup\installer\installer.bat
    exit
)
