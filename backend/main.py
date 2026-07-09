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

from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import MEMORYVAULT_HOST, MEMORYVAULT_PORT, MEMORYVAULT_TOKEN, print_config
from backend.models import NewEntry, Entry, PartialEntry, BucketEnum, BucketModel, ChatRequest, ChatResponse
from backend.store import EntryStore
from backend.llm import summarize_backlog, evaluate_and_generate, evaluate_messages, classify_and_tag_entry

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


CHAT_SYSTEM_PROMPT = (
    "You are MemoryVault's personal offline productivity and knowledge companion. "
    "Answer from the user's saved goals, notes, tasks, issues, and prior turns when relevant. "
    "Be concise, practical, and cite source entries with Obsidian-style links such as [[#0012]]. "
    "If the available notes do not answer the question, say so and offer a useful next step."
)

CHAT_STOPWORDS = {
    "the", "and", "or", "to", "for", "in", "is", "it", "of", "on", "with", "a", "an",
    "what", "how", "why", "where", "who", "show", "get", "find", "search", "list"
}

def _compact_text(value: Optional[str], limit: int = 900) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."

def _clean_search_query(user_query: str) -> str:
    words = [w.strip("?,.!'\"()[]{}").lower() for w in user_query.split()]
    clean_words = [w for w in words if w and w not in CHAT_STOPWORDS and len(w) > 2]
    return " ".join(clean_words)

def _entry_to_context_dict(entry: Any) -> Dict[str, Any]:
    if isinstance(entry, dict):
        return {
            "id": entry.get("id"),
            "bucket": entry.get("bucket"),
            "title": entry.get("title"),
            "tags": entry.get("tags") or "",
            "description": _compact_text(entry.get("description")),
            "timestamp": entry.get("timestamp"),
            "status": entry.get("status")
        }
    return {
        "id": entry.id,
        "bucket": entry.bucket.value if hasattr(entry.bucket, "value") else entry.bucket,
        "title": entry.title,
        "tags": entry.tags or "",
        "description": _compact_text(entry.description),
        "timestamp": entry.timestamp,
        "status": entry.status
    }

def _referenced_context_ids(turns: List[Dict[str, Any]]) -> List[str]:
    ids = []
    for turn in turns:
        for entry_id in turn.get("context_entry_ids") or []:
            if entry_id not in ids:
                ids.append(entry_id)
    return ids

def _retrieve_chat_context(user_query: str, recent_turns: List[Dict[str, Any]], mode: str = "hybrid") -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}

    def add_entry(entry: Any):
        item = _entry_to_context_dict(entry)
        entry_id = item.get("id")
        if entry_id and entry_id not in merged:
            merged[entry_id] = item

    search_str = _clean_search_query(user_query)
    normalized_mode = (mode or "hybrid").lower()

    if search_str and normalized_mode in {"hybrid", "semantic"}:
        try:
            if store.has_embeddings():
                for entry in store.search_entries(search_str, mode="semantic")[:8]:
                    add_entry(entry)
        except Exception as sem_err:
            print(f"[Chat Retrieval] Semantic search skipped: {sem_err}")

    if search_str and normalized_mode in {"hybrid", "keyword"}:
        try:
            for entry in store.search_entries(search_str, sort_by="relevance")[:10]:
                add_entry(entry)
        except Exception as search_err:
            print(f"[Chat Retrieval] Keyword search skipped: {search_err}")

    all_entries = store.export_all_entries()
    entries_by_id = {e.get("id"): e for e in all_entries if e.get("id")}
    for entry_id in _referenced_context_ids(recent_turns):
        if entry_id in entries_by_id:
            add_entry(entries_by_id[entry_id])

    for entry in all_entries[-6:]:
        add_entry(entry)

    return list(merged.values())[:15]

def _build_session_summary(turns: List[Dict[str, Any]], limit: int = 1200) -> str:
    lines = []
    for turn in turns[-8:]:
        role = turn.get("role", "user")
        content = _compact_text(turn.get("content"), 220)
        if content:
            lines.append(f"{role}: {content}")
    return _compact_text("\n".join(lines), limit)

def _build_chat_messages(
    user_query: str,
    conversation: Dict[str, Any],
    recent_turns: List[Dict[str, Any]],
    context_entries: List[Dict[str, Any]]
) -> List[Dict[str, str]]:
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    summary = (conversation or {}).get("summary") or ""
    if summary:
        messages.append({"role": "system", "content": f"Conversation summary:\n{summary}"})
    if context_entries:
        messages.append({
            "role": "system",
            "content": "Relevant MemoryVault entries as compact JSON:\n" + json.dumps(context_entries, ensure_ascii=False)
        })
    for turn in recent_turns[-8:]:
        role = turn.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = _compact_text(turn.get("content"), 1200)
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_query})
    return messages

@app.post("/chat", response_model=ChatResponse)
def chat_reason(query: ChatRequest):
    """
    Session-aware natural-language lookup chat for tasks, goals, notes, or issues.
    """
    user_query = query.query.strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="Query text cannot be empty")

    try:
        conversation_id = store.ensure_conversation(query.conversation_id, title=user_query[:80])
        conversation = store.get_conversation(conversation_id) or {}
        recent_turns = store.get_recent_turns(conversation_id, limit=8)
        context_entries = _retrieve_chat_context(user_query, recent_turns, query.mode or "hybrid")
        context_entry_ids = [entry["id"] for entry in context_entries if entry.get("id")]
        messages = _build_chat_messages(user_query, conversation, recent_turns, context_entries)

        response, model_used, latency = evaluate_messages(
            messages,
            store,
            trace_label=f"conversation:{conversation_id} context:{','.join(context_entry_ids)}"
        )

        store.add_conversation_turn(conversation_id, "user", user_query, context_entry_ids)
        store.add_conversation_turn(conversation_id, "assistant", response, context_entry_ids, model_used, latency)

        turn_count = store.get_conversation_turn_count(conversation_id)
        if turn_count >= 12 and turn_count % 12 == 0:
            store.update_conversation_summary(conversation_id, _build_session_summary(store.get_recent_turns(conversation_id, limit=12)))

        return ChatResponse(
            response=response,
            conversation_id=conversation_id,
            context_entry_ids=context_entry_ids,
            model_used=model_used,
            latency_ms=latency
        )
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
