@echo off
SETLOCAL EnableDelayedExpansion

:: Window always-open guarantee — re-launch inside cmd /k so the window stays
:: open even if the script crashes, letting you read the error.
if not defined AETHVION_LAUNCHED (
    set AETHVION_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)

TITLE Aethvion Suite — Dev Launcher
SET PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo.
echo ============================================================
echo   AETHVION SUITE  ^|  DEVELOPER MODE
echo   Each app server gets its own visible console window.
echo   Dashboard opens in a standard browser tab.
echo   Press Ctrl+C here to stop the entire suite.
echo ============================================================
echo.

:: ── 1. Python check ─────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Install Python 3.10+ from https://python.org
    goto :FAIL
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK]   Python %PY_VER% detected.

:: ── 2. Virtual environment ───────────────────────────────────
if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment…
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        goto :FAIL
    )
    echo [OK]   Virtual environment created.
) else (
    echo [OK]   Virtual environment found.
)
call ".venv\Scripts\activate.bat"

:: ── 3. Dependencies ──────────────────────────────────────────
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing dependencies from pyproject.toml…
    python -m pip install --upgrade pip
    pip install -e ".[memory]"
    if %errorlevel% neq 0 (
        python -c "import fastapi; import pydantic" >clog.tmp 2>&1
        if !errorlevel! neq 0 (
            echo [ERROR] Core dependency check failed:
            type clog.tmp
            del clog.tmp
            goto :FAIL
        )
        del clog.tmp
        echo [OK]   Core dependencies verified despite pip warnings.
    ) else (
        echo [OK]   Dependencies installed.
    )
) else (
    echo [OK]   Dependencies verified.
)

:: ── 4. .env file ─────────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SETUP] Created .env from .env.example
    ) else (
        echo [WARN]  No .env file found. Add your API keys in the dashboard.
    )
) else (
    echo [OK]   .env found.
)

:: ── 5. Required directories ──────────────────────────────────
if not exist "data\core"            mkdir data\core
if not exist "data\core\logs"       mkdir data\core\logs
if not exist "data\core\config"     mkdir data\core\config
if not exist "data\core\system"     mkdir data\core\system
if not exist "data\ai"              mkdir data\ai
if not exist "data\ai\history"      mkdir data\ai\history
if not exist "data\ai\memory"       mkdir data\ai\memory
if not exist "data\ai\outputfiles"  mkdir data\ai\outputfiles
if not exist "data\code"            mkdir data\code
if not exist "data\code\projects"   mkdir data\code\projects
if not exist "data\vtuber"          mkdir data\vtuber
if not exist "data\tracking"        mkdir data\tracking

:: ── 6. Launch (dev mode — visible consoles, web browser tab) ─
echo.
echo [START] Launching Aethvion Suite in Dev Mode…
echo         Dashboard  -^> http://localhost:8080
echo         Ctrl+C here stops everything.
echo.

python core\launcher.py --dev --browser web %*
set MAIN_EXIT=%errorlevel%

if %MAIN_EXIT% neq 0 (
    echo.
    echo [ERROR] Launcher exited with code %MAIN_EXIT%.
    goto :FAIL
)
goto :END

:FAIL
echo.
echo ============================================================
echo  Something went wrong — read the error above, then close.
echo ============================================================
echo.
pause
exit /b 1

:END
pause
