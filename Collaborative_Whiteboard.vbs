' Collaborative Whiteboard - Silent Native Desktop App Launcher
' Starts the background server silently (no black console window) and opens the standalone app window.

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Current directory
strCurrentDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if node is available
On Error Resume Next
Set objExec = objShell.Exec("node -v")
If Err.Number <> 0 Then
    MsgBox "Node.js was not found on your system. Please install Node.js from https://nodejs.org to run the whiteboard.", vbCritical, "Collaborative Whiteboard"
    WScript.Quit
End If
On Error GoTo 0

' Ensure client build exists
strDistPath = strCurrentDir & "\web_whiteboard\client\dist\index.html"
If Not objFSO.FileExists(strDistPath) Then
    objShell.CurrentDirectory = strCurrentDir & "\web_whiteboard\client"
    objShell.Run "cmd /c npm run build", 0, True
End If

' Start the Node.js server silently (window style 0 = hidden)
strServerPath = strCurrentDir & "\web_whiteboard\server\server.js"
If objFSO.FileExists(strServerPath) Then
    objShell.CurrentDirectory = strCurrentDir & "\web_whiteboard\server"
    ' Check if server is already running on port 5000
    Set objHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    bRunning = False
    On Error Resume Next
    objHttp.open "GET", "http://localhost:5000/api/network-info", False
    objHttp.setTimeouts 500, 500, 500, 500
    objHttp.send
    If objHttp.Status = 200 Then
        bRunning = True
    End If
    On Error GoTo 0

    If Not bRunning Then
        objShell.Run "cmd /c node server.js", 0, False
        WScript.Sleep 1500
    End If
Else
    MsgBox "Server file not found at: " & strServerPath, vbCritical, "Collaborative Whiteboard"
    WScript.Quit
End If

' Launch as Standalone Desktop App Window (Frameless / borderless native window without URL bar)
strEdgePath = objShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
strEdgePath64 = objShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
strChromePath = objShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe")
strChromePath32 = objShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
strAppProfile = objShell.ExpandEnvironmentStrings("%TEMP%\CollaborativeWhiteboardAppProfile")

If objFSO.FileExists(strEdgePath) Then
    objShell.Run """" & strEdgePath & """ --app=http://localhost:5000 --window-size=1360,860 --user-data-dir=""" & strAppProfile & """", 1, False
ElseIf objFSO.FileExists(strEdgePath64) Then
    objShell.Run """" & strEdgePath64 & """ --app=http://localhost:5000 --window-size=1360,860 --user-data-dir=""" & strAppProfile & """", 1, False
ElseIf objFSO.FileExists(strChromePath) Then
    objShell.Run """" & strChromePath & """ --app=http://localhost:5000 --window-size=1360,860 --user-data-dir=""" & strAppProfile & """", 1, False
ElseIf objFSO.FileExists(strChromePath32) Then
    objShell.Run """" & strChromePath32 & """ --app=http://localhost:5000 --window-size=1360,860 --user-data-dir=""" & strAppProfile & """", 1, False
Else
    ' Fallback to default browser
    objShell.Run "http://localhost:5000", 1, False
End If
