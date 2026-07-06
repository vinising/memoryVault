#!/bin/bash
# MemoryVault - Visual Background Async Launcher

# Resolve current folder directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

HOST="${MEMORYVAULT_HOST:-0.0.0.0}"
PORT="${MEMORYVAULT_PORT:-8000}"

echo "🔍 Checking for stale processes on port $PORT..."
if command -v lsof &> /dev/null; then
    # lsof -ti:$PORT returns the PIDs listening on the selected port
    PID=$(lsof -ti:"$PORT")
    if [ -n "$PID" ]; then
        echo "🛑 Killing stale process(es) ($PID) running on port $PORT..."
        kill -9 $PID
        sleep 1
    fi
fi

echo "============================================="
echo "📁 Root Directory: $DIR"
echo "🚀 Spawning FastAPI uvicorn daemon in separate terminal..."
echo "🌐 Binding server to $HOST:$PORT"
echo "============================================="

# Identify running platform and launch separate terminal
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Instead of launching a separate physical terminal window which can be unreliable,
    # run as a background process and log to server.log
    .venv/bin/python -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload > server.log 2>&1 &
    echo "✅ Started uvicorn as a background process on port $PORT."
    echo "📜 Logs are being written to server.log"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$DIR' && MEMORYVAULT_HOST='$HOST' MEMORYVAULT_PORT='$PORT' .venv/bin/python -m uvicorn backend.main:app --host '$HOST' --port '$PORT' --reload; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -title "MemoryVault Server" -hold -e "cd '$DIR' && MEMORYVAULT_HOST='$HOST' MEMORYVAULT_PORT='$PORT' .venv/bin/python -m uvicorn backend.main:app --host '$HOST' --port '$PORT' --reload" &
    else
        # Fallback background runner
        .venv/bin/python -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload > server.log 2>&1 &
        echo "⚠️ No UI emulator found. Started uvicorn as background process feeding server.log."
    fi
    echo "✅ Started Linux environment terminal launcher."
else
    # General shell background failovler
    .venv/bin/python -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload > server.log 2>&1 &
    echo "✅ Started fallback background server process feeding server.log."
fi

# Wait brief duration for server bindings
echo "🌐 Launching local browser client..."
sleep 1.2

# Open default browser
if command -v open &> /dev/null; then
    open "http://localhost:$PORT/"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$PORT/"
else
    echo "👉 Browse http://localhost:$PORT/ to start note-taking!"
fi
