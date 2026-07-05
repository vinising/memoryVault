#!/usr/bin/env python3
"""
One-off seed script: populates MemoryVault with representative entries derived
from the Product document for UI testing of:
  1. Task with sub-tasks (checklist in description)
  2. Storing ideas (NOTE entries per brainstorm point)
  3. Searching (comma-separated keyword OR search)
  4. Mixed note types: JOURNAL, REMINDER, custom buckets (CHECKLIST, LEDGER)

Usage:
    python tests/seed_product_data.py [BASE_URL]
    # default: http://127.0.0.1:8000
"""

import sys
import json
import urllib.request
import urllib.error

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def _request(method: str, path: str, payload: dict = None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode() if payload else None
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code} on {method} {path}: {body[:120]}")
        return None


def post(path, payload):
    return _request("POST", path, payload)


# ---------------------------------------------------------------------------
# 1. Custom buckets (CHECKLIST, LEDGER) — these map to Product doc use-cases
# ---------------------------------------------------------------------------
print("=== Creating custom buckets ===")
custom_buckets = [
    {
        "name": "CHECKLIST",
        "color": "green",
        "template": "### Checklist — {{DATE}}\n\n- [ ] \n- [ ] \n- [ ] ",
        "is_custom": True,
    },
    {
        "name": "LEDGER",
        "color": "orange",
        "template": "### Ledger — {{DATE}}\n\n| Date | Item | Amount |\n|------|------|--------|\n| | | |",
        "is_custom": True,
    },
]
for b in custom_buckets:
    result = post("/buckets/add", b)
    status = "ok" if result else "already exists or failed"
    print(f"  BUCKET {b['name']}: {status}")

# ---------------------------------------------------------------------------
# 2. TASK with sub-tasks — the entire Product document as a roadmap task
#    Sub-tasks expressed as a markdown checklist in the description field.
# ---------------------------------------------------------------------------
print("\n=== Scenario 1: TASK with sub-tasks ===")
task = {
    "bucket": "TASK",
    "title": "MemoryVault Product Roadmap — Q3 2026",
    "tags": "product,roadmap,features,backlog,q3-2026",
    "description": (
        "### Q3 2026 Feature Tasks\n\n"
        "- [ ] Add EVENT, REMINDER, JOURNAL knowledge allocation buckets\n"
        "- [ ] Allow users to create custom bucket types with templates\n"
        "- [ ] Per-entry template customization (editable at entry creation)\n"
        "- [ ] Replace Search-button chat window with dedicated search view\n"
        "- [ ] Comma-separated keyword search with semantic OR matching\n"
        "- [ ] User-defined sort order for search results (recency / relevance)\n"
        "- [ ] Checklist bucket: list of items to cover\n"
        "- [ ] Reminder notes with calendar integration\n"
        "- [ ] Freeform scratchpad: random thoughts, ideas, poetry\n"
        "- [ ] Quick credential notes (password hints, account user IDs)\n"
        "- [ ] Petty expense and ledger balance tracking\n"
        "- [ ] Saved lists: addresses, medicines, movies, reading tracker"
    ),
}
r = post("/add", task)
if r:
    print(f"  {r['id']} [{r['bucket']}] {r['title']}")

# ---------------------------------------------------------------------------
# 3. NOTE ideas — each major idea from the Product doc as a separate note
# ---------------------------------------------------------------------------
print("\n=== Scenario 2: Storing ideas ===")
ideas = [
    {
        "bucket": "NOTE",
        "title": "Idea: Comma-separated keyword search with semantic matching",
        "tags": "idea,search,semantic,ux",
        "description": (
            "Users should type their own keywords separated by comma in the search/filter input. "
            "For each keyword perform semantic OR search to find related notes. "
            "Results sorted by most recent by default; user can override sort order."
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Idea: Per-entry template customization",
        "tags": "idea,templates,ux,customization",
        "description": (
            "Allow users to create their own template/structure per entry. "
            "Today's date is auto-inserted for journal-style templates. "
            "Templates are editable at entry creation time, not only per bucket."
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Idea: Tag filter is getting bloated — free-text keyword input",
        "tags": "idea,tags,ux,search,filter",
        "description": (
            "The click-based tag filter grows unmanageable with many tags. "
            "Replace with a text input: user types comma-separated keywords, "
            "each triggers an OR search, results sorted by recency."
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Quick note: password and credential tracking approach",
        "tags": "security,credentials,quick-notes",
        "description": (
            "Use NOTE entries for quick password hints, account user IDs, and credential references. "
            "Store hints only — never actual passwords in plain text."
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Petty expenses log — July 2026",
        "tags": "expenses,ledger,financial,july-2026",
        "description": (
            "Daily expense log:\n"
            "- 2026-07-01: Groceries ₹450\n"
            "- 2026-07-03: Transport ₹120\n"
            "- 2026-07-05: Lunch ₹280\n"
            "- 2026-07-06: Coffee ₹90\n"
            "Running total: ₹940"
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Reading list — tech and product books",
        "tags": "reading,books,list,tracker",
        "description": (
            "- [ ] Shape Up — Ryan Singer\n"
            "- [ ] The Mom Test — Rob Fitzpatrick\n"
            "- [x] Zero to One — Peter Thiel\n"
            "- [ ] Build — Tony Fadell\n"
            "- [ ] Continuous Discovery Habits — Teresa Torres"
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Random thoughts scratchpad — ideas and creative notes",
        "tags": "ideas,scratch,creative,thoughts",
        "description": (
            "What if MemoryVault could recognize handwriting via camera?\n"
            "Voice memo transcription mode for quick captures on the go.\n"
            "Graph view could auto-cluster notes by semantic similarity.\n"
            "Daily digest: morning summary of yesterday's notes."
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Important addresses and locations",
        "tags": "addresses,contact,location",
        "description": (
            "Office: 14B Tech Park, Whitefield, Bengaluru 560066\n"
            "Home: 8A Residency Road, Jayanagar, Bengaluru 560011\n"
            "Nearest hospital: Apollo Spectra, 100 Feet Road"
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Medicines and health reference",
        "tags": "medicines,health,reference",
        "description": (
            "Morning: Vitamin D3 (1 tab)\n"
            "Evening: Omega-3 (1 cap)\n"
            "As needed: Paracetamol 500mg for headache\n"
            "Allergies: Penicillin"
        ),
    },
    {
        "bucket": "NOTE",
        "title": "Movies list — to watch",
        "tags": "movies,list,watchlist",
        "description": (
            "- [ ] Oppenheimer (2023)\n"
            "- [ ] Dune Part Two (2024)\n"
            "- [x] The Menu (2022)\n"
            "- [ ] Poor Things (2023)\n"
            "- [ ] Past Lives (2023)"
        ),
    },
]
for idea in ideas:
    r = post("/add", idea)
    if r:
        print(f"  {r['id']} [{r['bucket']}] {r['title'][:60]}")

# ---------------------------------------------------------------------------
# 4. JOURNAL entry — today's product planning session
# ---------------------------------------------------------------------------
print("\n=== Scenario 3/4: JOURNAL + REMINDER ===")
journal = {
    "bucket": "JOURNAL",
    "title": "Product planning session — 2026-07-06",
    "tags": "journal,product,planning,weekly",
    "description": (
        "### Journal reflections — 2026-07-06\n\n"
        "#### What I accomplished today\n"
        "- Reviewed the MemoryVault Product document braindump\n"
        "- Mapped product ideas to test scenarios in the app\n"
        "- Seeded test data derived from the Product document\n\n"
        "#### What I will do tomorrow\n"
        "- Run UI testing scenarios against the seeded data\n"
        "- Validate comma-separated keyword OR search behavior\n"
        "- Test task+subtask checklist flow in the timeline view\n\n"
        "#### Gratitude / Notes\n"
        "- The product document itself is a perfect test case for the app"
    ),
}
r = post("/add", journal)
if r:
    print(f"  {r['id']} [{r['bucket']}] {r['title']}")

reminder = {
    "bucket": "REMINDER",
    "title": "Review product feature implementation progress",
    "tags": "reminder,review,product,weekly",
    "description": (
        "### Reminder Alert — 2026-07-06\n\n"
        "- **Trigger**: End of week / Friday\n"
        "- **Action Required**: Review which Product roadmap tasks are done, update statuses"
    ),
}
r = post("/add", reminder)
if r:
    print(f"  {r['id']} [{r['bucket']}] {r['title']}")

# ---------------------------------------------------------------------------
# 5. CHECKLIST and LEDGER entries (custom buckets)
# ---------------------------------------------------------------------------
print("\n=== Scenario 4: Custom bucket entries ===")
checklist = {
    "bucket": "CHECKLIST",
    "title": "MemoryVault UI Test Checklist — 2026-07-06",
    "tags": "checklist,testing,ux,launch",
    "description": (
        "### Checklist — 2026-07-06\n\n"
        "- [ ] Create task entry with markdown checklist sub-tasks\n"
        "- [ ] Test comma-separated OR search in timeline (e.g. 'expenses, ledger')\n"
        "- [ ] Verify idea notes are found by content keyword search\n"
        "- [ ] Test JOURNAL entry visible in timeline under Today group\n"
        "- [ ] Confirm REMINDER entry appears with correct bucket badge\n"
        "- [ ] Verify custom CHECKLIST and LEDGER buckets in bucket list\n"
        "- [ ] Test sort order toggle: recency vs relevance\n"
        "- [ ] Update a task status: open → in-progress → done\n"
        "- [ ] Export and re-import JSON backup, verify all entries restored"
    ),
}
r = post("/add", checklist)
if r:
    print(f"  {r['id']} [{r['bucket']}] {r['title']}")

ledger = {
    "bucket": "LEDGER",
    "title": "July 2026 Ledger Balance",
    "tags": "ledger,finance,balance,july-2026",
    "description": (
        "### Ledger — 2026-07-06\n\n"
        "| Date | Item | Amount |\n"
        "|------|------|--------|\n"
        "| 2026-07-01 | Opening balance | ₹5,000 |\n"
        "| 2026-07-03 | Groceries | −₹450 |\n"
        "| 2026-07-05 | Transport | −₹120 |\n"
        "| 2026-07-06 | Coffee | −₹90 |\n"
        "| 2026-07-06 | **Closing balance** | **₹4,340** |"
    ),
}
r = post("/add", ledger)
if r:
    print(f"  {r['id']} [{r['bucket']}] {r['title']}")

# ---------------------------------------------------------------------------
print("\n=== Seed complete ===")
print(f"Open MemoryVault at {BASE_URL.replace(':8000', '')} and switch to Timeline.")
print("\nTest scenarios to run manually:")
print("  1. Search 'subtask' or 'checklist'    → finds the TASK roadmap entry")
print("  2. Search 'idea, semantic, templates'  → finds multiple NOTE ideas (OR logic)")
print("  3. Search 'expenses, ledger, finance'  → finds petty-expenses + LEDGER notes")
print("  4. Search 'journal' or 'reminder'      → finds JOURNAL and REMINDER entries")
print("  5. Filter tags: click #product,#ideas  → intersect filtering still works")
