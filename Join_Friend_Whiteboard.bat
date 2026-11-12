@echo off
title Connect to Host Whiteboard (LAN / Wi-Fi)
cd /d "%~dp0"

echo ======================================================================
echo    CONNECT TO A COLLABORATIVE WHITEBOARD SESSION
echo ======================================================================
echo.
echo Ask your friend (the host) for their Host LAN IP address.
echo (It is displayed at the top of their Whiteboard screen, e.g. 10.36.112.55)
echo.
set /p HOST_IP="Enter Host IP address (e.g. 10.36.112.55): "

if "%HOST_IP%"=="" (
    echo [ERROR] No IP address entered.
    pause
    exit /b 1
)

:: Ensure port 5000 is included
echo %HOST_IP% | findstr /c:":" >nul
if %errorlevel% neq 0 (
    set "HOST_URL=http://%HOST_IP%:5000"
) else (
    set "HOST_URL=http://%HOST_IP%"
)

echo.
echo Connecting to %HOST_URL% ...
if exist "%~dp0Collaborative_Whiteboard.exe" (
    start "" "%~dp0Collaborative_Whiteboard.exe" "%HOST_URL%"
) else (
    start "" "%HOST_URL%"
)
exit /b 0
