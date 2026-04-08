@echo off
SETLOCAL EnableDelayedExpansion

:: Window always-open guarantee
if not defined AETHVION_KANBAN_LAUNCHED (
    set AETHVION_KANBAN_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)
TITLE Aethvion Kanban

:: Figure out the directory where this script lives
SET KANBAN_MODULE_DIR=%~dp0

:: Root of the repository (two levels up from apps\kanban\)
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

:: Switch working directory to project root
cd /d "%ROOT_DIR%"
SET PYTHONPATH=%ROOT_DIR%

echo.
echo          AETHVION KANBAN
echo.
echo [INFO] Running under Aethvion Suite root: %ROOT_DIR%
echo.

:: --- 1. Python Check ------------------------------------------
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    goto :FAIL
)

:: --- 2. Virtual environment ------------------------------------
if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment...
    python -m venv .venv
)

call ".venv\Scripts\activate.bat"

:: --- 3. Dependencies ------------------------------------------
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing dependencies...
    pip install fastapi uvicorn pydantic
)

:: --- 4. Create data directory --------------------------------
if not exist "data\kanban" (
    mkdir "data\kanban"
)

:: --- 5. Launch -----------------------------------------------
echo [START] Launching Aethvion Kanban...
echo         Viewer -> http://localhost:8090
echo         Press CTRL+C to stop.
echo.

python apps\kanban\kanban_server.py
set MAIN_EXIT=%errorlevel%

if %MAIN_EXIT% neq 0 (
    echo.
    echo [ERROR] Kanban server crashed (exit code %MAIN_EXIT%).
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
