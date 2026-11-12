@echo off
title Collaborative Whiteboard System App
cd /d "%~dp0"

echo ===================================================
echo     Launching Collaborative Whiteboard App
echo ===================================================

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but was not found.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Run via silent VBScript launcher to prevent unwanted terminal windows
start "" wscript.exe "%~dp0Collaborative_Whiteboard.vbs"
exit

