@echo off
:: MemoryVault Windows Background Async Launcher

title MemoryVault Launcher

echo =============================================
echo Checking for stale processes on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    if not "%%a"=="0" (
        echo Killing stale process %%a running on port 8000...
        taskkill /F /PID %%a 2>nul
    )
)

echo Resolving current folder directory...
echo Spawning FastAPI uvicorn daemon in separate CMD window...
echo =============================================

:: Open new command window referencing current venv and run uvicorn
start cmd.exe /k "cd /d %~dp0 && .venv\\Scripts\\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

echo ✅ Created separate cmd window running uvicorn on port 8000.
echo 🌐 Launching local browser client...

timeout /t 2 /nobreak >null

start http://localhost:8000/
