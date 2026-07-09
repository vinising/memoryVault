import os
import tempfile
import pytest
from backend.store import EntryStore
from backend.models import NewEntry, PartialEntry, BucketEnum, LLMTrace, ChatRequest

@pytest.fixture
def temp_db_store():
    # Setup temporary file descriptor for clean database scoping
    fd, path = tempfile.mkstemp()
    yield EntryStore(db_path=path)
    # Cleanups
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)

def test_add_and_get_entry(temp_db_store):
    store = temp_db_store
    new_item = NewEntry(
        bucket=BucketEnum.TASK,
        title="Check system logs",
        tags="admin,logs",
        description="Search inside system logs for timeout profiles"
    )
    saved = store.add_entry(new_item)
    assert saved.id == "#0001"
    assert saved.title == "Check system logs"
    assert saved.status == "open"
    
    retrieved = store.get_entry("#0001")
    assert retrieved is not None
    assert retrieved.id == "#0001"
    assert retrieved.bucket == BucketEnum.TASK

def test_new_entry_defaults_to_ai_classification():
    entry = NewEntry(title="Raw unbucketed mobile capture")
    assert entry.bucket is None

    chat_request = ChatRequest(query="What should I work on?")
    assert chat_request.conversation_id is None
    assert chat_request.mode == "hybrid"

def test_search_fuzzy_fts(temp_db_store):
    store = temp_db_store
    
    entry1 = NewEntry(
        bucket=BucketEnum.GOAL,
        title="Launch Progressive Web App interface",
        tags="pwa,mobile",
        description="Responsive HTML client with offline caching workers"
    )
    entry2 = NewEntry(
        bucket=BucketEnum.ISSUE,
        title="Connection timeout during OAuth handshake",
        tags="auth,network",
        description="Check client interceptor responses"
    )
    store.add_entry(entry1)
    store.add_entry(entry2)
    
    # Text-search matching "handshake"
    matches = store.search_entries("handshake")
    assert len(matches) == 1
    assert matches[0].id == "#0002"
    
    # Metadata filtering matching 'status:open' and keyword 'Progressive'
    matches_meta = store.search_entries("Progressive status:open")
    assert len(matches_meta) == 1
    assert matches_meta[0].id == "#0001"

def test_update_patch_entry(temp_db_store):
    store = temp_db_store
    new_item = NewEntry(
        bucket=BucketEnum.NOTE,
        title="Create profile settings page",
        tags="settings",
        description="Simple settings table"
    )
    store.add_entry(new_item)
    
    patch = PartialEntry(status="in-progress", title="Create profile configurations page")
    updated = store.update_entry("#0001", patch)
    
    assert updated.status == "in-progress"
    assert updated.title == "Create profile configurations page"
    assert updated.tags == "settings"

def test_llm_trace_tracking(temp_db_store):
    store = temp_db_store
    trace_data = LLMTrace(
        prompt="Synthesize items",
        response="Retrieved 5 deliverables",
        model_used="gemma4",
        latency_ms=124,
        status="success"
    )
    trace_id = store.add_llm_trace(trace_data)
    assert trace_id > 0
    
    traces = store.get_llm_traces(limit=5)
    assert len(traces) == 1
    assert traces[0]["model_used"] == "gemma4"
    assert traces[0]["latency_ms"] == 124

def test_conversation_turn_persistence(temp_db_store):
    store = temp_db_store
    conversation_id = store.ensure_conversation(title="Mobile chat")
    assert store.get_conversation(conversation_id)["title"] == "Mobile chat"

    user_turn_id = store.add_conversation_turn(conversation_id, "user", "What is active?", ["#0001"])
    assistant_turn_id = store.add_conversation_turn(conversation_id, "assistant", "One active item.", ["#0001"], "stub/model", 12)

    assert user_turn_id > 0
    assert assistant_turn_id > user_turn_id
    turns = store.get_recent_turns(conversation_id, limit=5)
    assert [turn["role"] for turn in turns] == ["user", "assistant"]
    assert turns[0]["context_entry_ids"] == ["#0001"]
    assert store.get_conversation_turn_count(conversation_id) == 2

    store.update_conversation_summary(conversation_id, "User asked about active work.")
    assert store.get_conversation(conversation_id)["summary"] == "User asked about active work."
