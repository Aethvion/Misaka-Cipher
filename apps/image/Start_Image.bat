@echo off
set TITLE=Aethvion Photo Service
title %TITLE%
echo Starting %TITLE%...

:: Navigate to the directory of this script
cd /d "%~dp0"

:: Check for environment variables or use defaults
if "%PHOTO_PORT%"=="" set PHOTO_PORT=8083

:: Run the server
python image_server.py
pause
