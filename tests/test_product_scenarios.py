"""
Product document test scenarios.

Uses the Product document braindump as test data to verify:
  1. Task with sub-tasks  — TASK entry with markdown checklist in description
  2. Storing ideas        — multiple NOTE entries across different content families
  3. Searching            — FTS5 keyword search and comma-separated OR search
  4. Mixed note types     — JOURNAL, REMINDER, custom buckets (CHECKLIST, LEDGER)

Each scenario is isolated in its own module-scoped client so tests are self-contained.
"""
import urllib.parse
import os
import tempfile
import pytest
from fastapi.testclient import TestClient


# ── Isolated DB fixtures ────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    fd, path = tempfile.mkstemp()

    # backend.main may already be cached (test_api.py imports it at module level).
    # Patch the module-level `store` to a fresh isolated instance so our entries
    # don't pollute test_api.py's DB, then restore it after this module finishes.
    import backend.main as main_module
    from backend.store import EntryStore

    fresh_store = EntryStore(db_path=path)
    original_store = main_module.store
    main_module.store = fresh_store

    with TestClient(main_module.app) as c:
        yield c

    main_module.store = original_store  # restore for test_api.py
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)


# ── Helpers ─────────────────────────────────────────────────────────────────

def add(client, bucket, title, tags, description):
    r = client.post("/add", json={
        "bucket": bucket,
        "title": title,
        "tags": tags,
        "description": description,
    })
    assert r.status_code == 200, r.text
    return r.json()


def item_path(entry_id: str) -> str:
    """Return a URL-safe /item/{id} path (# must be percent-encoded)."""
    return f"/item/{urllib.parse.quote(entry_id)}"


def search(client, q, sort_by="recency"):
    r = client.get("/search", params={"q": q, "sort_by": sort_by})
    assert r.status_code == 200, r.text
    return r.json()


# ── Scenario 1: Task with sub-tasks ─────────────────────────────────────────

def test_task_with_subtask_checklist(client):
    """
    A TASK whose description is a markdown checklist represents the 'sub-tasks'
    pattern. Verifies the entry round-trips cleanly and is findable by checklist
    item keywords.
    """
    entry = add(
        client,
        bucket="TASK",
        title="MemoryVault Product Roadmap — Q3 2026",
        tags="product,roadmap,features,backlog",
        description=(
            "### Q3 2026 Feature Tasks\n\n"
            "- [ ] Add EVENT, REMINDER, JOURNAL buckets\n"
            "- [ ] Allow custom bucket types with templates\n"
            "- [ ] Per-entry template customization\n"
            "- [ ] Replace Search chat-window with dedicated search view\n"
            "- [ ] Comma-separated keyword search with semantic OR matching\n"
            "- [ ] Checklist bucket: list of items to cover\n"
            "- [ ] Reminder notes with calendar integration\n"
            "- [ ] Petty expense and ledger balance tracking\n"
            "- [ ] Saved lists: addresses, medicines, movies, reading tracker"
        ),
    )
    assert entry["bucket"] == "TASK"
    assert entry["status"] == "open"
    # Checklist content preserved verbatim
    assert "- [ ]" in entry["description"]
    assert "ledger balance tracking" in entry["description"]

    # Sub-task keyword search: searching a checklist item text finds the parent task
    results = search(client, "ledger")
    ids = [e["id"] for e in results]
    assert entry["id"] in ids, "Task not found by sub-task keyword 'ledger'"

    results2 = search(client, "reading tracker")
    ids2 = [e["id"] for e in results2]
    assert entry["id"] in ids2, "Task not found by sub-task phrase 'reading tracker'"

    # Mark one sub-task complete by updating description, verify PATCH works
    updated_desc = entry["description"].replace(
        "- [ ] Checklist bucket: list of items to cover",
        "- [x] Checklist bucket: list of items to cover",
    )
    patch_r = client.patch(
        item_path(entry["id"]),
        json={"description": updated_desc},
    )
    assert patch_r.status_code == 200
    assert "- [x]" in patch_r.json()["description"]


# ── Scenario 2: Storing ideas ────────────────────────────────────────────────

def test_storing_ideas_across_note_types(client):
    """
    Stores a variety of idea/note types from the Product document and verifies
    each is retrievable, tags are preserved, and all expected note families exist.
    """
    ideas = [
        ("NOTE", "Idea: comma-separated keyword search",     "idea,search,semantic,ux",       "Users type comma-separated keywords; semantic OR search returns related notes."),
        ("NOTE", "Idea: per-entry template customization",   "idea,templates,ux,customization","Templates editable at entry creation, not only per bucket."),
        ("NOTE", "Petty expenses log — July 2026",           "expenses,ledger,financial",      "Groceries ₹450, Transport ₹120, Coffee ₹90"),
        ("NOTE", "Reading list — tech books",                "reading,books,list,tracker",     "- [ ] Shape Up\n- [x] Zero to One\n- [ ] The Mom Test"),
        ("NOTE", "Random thoughts scratchpad",               "ideas,scratch,creative",         "Voice memo mode, handwriting recognition, graph clustering."),
        ("NOTE", "Quick credential note approach",           "security,credentials,quick",     "Store hints only — never actual passwords."),
        ("NOTE", "Medicines and health reference",           "medicines,health,reference",     "Morning: Vitamin D3. Evening: Omega-3."),
        ("NOTE", "Movies watchlist",                         "movies,list,watchlist",          "- [ ] Oppenheimer\n- [ ] Dune Part Two\n- [x] The Menu"),
    ]

    created_ids = []
    for bucket, title, tags, desc in ideas:
        e = add(client, bucket, title, tags, desc)
        created_ids.append(e["id"])
        assert e["tags"] == tags, f"Tags mismatch for '{title}'"

    # All idea entries are returned in a general search
    all_results = search(client, "")
    all_ids = {e["id"] for e in all_results}
    for cid in created_ids:
        assert cid in all_ids, f"Created entry {cid} missing from general search"

    # Reading list entry found by "tracker" keyword
    tracker_results = search(client, "tracker")
    tracker_ids = [e["id"] for e in tracker_results]
    reading_entry_id = next(
        cid for cid, (_, title, *_) in zip(created_ids, ideas) if "Reading" in title
    )
    assert reading_entry_id in tracker_ids

    # Expenses entry found by "expenses" and independently by "financial"
    for kw in ("expenses", "financial"):
        kw_results = search(client, kw)
        kw_ids = [e["id"] for e in kw_results]
        expenses_id = next(
            cid for cid, (_, title, *_) in zip(created_ids, ideas) if "expenses" in title.lower()
        )
        assert expenses_id in kw_ids, f"Expenses entry not found by keyword '{kw}'"


# ── Scenario 3: Searching ────────────────────────────────────────────────────

def test_comma_separated_or_search(client):
    """
    Verifies the OR-search behavior that the frontend triggers when the user types
    comma-separated keywords: 'expenses* OR ledger* OR finance*'

    Each term must independently match at least one entry; combined, results are
    the union (OR) of all individual matches, sorted by recency.
    """
    # Seed two entries with clearly distinct content families
    e_exp = add(client, "NOTE", "Daily expenses tracker",
                "expenses,daily", "Coffee ₹90, snacks ₹60, total ₹150")
    e_led = add(client, "NOTE", "Monthly ledger summary",
                "ledger,finance", "Opening ₹5000, closing ₹4340")
    # Third entry that matches neither
    e_other = add(client, "GOAL", "Learn Spanish in 90 days",
                  "learning,languages", "Practice 30 min daily")

    # Single term: each finds exactly its own entry
    r_exp = search(client, "expenses")
    assert any(e["id"] == e_exp["id"] for e in r_exp), "expenses entry not found by 'expenses'"

    r_led = search(client, "ledger")
    assert any(e["id"] == e_led["id"] for e in r_led), "ledger entry not found by 'ledger'"

    # FTS5 OR query (what the updated frontend sends for comma input)
    r_or = search(client, "expenses* OR ledger*")
    or_ids = {e["id"] for e in r_or}
    assert e_exp["id"] in or_ids, "expenses entry missing from OR search"
    assert e_led["id"] in or_ids, "ledger entry missing from OR search"
    assert e_other["id"] not in or_ids, "unrelated entry should NOT appear in OR search"

    # Broader OR: 'expenses, ledger, finance' covers both entries
    r_broad = search(client, "expenses* OR ledger* OR finance*")
    broad_ids = {e["id"] for e in r_broad}
    assert e_exp["id"] in broad_ids
    assert e_led["id"] in broad_ids

    # Results sorted by recency (DESC timestamp) by default
    timestamps = [e["timestamp"] for e in r_or]
    assert timestamps == sorted(timestamps, reverse=True), "OR search results not sorted by recency"

    # Relevance sort returns same entries (order may differ)
    r_rel = search(client, "expenses* OR ledger*", sort_by="relevance")
    rel_ids = {e["id"] for e in r_rel}
    assert e_exp["id"] in rel_ids
    assert e_led["id"] in rel_ids


def test_operator_search_preserves_multiword_groups(client):
    """
    Verifies that explicit FTS operator queries with grouped multi-word terms are
    passed through intact instead of being mutated by wildcard suffixing.
    """
    e_tracker = add(client, "NOTE", "Reading tracker setup",
                    "reading,tracker", "Organize the reading tracker template")
    e_ledger = add(client, "NOTE", "Ledger workspace notes",
                   "ledger,finance", "Monthly ledger cleanup")
    e_other = add(client, "TASK", "Plan team offsite",
                  "planning,event", "Finalize venue shortlist")

    grouped = search(client, "(reading* AND tracker*) OR ledger*")
    grouped_ids = {entry["id"] for entry in grouped}

    assert e_tracker["id"] in grouped_ids
    assert e_ledger["id"] in grouped_ids
    assert e_other["id"] not in grouped_ids


def test_keyword_search_across_mixed_content(client):
    """
    Verifies that FTS5 search finds terms in title, tags, AND description,
    which is the basis for the 'search by keyword finds related notes' UX.
    """
    # This entry has the keyword only in the description
    e = add(client, "NOTE", "Weekly review note",
            "review,weekly",
            "Remembered to check on the poetry project and the haiku drafts")

    r = search(client, "haiku")
    assert any(entry["id"] == e["id"] for entry in r), \
        "Description-only keyword 'haiku' should be found by FTS5 search"

    # Keyword only in tags
    e2 = add(client, "NOTE", "Untitled reference",
             "poetry,inspiration,creative-writing", "Some notes")
    r2 = search(client, "poetry")
    ids2 = [e["id"] for e in r2]
    assert e["id"] in ids2, "Tag-only keyword 'poetry' via description should match"
    assert e2["id"] in ids2, "Tag-only keyword 'poetry' should match e2"


# ── Scenario 4: Mixed note types ─────────────────────────────────────────────

def test_journal_and_reminder_entries(client):
    """
    Verifies JOURNAL and REMINDER bucket entries are stored and retrieved
    correctly, and that bucket-based metadata filtering works.
    """
    journal = add(
        client,
        bucket="JOURNAL",
        title="Product planning session — 2026-07-06",
        tags="journal,product,planning",
        description=(
            "### Journal reflections — 2026-07-06\n\n"
            "#### What I accomplished today\n"
            "- Reviewed the Product document\n"
            "- Seeded test data into MemoryVault\n\n"
            "#### What I will do tomorrow\n"
            "- Run UI test scenarios against seed data\n\n"
            "#### Gratitude / Notes\n"
            "- The product doc itself is a great test dataset"
        ),
    )
    assert journal["bucket"] == "JOURNAL"
    assert "accomplished today" in journal["description"]

    reminder = add(
        client,
        bucket="REMINDER",
        title="Review product feature progress",
        tags="reminder,review,product",
        description="### Reminder Alert — 2026-07-06\n- **Trigger**: Friday\n- **Action Required**: update task statuses",
    )
    assert reminder["bucket"] == "REMINDER"

    # bucket:JOURNAL filter returns journal but not reminder
    r_j = search(client, "bucket:JOURNAL")
    j_ids = [e["id"] for e in r_j]
    assert journal["id"] in j_ids
    assert reminder["id"] not in j_ids

    # bucket:REMINDER filter returns reminder but not journal
    r_r = search(client, "bucket:REMINDER")
    r_ids = [e["id"] for e in r_r]
    assert reminder["id"] in r_ids
    assert journal["id"] not in r_ids

    # Keyword search across both
    r_all = search(client, "product")
    all_ids = {e["id"] for e in r_all}
    assert journal["id"] in all_ids
    assert reminder["id"] in all_ids


def test_custom_buckets_checklist_and_ledger(client):
    """
    Verifies custom CHECKLIST and LEDGER bucket creation and entry storage.
    These map to the Product doc use-cases: checklists and petty expense tracking.
    """
    # Create custom buckets
    for b in [
        {"name": "CHECKLIST", "color": "green",
         "template": "### Checklist — {{DATE}}\n\n- [ ] \n- [ ] ",
         "is_custom": True},
        {"name": "LEDGER", "color": "orange",
         "template": "### Ledger — {{DATE}}\n\n| Date | Item | Amount |\n|------|------|--------|\n",
         "is_custom": True},
    ]:
        r = client.post("/buckets/add", json=b)
        assert r.status_code == 200, f"Failed to create bucket {b['name']}: {r.text}"

    # Verify they appear in bucket list
    r_buckets = client.get("/buckets")
    assert r_buckets.status_code == 200
    bucket_names = {b["name"] for b in r_buckets.json()}
    assert "CHECKLIST" in bucket_names
    assert "LEDGER" in bucket_names

    # Add a CHECKLIST entry
    checklist = add(
        client,
        bucket="CHECKLIST",
        title="MemoryVault UI Test Checklist",
        tags="checklist,testing,ux",
        description=(
            "### Checklist — 2026-07-06\n\n"
            "- [ ] Task with checklist sub-tasks\n"
            "- [ ] Comma-separated OR search in timeline\n"
            "- [ ] JOURNAL and REMINDER bucket entries\n"
            "- [ ] Custom bucket creation and entry storage\n"
            "- [ ] Export/import round-trip"
        ),
    )
    assert checklist["bucket"] == "CHECKLIST"
    assert "- [ ]" in checklist["description"]

    # Add a LEDGER entry
    ledger = add(
        client,
        bucket="LEDGER",
        title="July 2026 Ledger Balance",
        tags="ledger,finance,july-2026",
        description=(
            "### Ledger — 2026-07-06\n\n"
            "| Date | Item | Amount |\n"
            "|------|------|--------|\n"
            "| 2026-07-01 | Opening | ₹5,000 |\n"
            "| 2026-07-06 | Closing | ₹4,340 |"
        ),
    )
    assert ledger["bucket"] == "LEDGER"
    assert "₹5,000" in ledger["description"]

    # bucket filter works for custom buckets
    r_chk = search(client, "bucket:CHECKLIST")
    assert any(e["id"] == checklist["id"] for e in r_chk)

    r_ldg = search(client, "bucket:LEDGER")
    assert any(e["id"] == ledger["id"] for e in r_ldg)

    # OR search across checklist + ledger content
    r_or = search(client, "checklist* OR ledger*")
    or_ids = {e["id"] for e in r_or}
    assert checklist["id"] in or_ids
    assert ledger["id"] in or_ids


def test_status_lifecycle_on_task(client):
    """
    Verifies status transitions on a task entry — open → in-progress → done.
    This exercises the 'tracking' use-case from the Product document.
    """
    task = add(client, "TASK", "Track product review session",
               "tracking,review", "Monitor progress of feature reviews")
    assert task["status"] == "open"

    patch1 = client.patch(item_path(task["id"]), json={"status": "in-progress"})
    assert patch1.status_code == 200
    assert patch1.json()["status"] == "in-progress"

    # status filter: status:in-progress finds this task
    r_wip = search(client, "status:in-progress")
    assert any(e["id"] == task["id"] for e in r_wip)

    patch2 = client.patch(item_path(task["id"]), json={"status": "done"})
    assert patch2.status_code == 200
    assert patch2.json()["status"] == "done"

    # No longer in-progress results
    r_wip2 = search(client, "status:in-progress")
    assert not any(e["id"] == task["id"] for e in r_wip2)
