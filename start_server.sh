#!/bin/bash
# MemoryVault - Visual Background Async Launcher

# Resolve current folder directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "============================================="
echo "📁 Root Directory: $DIR"
echo "🚀 Spawning FastAPI uvicorn daemon in separate terminal..."
echo "============================================="

# Identify running platform and launch separate terminal
if [[ "$OSTYPE" == "darwin"* ]]; then
    # MacOS custom terminal window allocation
    osascript -e "tell application \"Terminal\" to do script \"cd '$DIR' && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000\""
    echo "✅ Created separate physical macOS Terminal window running uvicorn on port 8000."
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$DIR' && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -title "MemoryVault Server" -hold -e "cd '$DIR' && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000" &
    else
        # Fallback background runner
        .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 > server.log 2>&1 &
        echo "⚠️ No UI emulator found. Started uvicorn as background process feeding server.log."
    fi
    echo "✅ Started Linux environment terminal launcher."
else
    # General shell background failovler
    .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 > server.log 2>&1 &
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
