@echo off
title Collaborative Whiteboard - Quick Setup & Build
cd /d "%~dp0"

echo =====================================================================
echo    Collaborative Whiteboard - Automated Project Setup & Build
echo    Full-Stack React 18 + Node.js WebSockets + Canvas 2D + SQLite
echo =====================================================================
echo.

:: 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but was not found.
    echo Please install Node.js (v18 or higher) from https://nodejs.org and rerun this script.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [*] Detected Node.js: %NODE_VERSION%

:: 2. Install Server Dependencies
echo.
echo [*] Installing Node.js backend server dependencies...
cd /d "%~dp0web_whiteboard\server"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install server dependencies.
    pause
    exit /b 1
)

:: 3. Install Client Dependencies & Build React Production Assets
echo.
echo [*] Installing React 18 client dependencies...
cd /d "%~dp0web_whiteboard\client"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install client dependencies.
    pause
    exit /b 1
)

echo.
echo [*] Building React 18 production bundle via Vite...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Vite build failed.
    pause
    exit /b 1
)

:: 4. Compile Desktop Application Executable
cd /d "%~dp0"
echo.
echo [*] Compiling Native Windows Desktop Executable (Collaborative_Whiteboard.exe)...
if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /win32icon:app.ico /out:Collaborative_Whiteboard.exe desktop_app\Program.cs
    if exist "Collaborative_Whiteboard.exe" (
        echo [SUCCESS] Collaborative_Whiteboard.exe compiled successfully!
    )
) else (
    echo [INFO] csc.exe not found. Desktop app will run via Collaborative_Whiteboard.bat / Collaborative_Whiteboard.vbs.
)

:: 5. Create Desktop Shortcut
echo.
echo [*] Generating desktop shortcut...
call "%~dp0Create_Desktop_Shortcut.bat"

echo.
echo =====================================================================
echo   SETUP COMPLETE!
echo   You can now launch the application by double-clicking:
echo   - Desktop Shortcut: "Collaborative Whiteboard.lnk" on your Desktop
echo   - Executable:       Collaborative_Whiteboard.exe
echo   - Batch Launcher:   Collaborative_Whiteboard.bat
echo =====================================================================
echo.
pause

