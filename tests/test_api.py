import os
import tempfile
import pytest
from fastapi.testclient import TestClient

# Mock active environment database path to isolate API runtime context from active user data
temp_db_fd, temp_db_path = tempfile.mkstemp()
os.environ["MEMORYVAULT_DB_PATH"] = temp_db_path

# Import application server containing active environment context
import backend.main as main
from backend.store import EntryStore
from backend.main import app
main.store = EntryStore(db_path=temp_db_path)
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def cleanup_temp_db():
    yield
    os.close(temp_db_fd)
    if os.path.exists(temp_db_path):
        os.unlink(temp_db_path)

@pytest.fixture(autouse=True)
def stub_background_embeddings(monkeypatch):
    import backend.llm as llm
    monkeypatch.setattr(llm, "embed_text", lambda text: [])

def test_api_add_lifecycle():
    # 1. Add post
    payload = {
        "bucket": "GOAL",
        "title": "Configure production proxy endpoints",
        "tags": "infra,proxy",
        "description": "Forward communication to client interface"
    }
    response = client.post("/add", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "#0001"
    assert data["status"] == "open"

    # 2. Get Single Item
    import urllib.parse
    quoted_id = urllib.parse.quote("#0001")
    get_res = client.get(f"/item/{quoted_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Configure production proxy endpoints"

    # 3. Patch Status
    patch_res = client.patch(f"/item/{quoted_id}", json={"status": "in-progress"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in-progress"

    # 4. Filter search records
    search_res = client.get("/search?q=production")
    assert search_res.status_code == 200
    assert len(search_res.json()) == 1
    assert search_res.json()[0]["id"] == "#0001"

def test_api_metrics():
    response = client.get("/metrics")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["in_progress"] == 1
    assert data["buckets"]["GOAL"] == 1

def test_api_export_import():
    # Retrieve current backup configuration file download
    export_res = client.get("/export")
    assert export_res.status_code == 200
    backup_data = export_res.json()
    assert len(backup_data) == 1
    assert backup_data[0]["id"] == "#0001"
    
    # Overwrite backing tables with the exported configuration
    import json
    import io
    file_payload = {"file": ("backup.json", json.dumps(backup_data), "application/json")}
    import_res = client.post("/import", files=file_payload)
    assert import_res.status_code == 200
    assert import_res.json()["imported_count"] == 1

def test_api_auto_classification_fallback(monkeypatch):
    monkeypatch.setattr(main, "classify_and_tag_entry", lambda raw_text, store: {
        "bucket": "ISSUE",
        "title": "OAuth Memory Leak",
        "description": "Critical heap allocation issue from the raw note.",
        "tags": "oauth,memory,heap,leak"
    })
    payload = {
        "title": "Fix memory leaks from oauth token handshake",
        "tags": "test-tag",
        "description": "Critical heap allocation issue"
    }
    response = client.post("/add", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["bucket"] == "ISSUE"
    assert data["title"] == "OAuth Memory Leak"
    assert "test-tag" in data["tags"]
    assert "oauth" in data["tags"]

def test_api_explicit_bucket_bypasses_classification(monkeypatch):
    def fail_classifier(raw_text, store):
        raise AssertionError("explicit buckets should not call classifier")

    monkeypatch.setattr(main, "classify_and_tag_entry", fail_classifier)
    response = client.post("/add", json={
        "bucket": "NOTE",
        "title": "Typed bucket stays authoritative",
        "tags": "manual",
        "description": "The user chose a concrete note type."
    })

    assert response.status_code == 200
    data = response.json()
    assert data["bucket"] == "NOTE"
    assert data["title"] == "Typed bucket stays authoritative"

def test_api_attachments_and_tag_intersection():
    # 1. Test image upload endpoint
    file_bytes = b"fake image content"
    files = {"file": ("test_image.png", file_bytes, "image/png")}
    upload_res = client.post("/upload", files=files)
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert "id" in upload_data
    assert upload_data["filename"] == "test_image.png"
    assert upload_data["mime_type"] == "image/png"
    assert upload_data["url"].startswith("/attachments/")
    assert upload_data["size"] == len(file_bytes)

    # 2. Test saving entry with attachments
    entry_payload = {
        "bucket": "TASK",
        "title": "Deploy visual chart system",
        "tags": "infra,deploy,docker",
        "description": "Containerize client dashboard components",
        "attachments": [upload_data]
    }
    add_res = client.post("/add", json=entry_payload)
    assert add_res.status_code == 200
    add_data = add_res.json()
    assert len(add_data["attachments"]) == 1
    assert add_data["attachments"][0]["filename"] == "test_image.png"

    # Add more entries to test tag intersection search reducing results
    client.post("/add", json={
        "bucket": "TASK",
        "title": "Deploy api system",
        "tags": "infra,deploy,kubernetes",
        "description": "Deploy backend replicas"
    })
    client.post("/add", json={
        "bucket": "TASK",
        "title": "Configure terraform variables",
        "tags": "infra,terraform",
        "description": "Local cloud workspace state integration"
    })

    # Test single tag search: tag:infra returns all 4 matching entries
    search_infra = client.get("/search?q=tag:infra")
    assert search_infra.status_code == 200
    infra_results = [r["title"] for r in search_infra.json() if "Deploy" in r["title"] or "Configure" in r["title"]]
    assert len(infra_results) == 4

    # Test two tags search (intersection): tag:infra tag:deploy reduces results to 2!
    search_infra_deploy = client.get("/search?q=tag:infra tag:deploy")
    assert search_infra_deploy.status_code == 200
    infra_deploy_results = [r["title"] for r in search_infra_deploy.json() if "Deploy" in r["title"] or "Configure" in r["title"]]
    assert len(infra_deploy_results) == 2

    # Test three tags search: tag:infra tag:deploy tag:docker reduces results to 1!
    search_infra_deploy_docker = client.get("/search?q=tag:infra tag:deploy tag:docker")
    assert search_infra_deploy_docker.status_code == 200
    docker_results = [r["title"] for r in search_infra_deploy_docker.json() if "Deploy" in r["title"] or "Configure" in r["title"]]
    assert len(docker_results) == 1
    assert docker_results[0] == "Deploy visual chart system"

def test_dynamic_buckets_and_sorting():
    # 1. Test fetching pre-populated buckets
    res = client.get("/buckets")
    assert res.status_code == 200
    buckets = {b["name"]: b for b in res.json()}
    assert "GOAL" in buckets
    assert "NOTE" in buckets
    assert "TASK" in buckets
    assert "ISSUE" in buckets
    assert "EVENT" in buckets
    assert "REMINDER" in buckets
    assert "JOURNAL" in buckets
    assert buckets["JOURNAL"]["color"] == "pink"
    assert "accomplished today" in buckets["JOURNAL"]["template"]

    # 2. Test adding a new custom category (bucket)
    custom_payload = {
        "name": "TESTPLAN",
        "color": "green",
        "template": "### Test layout — {{DATE}}\n- Result: ",
        "is_custom": True
    }
    add_res = client.post("/buckets/add", json=custom_payload)
    assert add_res.status_code == 200
    
    # Verify retrieved list includes custom bucket
    res2 = client.get("/buckets")
    buckets2 = {b["name"]: b for b in res2.json()}
    assert "TESTPLAN" in buckets2
    assert buckets2["TESTPLAN"]["is_custom"] is True

    # 3. Test searching by relevance
    client.post("/add", json={
        "bucket": "TASK",
        "title": "Configure dev server proxy routing",
        "tags": "infra,dev,proxy",
        "description": "Configure development server ports"
    })
    client.post("/add", json={
        "bucket": "TASK",
        "title": "Configure prod environment proxy routing backend metrics tracking",
        "tags": "infra,prod,proxy,routing,metrics",
        "description": "Port forwarding configuration for production routing backend telemetry"
    })

    # When sorting by relevance, the entry matching more keywords / overlap should rank higher
    search_relevance = client.get("/search?q=routing&sort_by=relevance")
    assert search_relevance.status_code == 200
    results_relevance = search_relevance.json()
    assert len(results_relevance) >= 2
    assert "prod environment" in results_relevance[0]["title"]

    # 4. Test deleting custom bucket
    del_res = client.delete("/buckets/TESTPLAN")
    assert del_res.status_code == 200
    
    # Try deleting standard default bucket (should be blocked)
    del_default = client.delete("/buckets/JOURNAL")
    assert del_default.status_code == 400

def test_api_chat_session_reuse(monkeypatch):
    monkeypatch.setattr(main, "evaluate_messages", lambda messages, store, trace_label=None: ("Stubbed answer", "stub/model", 5))

    first = client.post("/chat", json={"query": "What is active in the vault?"})
    assert first.status_code == 200
    first_data = first.json()
    assert first_data["response"] == "Stubbed answer"
    assert first_data["conversation_id"]
    assert isinstance(first_data["context_entry_ids"], list)

    second = client.post("/chat", json={
        "query": "What about that next?",
        "conversation_id": first_data["conversation_id"]
    })
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["conversation_id"] == first_data["conversation_id"]
    assert main.store.get_conversation_turn_count(first_data["conversation_id"]) == 4
