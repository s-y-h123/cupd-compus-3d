@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required. Install Node.js 24, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\vinext" (
  echo Installing the project's existing dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo Building the latest campus page...
call npm.cmd run build:pages
if errorlevel 1 goto failed

for %%P in (4300 4301 4302 4303) do (
  set "CAMPUS_PORT=%%P"
  call :probe
  if not errorlevel 1 goto open
  call :available
  if not errorlevel 1 (
    start "CUPB campus server - keep open" cmd /k "set PORT=%%P&& npm.cmd run preview"
    timeout /t 3 /nobreak >nul
    call :probe
    if not errorlevel 1 goto open
  )
)
echo The preview server did not start. Check its window for details.
pause
exit /b 1

:open
start "" "http://127.0.0.1:%CAMPUS_PORT%/cupd-compus-3d/"
exit /b 0

:failed
echo The build failed. Read the error above, then run this file again.
pause
exit /b 1

:probe
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%CAMPUS_PORT%/cupd-compus-3d/data/models.json' -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'models/cupb/') { exit 0 } } catch {}; exit 1" >nul 2>nul
exit /b %errorlevel%

:available
powershell.exe -NoProfile -Command "try { $client = [System.Net.Sockets.TcpClient]::new('127.0.0.1', %CAMPUS_PORT%); $client.Dispose(); exit 1 } catch { exit 0 }" >nul 2>nul
exit /b %errorlevel%
