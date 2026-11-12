@echo off
title Collaborative Whiteboard Desktop App
cd /d "%~dp0"

echo ===================================================
echo     Launching Collaborative Whiteboard App
echo ===================================================

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but was not found.
    echo Please install Node.js (LTS version) from https://nodejs.org
    pause
    exit /b 1
)

:: Launch desktop application executable if present
if exist "%~dp0Collaborative_Whiteboard.exe" (
    start "" "%~dp0Collaborative_Whiteboard.exe"
    exit /b 0
)

:: Fallback to silent VBScript launcher
start "" wscript.exe "%~dp0Collaborative_Whiteboard.vbs"
exit /b 0
