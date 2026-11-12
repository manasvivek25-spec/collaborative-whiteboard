@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Creating Collaborative Whiteboard Desktop Shortcut
echo ===================================================

set "TARGET=%~dp0Collaborative_Whiteboard.vbs"
set "SHORTCUT=%USERPROFILE%\Desktop\Collaborative Whiteboard.lnk"
set "ICON=%~dp0web_whiteboard\client\public\icon-192.png"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%SHORTCUT%'); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\"%TARGET%\"'; " ^
  "$s.WorkingDirectory = '%~dp0'; " ^
  "$s.Description = 'Collaborative Whiteboard - Real-Time Offline and LAN Workspace'; " ^
  "$s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo [SUCCESS] Desktop Shortcut created successfully at:
    echo   "%SHORTCUT%"
    echo.
    echo You and your partners can now launch the Whiteboard directly from your Windows Desktop!
) else (
    echo.
    echo [!] Could not create desktop shortcut automatically. You can right-click Collaborative_Whiteboard.vbs and choose "Send to -> Desktop (create shortcut)".
)

echo.
pause

