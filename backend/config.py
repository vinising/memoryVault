import os
from pathlib import Path
from dotenv import load_dotenv
from platformdirs import user_data_dir

# Load environment variables if a .env file exists
load_dotenv()

# Application Name for platformdirs
APP_NAME = "MemoryVault"
APP_AUTHOR = "MemoryVault"

# Get portable user configuration/data directory
default_data_dir = Path(user_data_dir(APP_NAME, APP_AUTHOR))
default_data_dir.mkdir(parents=True, exist_ok=True)

# Portability DB Path
MEMORYVAULT_DB_PATH = os.environ.get(
    "MEMORYVAULT_DB_PATH", 
    str(default_data_dir / "data.db")
)

# Server Bindings
# Bound to 127.0.0.1 by default for single-user security. Outward exposure requires 0.0.0.0.
MEMORYVAULT_HOST = os.environ.get("MEMORYVAULT_HOST", "127.0.0.1")
MEMORYVAULT_PORT = int(os.environ.get("MEMORYVAULT_PORT", "8000"))

# Simple Token Security (Optional, for remote setup/sync boundaries)
MEMORYVAULT_TOKEN = os.environ.get("MEMORYVAULT_TOKEN", "")

# LLM Providers Configuration
# Default is local Ollama endpoint
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4")

# Local High-Reasoning Proxy Endpoint (Port 8080)
LLM_PROXY_HOST = os.environ.get("LLM_PROXY_HOST", "http://localhost:8080")

# Print settings summary
def print_config():
    print("--- MemoryVault Configuration ---")
    print(f"Database Path: {MEMORYVAULT_DB_PATH}")
    print(f"Server Host:   {MEMORYVAULT_HOST}")
    print(f"Server Port:   {MEMORYVAULT_PORT}")
    print(f"Ollama Endpoint: {OLLAMA_HOST} (model: {OLLAMA_MODEL})")
    print(f"LLM Proxy Endpoint: {LLM_PROXY_HOST}")
    print(f"Token Security: {'Enabled' if MEMORYVAULT_TOKEN else 'Disabled'}")
    print("---------------------------------")
