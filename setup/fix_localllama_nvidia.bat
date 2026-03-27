@echo off
SETLOCAL EnableDelayedExpansion
:: ============================================================
::  AETHVION SUITE — NVIDIA GPU Local Model Fix
:: ============================================================
SET PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"

echo ============================================================
echo   ENABLE NVIDIA GPU ACCELERATION FOR LOCAL MODELS
echo ============================================================
echo.

:: 1. Check Virtual Environment
if not exist ".venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found. Please run Start_Aethvion.bat first.
    pause
    exit /b 1
)
call ".venv\Scripts\activate.bat"

:: 2. Pre-flight Check: CUDA Toolkit
echo [CHECK] Looking for NVIDIA CUDA Toolkit...
nvcc --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] CUDA Toolkit compiler (nvcc) not found in PATH!
    echo To compile GPU acceleration, you must install the NVIDIA CUDA Toolkit.
    echo Without it, the installation will fail with a massive wall of red text.
    echo.
    choice /M "Do you want to attempt the installation anyway?"
    if errorlevel 2 exit /b
) else (
    echo [OK] CUDA Toolkit found.
)

:: 3. Compile and Install
echo.
echo [SETUP] Compiling llama-cpp-python for NVIDIA GPUs...
echo This may take 5 to 10 minutes. Please wait...
echo.

set CMAKE_ARGS=-DGGML_CUDA=on
pip install llama-cpp-python --no-cache-dir --force-reinstall

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Local models are now configured to use your NVIDIA GPU!
) else (
    echo.
    echo [ERROR] Compilation failed. 
    echo Ensure you have "Desktop development with C++" installed via Visual Studio Installer.
)
echo.
pause