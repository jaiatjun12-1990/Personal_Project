@echo off
REM ============================================================
REM  SET Chennai Outing 2026 - Spin Wheel : STOP
REM  Double-click this file to stop the app running on port 3000.
REM ============================================================
title Stop Spin Wheel

set "PORT=3000"
set "FOUND="

echo.
echo  Looking for the Spin Wheel server on port %PORT%...
echo.

REM Find the process ID(s) listening on the port and kill them
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  echo  Stopping process with PID %%P ...
  taskkill /F /PID %%P >nul 2>nul
)

if not defined FOUND (
  echo  No server was running on port %PORT%.
) else (
  echo.
  echo  Spin Wheel server stopped.
)

echo.
pause
