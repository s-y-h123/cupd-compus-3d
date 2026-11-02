@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-campus.ps1"
if errorlevel 1 (
  echo.
  echo Failed to open the campus page. See the message above.
  pause
  exit /b 1
)
exit /b 0
