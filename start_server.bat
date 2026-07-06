@echo off
:: MemoryVault Windows Background Async Launcher

title MemoryVault Launcher

if "%MEMORYVAULT_HOST%"=="" set "MEMORYVAULT_HOST=0.0.0.0"
if "%MEMORYVAULT_PORT%"=="" set "MEMORYVAULT_PORT=8000"

echo =============================================
echo Checking for stale processes on port %MEMORYVAULT_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%MEMORYVAULT_PORT%') do (
    if not "%%a"=="0" (
        echo Killing stale process %%a running on port %MEMORYVAULT_PORT%...
        taskkill /F /PID %%a 2>nul
    )
)

echo Resolving current folder directory...
echo Spawning FastAPI uvicorn daemon in separate CMD window...
echo Binding server to %MEMORYVAULT_HOST%:%MEMORYVAULT_PORT%
echo =============================================

:: Open new command window referencing current venv and run uvicorn
start cmd.exe /k "cd /d %~dp0 && set MEMORYVAULT_HOST=%MEMORYVAULT_HOST% && set MEMORYVAULT_PORT=%MEMORYVAULT_PORT% && .venv\\Scripts\\python.exe -m uvicorn backend.main:app --host %MEMORYVAULT_HOST% --port %MEMORYVAULT_PORT% --reload"

echo ✅ Created separate cmd window running uvicorn on port %MEMORYVAULT_PORT%.
echo 🌐 Launching local browser client...

timeout /t 2 /nobreak >null

start http://localhost:%MEMORYVAULT_PORT%/
