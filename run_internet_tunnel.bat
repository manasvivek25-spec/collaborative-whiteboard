@echo off
title 1-Click Public Internet Tunnel for Mobile + Wi-Fi
cd /d "%~dp0"

echo ======================================================================
echo    1-CLICK PUBLIC INTERNET TUNNEL FOR COLLABORATIVE WHITEBOARD
echo ======================================================================
echo.
echo This generates a FREE public HTTPS URL so devices on:
echo   - Mobile Cellular Networks (4G/5G)
echo   - Home or College Wi-Fi
echo can connect to your whiteboard session simultaneously from anywhere!
echo.
echo NOTE: Make sure start_web_whiteboard.bat is already running on port 5000.
echo.
echo Starting free cloud tunnel on port 5000...
echo.

npx localtunnel --port 5000
pause

