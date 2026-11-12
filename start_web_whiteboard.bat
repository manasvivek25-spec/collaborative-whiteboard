@echo off
title Collaborative Whiteboard Server (Web & Desktop)
cd /d "%~dp0\web_whiteboard"

echo ======================================================================
echo    STARTING COLLABORATIVE WHITEBOARD FULL-STACK SERVER
echo ======================================================================
echo.
echo Local Access URL:      http://localhost:5000
echo Network / Wi-Fi Access: Available to all devices on the same network
echo Database:              server/data/whiteboard_data.db (SQLite)
echo.
echo Press Ctrl+C anytime to stop the server.
echo.

echo Starting server and launching Whiteboard App...
start "" http://localhost:5000
node server/server.js
pause
