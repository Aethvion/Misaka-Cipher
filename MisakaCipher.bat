@echo off
TITLE Misaka Cipher - Aethvion Systems
:: Get the directory of the batch file itself
SET PROJECT_DIR=%~dp0
cd /d %PROJECT_DIR%

echo [SYSTEM] Initializing Misaka Cipher...
echo [SYSTEM] Directory: %PROJECT_DIR%

:: Check if a virtual environment exists (Optional but recommended)
IF EXIST venv\Scripts\activate (
    echo [SYSTEM] Activating Virtual Environment...
    call venv\Scripts\activate
) ELSE (
    echo [WARNING] No venv found. Running with global Python.
)

:: Start the program
echo [SYSTEM] Starting Misaka...
python main.py

:: Keep the window open if the program crashes so you can see the error
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Misaka encountered a critical failure.
    pause
)