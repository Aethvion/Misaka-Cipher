@echo off
SETLOCAL EnableDelayedExpansion

:: Window always-open guarantee
if not defined AETHVION_DRIVEINFO_LAUNCHED (
    set AETHVION_DRIVEINFO_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)
TITLE Aethvion Drive Info

:: Figure out the directory where this script lives
SET DRIVEINFO_MODULE_DIR=%~dp0

:: Root of the repository (two levels up from apps\driveinfo\)
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

:: Switch working directory to project root
cd /d "%ROOT_DIR%"
SET PYTHONPATH=%ROOT_DIR%

echo.
echo          AETHVION DRIVE INFO
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

:: --- 3. Core dependencies -------------------------------------
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing core dependencies...
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

:: --- 4. Drive Info specific deps (only uvicorn needed) --------
python -c "import uvicorn" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing uvicorn...
    pip install uvicorn
) else (
    echo [OK]  uvicorn verified.
)

:: --- 5. .env file ---------------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SETUP] Created .env from .env.example
    )
) else (
    echo [OK]  .env found.
)

:: --- 6. Create data directory --------------------------------
if not exist "data\driveinfo" (
    mkdir "data\driveinfo"
    echo [SETUP] Created data\driveinfo directory.
) else (
    echo [OK]  data\driveinfo directory found.
)

:: --- 7. Launch -----------------------------------------------
echo [START] Launching Aethvion Drive Info...
echo         Viewer -^> http://localhost:8084
echo         Scans  -^> data\driveinfo\*.eathscan
echo         Press CTRL+C to stop.
echo.

"%ROOT_DIR%\.venv\Scripts\python.exe" apps\driveinfo\driveinfo_server.py
set MAIN_EXIT=%errorlevel%

:: --- 8. Result -----------------------------------------------
if %MAIN_EXIT% neq 0 (
    echo.
    echo [ERROR] Drive Info server crashed (exit code %MAIN_EXIT%).
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
