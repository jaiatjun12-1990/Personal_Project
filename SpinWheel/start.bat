@echo off
REM ============================================================
REM  SET Chennai Outing 2026 - Spin Wheel : START
REM  Double-click this file to launch the app.
REM ============================================================
title SET Chennai Outing 2026 - Spin Wheel

REM Move to the folder this script lives in
cd /d "%~dp0"

REM Check Node is available
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js was not found on your PATH.
  echo  Please install Node.js from https://nodejs.org/ ^(v16 or newer^) and try again.
  echo.
  pause
  exit /b 1
)

REM Install dependencies the first time only
if not exist "node_modules" (
  echo.
  echo  Installing dependencies for the first time, please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. See the messages above.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  ============================================================
echo    SET Chennai Outing 2026 - Spin Wheel is starting...
echo    Open your browser at:  http://localhost:3000
echo.
echo    Share on the same Wi-Fi using your PC's IP, e.g.
echo    http://192.168.1.25:3000
echo.
echo    Keep this window OPEN during the event.
echo    Close it or run stop.bat to stop the app.
echo  ============================================================
echo.

REM Open the browser automatically after a short delay
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"

REM Run the server (this window stays open with the server running)
node server.js

echo.
echo  Server stopped.
pause
