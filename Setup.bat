@echo off
TITLE Misaka Cipher - Forge Initialization
SET PROJECT_DIR=%~dp0
cd /d %PROJECT_DIR%

echo ====================================================
echo           AETHVION - MISAKA CIPHER SETUP
echo ====================================================
echo.

:: 1. Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from python.org
    pause
    exit /b
)

:: 2. Create Virtual Environment
if not exist venv (
    echo [SYSTEM] Forging new Virtual Environment...
    python -m venv venv
) else (
    echo [SYSTEM] Virtual Environment already exists. Skipping creation.
)

:: 3. Activate and Install
echo [SYSTEM] Activating environment and installing dependencies...
call venv\Scripts\activate

echo [SYSTEM] Upgrading pip...
python -m pip install --upgrade pip

if exist requirements.txt (
    echo [SYSTEM] Installing requirements from requirements.txt...
    pip install -r requirements.txt
) else (
    echo [WARNING] requirements.txt not found! Skipping install.
)

echo.
echo ====================================================
echo    SETUP COMPLETE - MISAKA IS READY FOR RESEARCH
echo ====================================================
echo.
echo You can now run Misaka using Run_Misaka.bat
pause