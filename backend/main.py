import os
import sys
import importlib.util
import shutil
import uuid
import json
from pathlib import Path

# Verify backend directory on sys path for relative importing robustness
if str(Path(__file__).parent.parent) not in sys.path:
    sys.path.append(str(Path(__file__).parent.parent))

from typing import List, Optional, Dict

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import MEMORYVAULT_HOST, MEMORYVAULT_PORT, MEMORYVAULT_TOKEN, print_config
from backend.models import NewEntry, Entry, PartialEntry, BucketEnum, BucketModel
from backend.store import EntryStore
from backend.llm import summarize_backlog, evaluate_and_generate, classify_and_tag_entry

app = FastAPI(
    title="MemoryVault API",
    description="Your agile-style backlog, stored as a simple chat.",
    version="1.0.0"
)

# Enable CORS for total mobile webview, WAN hosting, or Cordova portability
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect default thread-local EntryStore
store = EntryStore()

# Dependency for Token Security
def verify_token(authorization: Optional[str] = Header(None)):
    if MEMORYVAULT_TOKEN:
        if not authorization or authorization != f"Bearer {MEMORYVAULT_TOKEN}":
            raise HTTPException(status_code=401, detail="Unauthorized - Invalid Token")
    return True

# --- API ROUTES ---

@app.post("/add", response_model=Entry, dependencies=[Depends(verify_token)])
def add_new_entry(entry: NewEntry, background_tasks: BackgroundTasks):
    try:
        # If bucket is not specified, run smart AI classification & semantic tagging
        if not entry.bucket:
            # Reconstruct raw input from whatever user sent
            raw_text = entry.title
            if entry.description:
                raw_text += f"\nDescription: {entry.description}"
            if entry.tags:
                raw_text += f"\nTags: {entry.tags}"
                
            ai_data = classify_and_tag_entry(raw_text, store)
            
            entry.bucket = BucketEnum(ai_data["bucket"])
            entry.title = ai_data["title"]
            entry.description = f"{ai_data['description']}\n\n**Original Note:**\n{raw_text}"
            
            # Merge user manual tags and AI generated semantic tags cleanly
            user_tags = [t.strip() for t in (entry.tags or "").split(",") if t.strip()]
            ai_tags = [t.strip() for t in ai_data["tags"].split(",") if t.strip()]
            all_tags = list(dict.fromkeys(user_tags + ai_tags)) # preserve order and remove duplicates
            entry.tags = ",".join(all_tags)
            
        saved_entry = store.add_entry(entry)

        # Generate and persist semantic embedding in the background (non-blocking, best-effort)
        def _embed_entry():
            try:
                from backend.llm import embed_text
                text = f"{saved_entry.title} {saved_entry.tags or ''} {saved_entry.description or ''}"
                vector = embed_text(text)
                if vector:
                    store.update_embedding(saved_entry.id, vector)
            except Exception as embed_err:
                print(f"[Embedding] Background embed failed for {saved_entry.id}: {embed_err}")

        background_tasks.add_task(_embed_entry)
        return saved_entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insert error: {str(e)}")


@app.get("/search", response_model=List[Entry], dependencies=[Depends(verify_token)])
def search_entries(q: str = "", sort_by: str = "recency", mode: str = "keyword"):
    return store.search_entries(q, sort_by=sort_by, mode=mode)


@app.get("/buckets", response_model=List[BucketModel], dependencies=[Depends(verify_token)])
def get_buckets():
    return store.get_buckets()


@app.post("/buckets/add", dependencies=[Depends(verify_token)])
def add_bucket(bucket: BucketModel):
    success = store.add_custom_bucket(bucket.name, bucket.color, bucket.template)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to register custom bucket.")
    return {"status": "success", "name": bucket.name}


@app.delete("/buckets/{name}", dependencies=[Depends(verify_token)])
def delete_bucket(name: str):
    success = store.delete_custom_bucket(name)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete default or non-existent bucket.")
    return {"status": "success", "name": name, "deleted": True}


@app.get("/item/{item_id}", response_model=Entry, dependencies=[Depends(verify_token)])
def get_single_entry(item_id: str):
    entry = store.get_entry(item_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Backlog entry not found")
    return entry


@app.get("/item/{item_id}/subtasks", response_model=List[Entry], dependencies=[Depends(verify_token)])
def get_entry_subtasks(item_id: str):
    entry = store.get_entry(item_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Parent entry not found")
    return store.get_subtasks(item_id)


@app.patch("/item/{item_id}", response_model=Entry, dependencies=[Depends(verify_token)])
def patch_entry(item_id: str, patch: PartialEntry):
    entry = store.update_entry(item_id, patch)
    if not entry:
        raise HTTPException(status_code=404, detail="Backlog entry not found")
    return entry


@app.delete("/item/{item_id}", dependencies=[Depends(verify_token)])
def delete_entry(item_id: str):
    success = store.delete_entry(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Backlog entry not found")
    return {"status": "success", "id": item_id, "deleted": True}


@app.get("/export", dependencies=[Depends(verify_token)])
def export_all():
    try:
        entries = store.export_all_entries()
        filename = "memoryvault-export.json"
        
        # We can directly return the JSON model configuration list
        return JSONResponse(
            content=entries,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload", dependencies=[Depends(verify_token)])
async def upload_file_attachment(file: UploadFile = File(...)):
    try:
        file_id = str(uuid.uuid4())
        suffix = Path(file.filename).suffix if file.filename else ""
        safe_filename = f"{file_id}{suffix}"
        
        dest_path = attachments_dir / safe_filename
        
        with dest_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = dest_path.stat().st_size
        url = f"/attachments/{safe_filename}"
        
        return {
            "id": file_id,
            "filename": file.filename or "unknown",
            "url": url,
            "mime_type": file.content_type or "application/octet-stream",
            "size": file_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload error: {str(e)}")

@app.delete("/upload/{file_id}", dependencies=[Depends(verify_token)])
def delete_file_attachment(file_id: str):
    try:
        # Search for any file in attachments_dir matching the exact uuid
        for file_path in attachments_dir.iterdir():
            if file_path.is_file() and file_path.stem == file_id:
                file_path.unlink()
                return {"status": "success", "id": file_id, "deleted": True}
        raise HTTPException(status_code=404, detail="File attachment not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File deletion error: {str(e)}")

@app.post("/import", dependencies=[Depends(verify_token)])
async def import_all(file: UploadFile = File(...)):
    try:
        content = await file.read()
        entries_list = json_data = []
        try:
            import json
            entries_list = json.loads(content.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON file format")

        if not isinstance(entries_list, list):
            raise HTTPException(status_code=400, detail="Import payload must be a JSON array of entries")

        store.import_all_entries(entries_list)
        return {"status": "success", "imported_count": len(entries_list)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/summarize")
def summarize():
    """
    Summarizes the entire state of the current backlog.
    Sends standard data elements direct to local Gemma 4 routing.
    """
    try:
        import json
        entries = store.export_all_entries()
        entries_str = json.dumps(entries[:60]) # Cap at recent 60 items so context is brief and quick
        summary, model_used, latency = summarize_backlog(entries_str, store)
        return {
            "summary": summary,
            "model_used": model_used,
            "latency_ms": latency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
def chat_reason(query: Dict[str, str]):
    """
    General natural-language lookup chat. Ask questions about tasks, goals, notes, or issues.
    """
    user_query = query.get("query", "").strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="Query text cannot be empty")
        
    try:
        import json
        # RAG Search: Query the database FTS5 for user words to pull highly relevant context
        words = [w.strip("?,.!'\"()[]{}").lower() for w in user_query.split()]
        stopwords = {"the", "and", "or", "to", "for", "in", "is", "it", "of", "on", "with", "a", "an", "what", "how", "why", "where", "who", "show", "get", "find", "search", "list"}
        clean_words = [w for w in words if w and w not in stopwords and len(w) > 2]
        
        candidates = []
        if clean_words:
            search_str = " ".join(clean_words)
            candidates = store.search_entries(search_str)
            
        all_entries = store.export_all_entries()
        recent_entries = all_entries[-15:] if len(all_entries) > 15 else all_entries
        
        merged_map = {}
        for e in recent_entries:
            merged_map[e["id"]] = e
            
        for c in candidates:
            c_dict = {
                "id": c.id,
                "bucket": c.bucket.value if hasattr(c.bucket, "value") else c.bucket,
                "title": c.title,
                "tags": c.tags,
                "description": c.description,
                "timestamp": c.timestamp,
                "status": c.status
            }
            merged_map[c.id] = c_dict
            
        context_entries = list(merged_map.values())
        context_entries.sort(key=lambda x: x.get("id", ""))
        
        if len(context_entries) > 40:
            context_entries = context_entries[:40]
        
        # Design detailed task prompt
        prompt = (
            "You are MemoryVault's personal offline productivity and knowledge companion chatbot.\n"
            "An executive, researcher, or generalist user is asking you questions regarding their goals, notes, tasks, and issues.\n"
            "Analyze and use the database context below to respond concisely relative to their ask:\n\n"
            f"Context Database Data:\n{json.dumps(context_entries)}\n\n"
            f"User Question: {user_query}\n\n"
            "Instructions:\n"
            "- Be precise, helpful, and use short, tidy bullet points.\n"
            "- Incorporate hyper-references using Obsidian double-bracket links e.g. [[#0012]] where relevant so the user can easily trace which entries you are referencing.\n"
            "- If the answer cannot be answered directly from the notes context, provide professional and constructive suggestions, noting that you could not find the exact answer in their notes."
        )
        response, model_used, latency = evaluate_and_generate(prompt, store)
        return {
            "response": response,
            "model_used": model_used,
            "latency_ms": latency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/metrics", dependencies=[Depends(verify_token)])
def get_metrics():
    return store.get_backlog_metrics()


@app.get("/traces", dependencies=[Depends(verify_token)])
def get_traces():
    return {"traces": store.get_llm_traces(limit=25)}


# --- PLUGIN MANAGER ---
def setup_plugins():
    plugins_dir = Path(__file__).parent / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    
    # Let's create an example dynamic CSV exporter plugin automatically!
    create_test_plugin_if_empty(plugins_dir)

    for py_file in plugins_dir.glob("*.py"):
        if py_file.name == "__init__.py":
            continue
        try:
            module_name = f"backend.plugins.{py_file.stem}"
            # Standard specification loading for runtime modules
            spec = importlib.util.spec_from_file_location(module_name, py_file)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = module
                spec.loader.exec_module(module)
                
                # If module exposes registration function, invoke it
                if hasattr(module, "register_plugin"):
                    module.register_plugin(app)
                    print(f"[Plugins] Plugin successfully registered: {py_file.name}")
        except Exception as e:
            print(f"[Plugins] Failed to initialize plugin {py_file.name}: {str(e)}")


def create_test_plugin_if_empty(plugins_dir: Path):
    csv_plugin_file = plugins_dir / "csv_export.py"
    if not csv_plugin_file.exists():
        content = """from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from backend.store import EntryStore

def register_plugin(app: FastAPI):
    @app.get("/plugin/csv-export")
    def export_csv():
        \"\"\"
        Dynamically registered CSV export helper plugin.
        \"\"\"
        store = EntryStore()
        entries = store.export_all_entries()
        
        csv_lines = ["id,bucket,title,tags,status,timestamp"]
        for entry in entries:
            # Clean elements for safe csv formats
            title = entry.get('title', '').replace('"', '""')
            tags = entry.get('tags', '').replace('"', '""')
            csv_lines.append(f'"{entry.get("id")}","{entry.get("bucket")}","{title}","{tags}","{entry.get("status")}","{entry.get("timestamp")}"')
            
        csv_data = "\\n".join(csv_lines)
        return PlainTextResponse(
            content=csv_data,
            headers={
                "Content-Disposition": "attachment; filename=memoryvault-export.csv"
            }
        )
"""
        csv_plugin_file.write_text(content, encoding="utf-8")


setup_plugins()

# --- WEB / STATIC FILE MOUNTING ---
frontend_path = Path(__file__).parent.parent / "frontend"
frontend_path.mkdir(parents=True, exist_ok=True)

attachments_dir = Path(__file__).parent.parent / "data" / "attachments"
attachments_dir.mkdir(parents=True, exist_ok=True)

# Mount index file directly to root
@app.get("/")
def get_browser_ui():
    index_file = frontend_path / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse(
        content={"message": "MemoryVault server running! frontend/index.html is missing."},
        status_code=200
    )

# Mount frontend/attachments folders statically to support static files
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
app.mount("/attachments", StaticFiles(directory=str(attachments_dir)), name="attachments")

if __name__ == "__main__":
    import uvicorn
    print_config()
    uvicorn.run("backend.main:app", host=MEMORYVAULT_HOST, port=MEMORYVAULT_PORT, reload=False)
