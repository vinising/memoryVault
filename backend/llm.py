import time
import httpx
from typing import Optional, Tuple, Dict, Any, List
from backend.config import OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_TIMEOUT_SECONDS, LLM_PROXY_HOST, LLM_PROXY_TIMEOUT_SECONDS
from backend.models import LLMTrace
from backend.store import EntryStore

def _messages_to_prompt(messages: List[Dict[str, str]]) -> str:
    return "\n\n".join(
        f"{str(message.get('role', 'user')).upper()}: {str(message.get('content', '')).strip()}"
        for message in messages
        if str(message.get("content", "")).strip()
    )

def evaluate_and_generate(prompt: str, store: EntryStore) -> Tuple[str, str, int]:
    """
    Core LLM router with fallback execution.
    Queries local Ollama (gemma4) first. If Ollama is down/times out or evaluates that
    the prompt deserves higher reasoning (e.g., contains complex analytical asks),
    it fails over to the configured hosted-model proxy at Port 8080.
    
    Returns:
        (response_text, model_used, latency_ms)
    """
    start_time = time.perf_counter()
    model_used = f"ollama/{OLLAMA_MODEL}"
    status = "success"
    response_text = ""
    
    # Simple rule-based prompt routing/classification as a secure first tier:
    # If a prompt requests complex code or structural optimization templates,
    # route to the hosted proxy instead of local Ollama.
    force_proxy = False
    complex_triggers = ["architecture diagram", "database setup script", "generate code", "deploy kubernetes", "refactor api"]
    if any(trigger in prompt.lower() for trigger in complex_triggers):
        force_proxy = True
        print("[LLM Router] Complex directive detected. Routing to hosted proxy on 8080.")

    if not force_proxy:
        try:
            # Query local Ollama Gemma 4
            url = f"{OLLAMA_HOST}/api/generate"
            payload = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3
                }
            }
            with httpx.Client(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    response_text = data.get("response", "").strip()
                    
                    # Deep check: does the returned response advise delegation?
                    if "requires specialized reasoning" in response_text.lower() or "delegate to high-reasoning" in response_text.lower():
                        print("[LLM Router] local model requested delegation. Re-routing to hosted proxy on 8080.")
                        force_proxy = True
                    else:
                        latency_ms = int((time.perf_counter() - start_time) * 1000)
                        # Log success trace locally
                        store.add_llm_trace(LLMTrace(
                            prompt=prompt,
                            response=response_text,
                            model_used=model_used,
                            latency_ms=latency_ms,
                            status=status
                        ))
                        return response_text, model_used, latency_ms
                else:
                    print(f"[LLM Router] Ollama returned non-200 code: {res.status_code}. Executing fallback.")
                    force_proxy = True
        except (httpx.ConnectError, httpx.TimeoutException, Exception) as e:
            print(f"[LLM Router] Ollama is offline or timed out: {str(e)}. Pivoting to hosted proxy on 8080.")
            force_proxy = True

    # --- HOSTED FALLBACK PATHWAY: Port 8080 Proxy ---
    if force_proxy:
        model_used = "hosted-proxy/8080"
        proxy_api_url = f"{LLM_PROXY_HOST}/v1/chat/completions"
        alternative_api_url = f"{LLM_PROXY_HOST}/api/generate" # Supports secondary port mappings too
        
        try:
            # Plan A: Try OpenAI standard API format to hosted proxy/8080
            payload_openai = {
                "model": "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": "You are a professional software architect assistance agent inside MemoryVault."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.5
            }
            with httpx.Client(timeout=LLM_PROXY_TIMEOUT_SECONDS) as client:
                res = client.post(proxy_api_url, json=payload_openai)
                if res.status_code == 200:
                    data = res.json()
                    response_text = data["choices"][0]["message"]["content"].strip()
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    store.add_llm_trace(LLMTrace(
                        prompt=prompt,
                        response=response_text,
                        model_used=model_used,
                        latency_ms=latency_ms,
                        status=status
                    ))
                    return response_text, model_used, latency_ms
        except Exception:
            pass

        try:
            # Plan B: Try direct raw prompt payload if Plan A failed or proxy handles simple schema inputs
            payload_simple = {
                "prompt": prompt,
                "stream": False
            }
            with httpx.Client(timeout=LLM_PROXY_TIMEOUT_SECONDS) as client:
                res = client.post(alternative_api_url, json=payload_simple)
                if res.status_code == 200:
                    data = res.json()
                    response_text = (data.get("response") or data.get("text") or "").strip()
                    if response_text:
                        latency_ms = int((time.perf_counter() - start_time) * 1000)
                        store.add_llm_trace(LLMTrace(
                            prompt=prompt,
                            response=response_text,
                            model_used=model_used,
                            latency_ms=latency_ms,
                            status=status
                        ))
                        return response_text, model_used, latency_ms
        except Exception as e:
            print(f"[LLM Router] Critical Error: Fallback Proxy also unreachable: {str(e)}")

    # If everything is offline, report offline diagnostic instructions cleanly to client
    latency_ms = int((time.perf_counter() - start_time) * 1000)
    response_text = (
        "⚠️ **Local Ollama and the hosted proxy are unavailable.**\n\n"
        "To get intelligent backlog summaries and natural-language queries:\n"
        "1. Launch Ollama locally (`ollama run gemma4`)\n"
        "2. Or ensure your hosted-model proxy server is listening on `http://localhost:8080`."
    )
    store.add_llm_trace(LLMTrace(
        prompt=prompt,
        response=response_text,
        model_used="none/offline",
        latency_ms=latency_ms,
        status="failed"
    ))
    return response_text, "none/failed", latency_ms


def evaluate_messages(messages: List[Dict[str, str]], store: EntryStore, trace_label: Optional[str] = None) -> Tuple[str, str, int]:
    """
    Message-oriented LLM router for session-aware chat.
    Uses Ollama chat when available and preserves OpenAI-compatible messages for the proxy.
    """
    start_time = time.perf_counter()
    model_used = f"ollama/{OLLAMA_MODEL}"
    status = "success"
    response_text = ""
    flattened_prompt = _messages_to_prompt(messages)
    trace_prompt = f"{trace_label}\n\n{flattened_prompt}" if trace_label else flattened_prompt

    force_proxy = False
    complex_triggers = ["architecture diagram", "database setup script", "generate code", "deploy kubernetes", "refactor api"]
    if any(trigger in flattened_prompt.lower() for trigger in complex_triggers):
        force_proxy = True
        print("[LLM Router] Complex directive detected. Routing message call to hosted proxy on 8080.")

    if not force_proxy:
        try:
            url = f"{OLLAMA_HOST}/api/chat"
            payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.3
                }
            }
            with httpx.Client(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    response_text = (data.get("message") or {}).get("content", "").strip()
                    if not response_text:
                        response_text = data.get("response", "").strip()

                    if "requires specialized reasoning" in response_text.lower() or "delegate to high-reasoning" in response_text.lower():
                        print("[LLM Router] local model requested delegation. Re-routing message call to hosted proxy on 8080.")
                        force_proxy = True
                    else:
                        latency_ms = int((time.perf_counter() - start_time) * 1000)
                        store.add_llm_trace(LLMTrace(
                            prompt=trace_prompt,
                            response=response_text,
                            model_used=model_used,
                            latency_ms=latency_ms,
                            status=status
                        ))
                        return response_text, model_used, latency_ms
                else:
                    print(f"[LLM Router] Ollama chat returned non-200 code: {res.status_code}. Executing fallback.")
                    force_proxy = True
        except (httpx.ConnectError, httpx.TimeoutException, Exception) as e:
            print(f"[LLM Router] Ollama chat is offline or timed out: {str(e)}. Pivoting to hosted proxy on 8080.")
            force_proxy = True

    if force_proxy:
        model_used = "hosted-proxy/8080"
        proxy_api_url = f"{LLM_PROXY_HOST}/v1/chat/completions"
        alternative_api_url = f"{LLM_PROXY_HOST}/api/generate"

        try:
            payload_openai = {
                "model": "gpt-3.5-turbo",
                "messages": messages,
                "temperature": 0.5
            }
            with httpx.Client(timeout=LLM_PROXY_TIMEOUT_SECONDS) as client:
                res = client.post(proxy_api_url, json=payload_openai)
                if res.status_code == 200:
                    data = res.json()
                    response_text = data["choices"][0]["message"]["content"].strip()
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    store.add_llm_trace(LLMTrace(
                        prompt=trace_prompt,
                        response=response_text,
                        model_used=model_used,
                        latency_ms=latency_ms,
                        status=status
                    ))
                    return response_text, model_used, latency_ms
        except Exception:
            pass

        try:
            payload_simple = {
                "prompt": flattened_prompt,
                "stream": False
            }
            with httpx.Client(timeout=LLM_PROXY_TIMEOUT_SECONDS) as client:
                res = client.post(alternative_api_url, json=payload_simple)
                if res.status_code == 200:
                    data = res.json()
                    response_text = (data.get("response") or data.get("text") or "").strip()
                    if response_text:
                        latency_ms = int((time.perf_counter() - start_time) * 1000)
                        store.add_llm_trace(LLMTrace(
                            prompt=trace_prompt,
                            response=response_text,
                            model_used=model_used,
                            latency_ms=latency_ms,
                            status=status
                        ))
                        return response_text, model_used, latency_ms
        except Exception as e:
            print(f"[LLM Router] Critical Error: Fallback Proxy also unreachable: {str(e)}")

    latency_ms = int((time.perf_counter() - start_time) * 1000)
    response_text = (
        "Local Ollama and the hosted proxy are unavailable.\n\n"
        "To get intelligent backlog summaries and natural-language queries:\n"
        "1. Launch Ollama locally (`ollama run gemma4`)\n"
        "2. Or ensure your hosted-model proxy server is listening on `http://localhost:8080`."
    )
    store.add_llm_trace(LLMTrace(
        prompt=trace_prompt,
        response=response_text,
        model_used="none/offline",
        latency_ms=latency_ms,
        status="failed"
    ))
    return response_text, "none/failed", latency_ms


_EMBED_MODEL = "nomic-embed-text"

def embed_text(text: str) -> list:
    """
    Returns a float32 embedding vector via Ollama /api/embeddings.
    Returns an empty list if the embedding model is not installed or Ollama is offline.
    """
    try:
        url = f"{OLLAMA_HOST}/api/embeddings"
        with httpx.Client(timeout=8.0) as client:
            res = client.post(url, json={"model": _EMBED_MODEL, "prompt": text[:2000]})
            if res.status_code == 200:
                return res.json().get("embedding", [])
            print(f"[Embedding] Ollama returned {res.status_code} for model {_EMBED_MODEL}")
    except Exception as e:
        print(f"[Embedding] {_EMBED_MODEL} unavailable: {e}")
    return []


def summarize_backlog(entries_json: str, store: EntryStore) -> Tuple[str, str, int]:
    """
    Format standard backlog log metadata and request LLM summarization.
    """
    prompt = (
        "You are MemoryVault's built-in generalist productivity and knowledge summary helper.\n"
        "Analyze the following JSON-serialized database entries. These represent goals, notes, tasks, and issues.\n"
        "Focus on recent activities, identify key patterns or trends in goals/notes/tasks/issues, highlight bottlenecks, "
        "and draft a highly readable recap list with concise action points.\n\n"
        f"Database Data:\n{entries_json}\n\n"
        "Summary Response Style:\n"
        "- Clear headers (e.g. ## Knowledge Pulse, ## Active Accomplishments, ## Critical Issues)\n"
        "- Bullet points, referencing specific entry IDs e.g. #0012 or [[#0012]] where relevant to build an Obsidian-style interwoven outline\n"
        "- Highlight tag keywords e.g. #collab\n"
        "- Enthusiastic, professional, and clear tone"
    )
    return evaluate_and_generate(prompt, store)


def classify_and_tag_entry(raw_text: str, store: EntryStore) -> Dict[str, Any]:
    """
    Intelligently analyzes a raw log/idea note.
    Categorizes it into standard generalist buckets (GOAL, NOTE, TASK, ISSUE, etc.),
    extracts a concise title and description, and creates a dense
    list of semantically similar synonyms as keywords/tags.
    
    If it references other files or topics, suggest connections e.g. adding '[[#xxxx]]' inside the description.
    
    Returns a dict with:
        {"bucket": "...", "title": "...", "description": "...", "tags": "..."}
    """
    try:
        active_buckets_list = store.get_buckets()
        active_buckets = [b.name for b in active_buckets_list]
    except Exception:
        active_buckets = ["GOAL", "NOTE", "TASK", "ISSUE", "EVENT", "REMINDER", "JOURNAL"]

    buckets_desc = "\n".join([f"   - '{b}'" for b in active_buckets])

    prompt = (
        "You are MemoryVault's high-intelligence core classifier, relationship-builders, and schema auto-filler.\n"
        "A user has written a raw, unstructured note, task, or idea. Analyze the intent behind this input and return "
        "a precisely formatted JSON block representing the structured data. Ensure your logic handles these rules:\n\n"
        "1. CLASS (bucket): Select the single best matching category from the available options in the user's database. Available categories:\n"
        f"{buckets_desc}\n\n"
        "2. TITLE: Extract or synthesize a neat 1-line title (3 to 7 words max).\n"
        "3. DESCRIPTION: Write a helpful details sentence. If the input links or relates to any other topic or entry, "
        "optionally weave in references or link them using Obsidian's double-bracket link syntax like '[[#0012]]' directly in the sentence text.\n"
        "4. SEMANTIC TAGS: Generate 4 to 8 semantically similar keywords or synonyms related to the core topic. "
        "For example, if the topic is 'oauth', output tags like 'auth, security, login, token, handshake, api'. "
        "This is used in an FTS5 table so we can retrieve this note even on loose matches. Return these as a simple comma-separated string (no prefix symbol like # needed).\n\n"
        f"Raw Note Text:\n\"{raw_text}\"\n\n"
        "Output Format Requirement:\n"
        "You MUST return ONLY a raw JSON block with no markdown wrappers, triple backticks, or explanation comments. "
        "Example format:\n"
        "{\n"
        "  \"bucket\": \"TASK\",\n"
        "  \"title\": \"Example Title Here\",\n"
        "  \"description\": \"Description Details. Relates to [[#0012]] for baseline authentication specs.\",\n"
        "  \"tags\": \"auth,login,handshake,token\"\n"
        "}"
    )

    response_text, model_used, latency = evaluate_and_generate(prompt, store)
    
    # Strip any Markdown codeblock fences ` ```json ... ``` ` if generated by some proxy/ollama configurations
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        # strip start fence
        if lines[0].startswith("```"):
            lines = lines[1:]
        # strip end fence
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    
    try:
        import json
        parsed = json.loads(cleaned)
        
        # Coerce values safely
        bucket_val = str(parsed.get("bucket", "TASK")).strip().upper()
        if bucket_val not in active_buckets:
            bucket_val = "TASK"
            
        return {
            "bucket": bucket_val,
            "title": str(parsed.get("title") or raw_text[:50]).strip(),
            "description": str(parsed.get("description") or raw_text).strip(),
            "tags": str(parsed.get("tags") or "").strip().lower()
        }
    except Exception as e:
        print(f"[Classifier Failure] Failed to parse structured JSON response: {str(e)}. Raw response was: \"{response_text}\"")
        # Fail-safe structural fallback to preserve raw data safely
        return {
            "bucket": "TASK",
            "title": raw_text[:50].strip() or "Untitled Quick Idea",
            "description": raw_text.strip(),
            "tags": "uncategorized"
        }
