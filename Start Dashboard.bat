@echo off
title TrueSpot Dashboard Launcher
cd /d "%~dp0"

echo.
echo  =========================================
echo    TrueSpot Dashboard - Starting up...
echo  =========================================
echo.

:: If server is already running just open the browser
powershell -Command "try { Invoke-WebRequest http://localhost:3001/api/v1/health -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" > nul 2>&1
if %errorlevel% == 0 (
    echo  Server already running. Opening browser...
    start "" "http://localhost:3001/dashboard/carvision/locationhistory"
    goto :done
)

:: Start the Next.js server in a separate minimized window
start "TrueSpot Server" /min cmd /c "npm run dev"

echo  Waiting for server to be ready...

:poll
timeout /t 2 /nobreak > nul
powershell -Command "try { Invoke-WebRequest http://localhost:3001/api/v1/health -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" > nul 2>&1
if %errorlevel% neq 0 goto poll

:: Open browser once ready
start "" "http://localhost:3001/dashboard/carvision/locationhistory"

echo.
echo  Dashboard is open in your browser!
echo.
echo  To stop the server: find "TrueSpot Server" in
echo  your taskbar and close that window.
echo.

:done
timeout /t 6 /nobreak > nul
