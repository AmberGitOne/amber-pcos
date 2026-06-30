@echo off
title Amber LifeSciences - Commercial Operating System
cd /d "%~dp0"

rem Locate Node.js (PATH first, then default install location)
set "NODE=node"
where node >nul 2>nul || set "NODE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE%" (
  where node >nul 2>nul || (
    echo.
    echo  ERROR: Node.js was not found.
    echo  Install it from https://nodejs.org  then run this file again.
    echo.
    pause
    exit /b 1
  )
)

echo ============================================================
echo   Amber LifeSciences - Pharma Commercial Operating System
echo   Server: http://localhost:4321
echo   Login:  admin@amber.test  /  amber123
echo ============================================================
echo.
echo  Keep this window OPEN while you use the app.
echo  Close it (or press Ctrl+C) to stop the server.
echo.

rem Open the browser after a short delay (separate window), so the page
rem loads only once the server is ready. 'explorer' opens the default browser.
start "" /min cmd /c "ping 127.0.0.1 -n 3 >nul & explorer http://localhost:4321"

rem Run the server in THIS window. Closing the window stops the server.
"%NODE%" server\server.js

echo.
echo  Server stopped. Press any key to close.
pause >nul
