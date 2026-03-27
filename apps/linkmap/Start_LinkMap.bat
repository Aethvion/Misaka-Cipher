@echo off
SETLOCAL EnableDelayedExpansion

:: Window always-open guarantee
if not defined AETHVION_LINKMAP_LAUNCHED (
    set AETHVION_LINKMAP_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)
TITLE Aethvion LinkMap

:: Root of the repository (two levels up from apps\linkmap\)
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"

:: Switch working directory to project root
cd /d "%ROOT_DIR%"
SET PYTHONPATH=%ROOT_DIR%

echo.
echo          AETHVION LINKMAP
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
if %errorlevel% neq 0 pip install fastapi

python -c "import uvicorn" >nul 2>&1
if %errorlevel% neq 0 pip install uvicorn

:: --- 4. Launch -----------------------------------------------
echo [START] Launching Aethvion LinkMap...
echo         Viewer -> http://localhost:8089
echo         Press CTRL+C to stop.
echo.

"%ROOT_DIR%\.venv\Scripts\python.exe" apps\linkmap\linkmap_server.py
set MAIN_EXIT=%errorlevel%

if %errorlevel% neq 0 goto :FAIL
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
