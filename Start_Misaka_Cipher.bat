@echo off
SETLOCAL

:: Window always-open guarantee:
:: When double-clicked, MISAKA_LAUNCHED is undefined.
:: We re-launch this same script inside `cmd /k` which holds the window open
:: until the user explicitly closes it — regardless of errors or crashes.
if not defined MISAKA_LAUNCHED (
    set MISAKA_LAUNCHED=1
    cmd /k ""%~f0""
    exit
)
TITLE Misaka Cipher — Aethvion Systems
SET PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo.
echo ============================================================
echo          AETHVION — MISAKA CIPHER
echo ============================================================
echo.

:: ── 1. Python check ──────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Install Python 3.10+ from https://python.org
    goto :FAIL
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK]  Python %PY_VER% detected.

:: ── 2. Virtual environment ────────────────────────────────────
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

:: ── 3. Install / verify dependencies ─────────────────────────
python -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing dependencies from pyproject.toml...
    python -m pip install --upgrade pip
    pip install -e ".[memory]"
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Dependency installation failed — see output above.
        echo         Common fix: make sure Python 3.10+ is in PATH and try again.
        goto :FAIL
    )
    echo [OK]  Dependencies installed.
) else (
    echo [OK]  Dependencies verified.
)

:: ── 4. Environment file ───────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SETUP] Created .env from .env.example — add your API keys before continuing.
        echo.
        echo         Edit .env now then re-run this file to start Misaka Cipher.
        pause & exit /b 0
    ) else (
        echo [WARN]  No .env file found. Create one with your API keys.
    )
) else (
    echo [OK]  .env found.
)

:: ── 5. Required directories ───────────────────────────────────
if not exist "data"                              mkdir data
if not exist "data\logs"                         mkdir data\logs
if not exist "data\outputfiles"                  mkdir data\outputfiles
if not exist "data\memory"                       mkdir data\memory
if not exist "data\memory\storage"               mkdir data\memory\storage
if not exist "data\memory\storage\workspaces"    mkdir data\memory\storage\workspaces
if not exist "data\memory\storage\graphs"        mkdir data\memory\storage\graphs
if not exist "tools\generated"                   mkdir tools\generated

:: ── 6. Launch ─────────────────────────────────────────────────
echo.
echo [START] Launching Misaka Cipher...
echo         Dashboard → http://localhost:8000
echo         Press CTRL+C to stop.
echo.

python -m core.main %*
set MAIN_EXIT=%errorlevel%

:: ── 7. Result ────────────────────────────────────────────────
if %MAIN_EXIT% neq 0 (
    echo.
    echo [ERROR] Misaka Cipher crashed (exit code %MAIN_EXIT%).
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
