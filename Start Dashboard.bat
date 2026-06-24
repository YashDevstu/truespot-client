@echo off
title TrueSpot Dashboard Launcher
cd /d "%~dp0"

echo.
echo  =========================================
echo    TrueSpot Dashboard - Starting up...
echo  =========================================
echo.

:: Run npm install if node_modules is missing (first time setup)
if not exist "node_modules\" (
    echo  First-time setup: installing dependencies...
    echo  This will take a minute, please wait...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: npm install failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo  Setup complete!
    echo.
)

:: If server is already running just open the browser
powershell -Command "try { Invoke-WebRequest http://localhost:3001/api/v1/health -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" > nul 2>&1
if %errorlevel% == 0 (
    echo  Server already running. Opening browser...
    start "" "http://localhost:3001/dashboard/carvision/locationhistory"
    goto :done
)

:: Start the Next.js server on a fixed port in a separate minimized window
start "TrueSpot Server" /min cmd /c "set PORT=3001 && npm run dev"

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
