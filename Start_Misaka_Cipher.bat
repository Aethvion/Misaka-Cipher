@echo off
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
    pause & exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK]  Python %PY_VER% detected.

:: ── 2. Virtual environment ────────────────────────────────────
if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause & exit /b 1
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
    python -m pip install --upgrade pip --quiet
    pip install -e ".[memory]" --quiet
    if %errorlevel% neq 0 (
        echo [ERROR] Dependency installation failed.
        echo         Run:  pip install -e ".[memory]"  manually to see errors.
        pause & exit /b 1
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
if not exist "logs"                           mkdir logs
if not exist "outputfiles"                    mkdir outputfiles
if not exist "memory\storage\workspaces"      mkdir memory\storage\workspaces
if not exist "memory\storage\graphs"          mkdir memory\storage\graphs
if not exist "tools\generated"                mkdir tools\generated

:: ── 6. Launch ─────────────────────────────────────────────────
echo.
echo [START] Launching Misaka Cipher...
echo         Dashboard → http://localhost:8000
echo         Press CTRL+C to stop.
echo.

python -m core.main %*

:: ── 7. Crash guard ────────────────────────────────────────────
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Misaka Cipher encountered a fatal error (exit code %errorlevel%).
    pause
)
