@echo off
SETLOCAL EnableDelayedExpansion

:: Window always-open guarantee
if not defined AETHVION_HW_LAUNCHED (
    set AETHVION_HW_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)
TITLE Aethvion Hardware Info

:: Figure out the directory where this script actually lives
SET HW_MODULE_DIR=%~dp0

:: Go up 2 levels: apps/hardwareinfo -> apps -> Aethvion-Suite
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

:: Switch working directory to the project root
cd /d "%ROOT_DIR%"
SET PYTHONPATH=%ROOT_DIR%

echo.
echo          AETHVION HARDWARE INFO
echo.
echo [INFO] Running under Aethvion Suite root: %ROOT_DIR%
echo.

:: --- 1. Python Check ------------------------------------------
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Install Python 3.10+ from https://python.org
    goto :FAIL
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK]  Python %PY_VER% detected.

:: --- 2. Virtual environment ------------------------------------
if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        goto :FAIL
    )
    echo [OK]  Virtual environment created.
) else (
    echo [OK]  Virtual environment found.
)

call ".venv\Scripts\activate.bat"

:: --- 3. Install Core Dependencies ------------------------------
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing core dependencies from pyproject.toml...
    python -m pip install --upgrade pip
    pip install -e ".[memory]"
    if %errorlevel% neq 0 (
        echo [WARN]  Core dependency installation reported an issue.
    ) else (
        echo [OK]  Core dependencies installed.
    )
) else (
    echo [OK]  Core dependencies verified.
)

:: --- 4. Install Hardware Info dependencies ---------------------
echo [SETUP] Verifying hardware monitoring dependencies...
pip install psutil py-cpuinfo GPUtil --quiet
if %errorlevel% neq 0 (
    echo [WARN]  Some hardware dependencies failed - app will still run with reduced info.
) else (
    echo [OK]  Hardware dependencies ready.
)

:: --- 5. Environment file ---------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SETUP] Created .env from .env.example.
    ) else (
        echo [WARN]  No .env file found.
    )
) else (
    echo [OK]  .env found.
)

:: --- 6. Launch -------------------------------------------------
echo.
echo [START] Launching Aethvion Hardware Info...
echo         Dashboard -^> http://localhost:8084
echo         Press CTRL+C to stop.
echo.

python apps\hardwareinfo\hardware_server.py
set MAIN_EXIT=%errorlevel%

:: --- 7. Result -------------------------------------------------
if %MAIN_EXIT% neq 0 (
    echo.
    echo [ERROR] Hardware Info crashed (exit code %MAIN_EXIT%).
    echo         Scroll up to find the error, then fix it and re-run.
    goto :FAIL
)
goto :END

:FAIL
echo.
echo ============================================================
echo  Something went wrong. Read the error above, then close.
echo ============================================================
echo.
pause
EXIT /B 1

:END
pause
