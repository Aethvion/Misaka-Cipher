@echo off
:: ============================================================
::  AETHVION SUITE — Directory Setup Helper
::  Creates all necessary data subfolders for the suite.
:: ============================================================

set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"

echo.
echo [1/3] VERIFYING DIRECTORY STRUCTURE...

:: ── Apps ─────────────────────────────────────────────────────
echo [SETUP] Configuring application storage...
if not exist "data\apps"                   mkdir "data\apps"
if not exist "data\apps\arena"             mkdir "data\apps\arena"
if not exist "data\apps\audio"             mkdir "data\apps\audio"
if not exist "data\apps\code"              mkdir "data\apps\code"
if not exist "data\apps\code\projects"     mkdir "data\apps\code\projects"
if not exist "data\apps\driveinfo"         mkdir "data\apps\driveinfo"
if not exist "data\apps\finance"           mkdir "data\apps\finance"
if not exist "data\apps\games"             mkdir "data\apps\games"
if not exist "data\apps\hardwareinfo"      mkdir "data\apps\hardwareinfo"
if not exist "data\apps\nexus"             mkdir "data\apps\nexus"
if not exist "data\apps\photo"             mkdir "data\apps\photo"
if not exist "data\apps\tracking"          mkdir "data\apps\tracking"
if not exist "data\apps\vtuber"            mkdir "data\apps\vtuber"
if not exist "data\apps\vtuber\models"     mkdir "data\apps\vtuber\models"
if not exist "data\apps\vtuber\files"      mkdir "data\apps\vtuber\files"

:: ── Config ───────────────────────────────────────────────────
echo [SETUP] Configuring system config...
if not exist "data\config"                 mkdir "data\config"

:: ── Logs ─────────────────────────────────────────────────────
echo [SETUP] Configuring unified logging...
if not exist "data\logs"                   mkdir "data\logs"
if not exist "data\logs\usage"             mkdir "data\logs\usage"
if not exist "data\logs\notifications"     mkdir "data\logs\notifications"

:: ── Companions ───────────────────────────────────────────────
echo [SETUP] Configuring companions...
if not exist "data\companions"             mkdir "data\companions"
if not exist "data\companions\personas"    mkdir "data\companions\personas"
if not exist "data\companions\personas\misakacipher"              mkdir "data\companions\personas\misakacipher"
if not exist "data\companions\personas\misakacipher\threads"      mkdir "data\companions\personas\misakacipher\threads"
if not exist "data\companions\knowledge"                          mkdir "data\companions\knowledge"
if not exist "data\companions\memory"                             mkdir "data\companions\memory"

:: ── Modes ────────────────────────────────────────────────────
echo [SETUP] Configuring dashboard modes...
if not exist "data\modes"                          mkdir "data\modes"
if not exist "data\modes\chat"                     mkdir "data\modes\chat"
if not exist "data\modes\agents"                   mkdir "data\modes\agents"
if not exist "data\modes\agent_corp"               mkdir "data\modes\agent_corp"
if not exist "data\modes\ai_conversations"         mkdir "data\modes\ai_conversations"
if not exist "data\modes\advanced_ai_conversations" mkdir "data\modes\advanced_ai_conversations"
if not exist "data\modes\explained"                mkdir "data\modes\explained"
if not exist "data\modes\workspaces"               mkdir "data\modes\workspaces"

:: ── System ───────────────────────────────────────────────────
echo [SETUP] Configuring runtime system state...
if not exist "data\system"                 mkdir "data\system"

:: ── Default Output ───────────────────────────────────────────
echo [SETUP] Configuring default outputs...
if not exist "data\default_output"             mkdir "data\default_output"
if not exist "data\default_output\images"      mkdir "data\default_output\images"
if not exist "data\default_output\models"      mkdir "data\default_output\models"
if not exist "data\default_output\documents"   mkdir "data\default_output\documents"

:: ── Local Models ─────────────────────────────────────────────
echo [SETUP] Configuring local model storage...
if not exist "localmodels"                       mkdir "localmodels"
if not exist "localmodels\gguf"                  mkdir "localmodels\gguf"
if not exist "localmodels\audio"                 mkdir "localmodels\audio"
if not exist "localmodels\audio\kokoro"          mkdir "localmodels\audio\kokoro"
if not exist "localmodels\audio\xtts-v2"         mkdir "localmodels\audio\xtts-v2"
if not exist "localmodels\audio\whisper"         mkdir "localmodels\audio\whisper"
if not exist "localmodels\audio\voices"          mkdir "localmodels\audio\voices"

echo [OK]    Directory structure ready.
echo.
