@echo off
setlocal
cd /d "%~dp0"
set "PROJECT_ROOT=%cd%\..\.."

:: Try to hide the transition prompt by minimizing or just silent start
if not exist "%PROJECT_ROOT%\.venv\Scripts\python.exe" (
    :: First run: we show a tiny bit of CMD to explain the bootstrap
    echo [System] Initializing Environment Bootstrap...
    python -m venv "%PROJECT_ROOT%\.venv"
    "%PROJECT_ROOT%\.venv\Scripts\python.exe" -m pip install customtkinter Pillow
)

:: Launch GUI Silently (using pythonw to detach)
start "" /b "%PROJECT_ROOT%\.venv\Scripts\pythonw.exe" installer.py %*

exit
