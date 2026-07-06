#!/bin/bash
# MemoryVault - Visual Background Async Launcher

# Resolve current folder directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "🔍 Checking for stale processes on port 8000..."
if command -v lsof &> /dev/null; then
    # lsof -ti:8000 returns the PIDs listening on port 8000
    PID=$(lsof -ti:8000)
    if [ -n "$PID" ]; then
        echo "🛑 Killing stale process(es) ($PID) running on port 8000..."
        kill -9 $PID
        sleep 1
    fi
fi

echo "============================================="
echo "📁 Root Directory: $DIR"
echo "🚀 Spawning FastAPI uvicorn daemon in separate terminal..."
echo "============================================="

# Identify running platform and launch separate terminal
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Instead of launching a separate physical terminal window which can be unreliable,
    # run as a background process and log to server.log
    .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload > server.log 2>&1 &
    echo "✅ Started uvicorn as a background process on port 8000."
    echo "📜 Logs are being written to server.log"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$DIR' && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -title "MemoryVault Server" -hold -e "cd '$DIR' && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload" &
    else
        # Fallback background runner
        .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload > server.log 2>&1 &
        echo "⚠️ No UI emulator found. Started uvicorn as background process feeding server.log."
    fi
    echo "✅ Started Linux environment terminal launcher."
else
    # General shell background failovler
    .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload > server.log 2>&1 &
    echo "✅ Started fallback background server process feeding server.log."
fi

# Wait brief duration for server bindings
echo "🌐 Launching local browser client..."
sleep 1.2

# Open default browser
if command -v open &> /dev/null; then
    open "http://localhost:8000/"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:8000/"
else
    echo "👉 Browse http://localhost:8000/ to start note-taking!"
fi
