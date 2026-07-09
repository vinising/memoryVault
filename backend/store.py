import sqlite3
import json
import os
import struct
import math
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from backend.config import MEMORYVAULT_DB_PATH
from backend.models import NewEntry, Entry, PartialEntry, BucketEnum, LLMTrace, Attachment, BucketModel

class EntryStore:
    def __init__(self, db_path: str = MEMORYVAULT_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        # Enable WAL mode for high performance and concurrency, and register text-safe parameters
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            # 1. Main Entries Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY,
                    seq INTEGER UNIQUE,
                    bucket TEXT NOT NULL,
                    title TEXT NOT NULL,
                    tags TEXT DEFAULT '',
                    description TEXT DEFAULT '',
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    attachments TEXT DEFAULT '[]'
                );
            """)

            # Run migration to add attachments column if it's an existing database that doesn't have it yet
            try:
                conn.execute("ALTER TABLE entries ADD COLUMN attachments TEXT DEFAULT '[]';")
            except sqlite3.OperationalError:
                pass

            # Run migration to add parent_id column for sub-task hierarchy support
            try:
                conn.execute("ALTER TABLE entries ADD COLUMN parent_id TEXT DEFAULT NULL REFERENCES entries(id);")
            except sqlite3.OperationalError:
                pass

            # Run migration to add embedding column for semantic vector search
            try:
                conn.execute("ALTER TABLE entries ADD COLUMN embedding BLOB DEFAULT NULL;")
            except sqlite3.OperationalError:
                pass

            # Create Buckets table with templates
            conn.execute("""
                CREATE TABLE IF NOT EXISTS buckets (
                    name TEXT PRIMARY KEY,
                    color TEXT NOT NULL,
                    template TEXT,
                    is_custom INTEGER DEFAULT 0
                );
            """)

            # Prepopulate default categories if they do not exist yet
            default_buckets = [
                ("GOAL", "purple", None),
                ("NOTE", "blue", None),
                ("TASK", "yellow", None),
                ("ISSUE", "red", None),
                ("EVENT", "green", "### Event Outline — {{DATE}}\n- **Time**: \n- **Location**: \n- **Agenda**: "),
                ("REMINDER", "orange", "### Reminder Alert — {{DATE}}\n- **Trigger**: \n- **Action Required**: "),
                ("JOURNAL", "pink", "### Journal reflections — {{DATE}}\n\n#### What I accomplished today\n- \n\n#### What I will do tomorrow\n- \n\n#### Gratitude / Notes\n- ")
            ]
            for b_name, b_color, b_template in default_buckets:
                conn.execute("""
                    INSERT OR IGNORE INTO buckets (name, color, template, is_custom)
                    VALUES (?, ?, ?, 0);
                """, (b_name, b_color, b_template))

            # Run inline migrations to map legacy buckets into product generalist terms
            conn.execute("UPDATE entries SET bucket = 'GOAL' WHERE bucket = 'EPIC';")
            conn.execute("UPDATE entries SET bucket = 'NOTE' WHERE bucket = 'US';")
            conn.execute("UPDATE entries SET bucket = 'TASK' WHERE bucket = 'TT';")
            conn.execute("UPDATE entries SET bucket = 'ISSUE' WHERE bucket = 'PT';")

            # 2. FTS5 Virtual Table for Instant Search
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                    id, 
                    bucket, 
                    title, 
                    tags, 
                    description, 
                    tokenize='porter'
                );
            """)

            # 3. Synchronizing Triggers (keep FTS entries fresh automatically)
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
                    INSERT INTO entries_fts(id, bucket, title, tags, description) 
                    VALUES (new.id, new.bucket, new.title, new.tags, new.description);
                END;
            """)

            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
                    DELETE FROM entries_fts WHERE id = old.id;
                END;
            """)

            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
                    UPDATE entries_fts 
                    SET bucket = new.bucket, title = new.title, tags = new.tags, description = new.description 
                    WHERE id = old.id;
                END;
            """)

            # 4. Traces Table for Local offline developer statistics
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_traces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prompt TEXT,
                    response TEXT,
                    model_used TEXT,
                    latency_ms INTEGER,
                    status TEXT,
                    timestamp TEXT NOT NULL
                );
            """)

            # 5. Durable lightweight chat sessions for mobile/PWA continuity
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    summary TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversation_turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    context_entry_ids TEXT DEFAULT '[]',
                    model_used TEXT DEFAULT '',
                    latency_ms INTEGER DEFAULT 0,
                    timestamp TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id
                ON conversation_turns(conversation_id, id);
            """)
            conn.commit()

    def _row_to_entry(self, row) -> Entry:
        try:
            attachments_raw = row["attachments"]
        except Exception:
            attachments_raw = "[]"
            
        try:
            attachments_list = json.loads(attachments_raw) if attachments_raw else []
        except Exception:
            attachments_list = []
            
        try:
            parent_id = row["parent_id"]
        except Exception:
            parent_id = None

        return Entry(
            id=row["id"],
            bucket=row["bucket"],
            title=row["title"],
            tags=row["tags"],
            description=row["description"],
            timestamp=row["timestamp"],
            status=row["status"],
            parent_id=parent_id,
            attachments=attachments_list
        )

    def add_entry(self, entry_in: NewEntry) -> Entry:
        timestamp_str = datetime.now(timezone.utc).isoformat()
        
        with self._get_connection() as conn:
            # Atomic transaction to compute the next padded ID
            cursor = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM entries")
            max_seq = cursor.fetchone()[0]
            next_seq = max_seq + 1
            padded_id = f"#{next_seq:04d}"

            # Convert attachments to JSON list representation
            attachments_list = []
            if entry_in.attachments:
                attachments_list = [a.model_dump() for a in entry_in.attachments]
            attachments_json = json.dumps(attachments_list)

            conn.execute(
                """
                INSERT INTO entries (id, seq, bucket, title, tags, description, timestamp, status, attachments, parent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    padded_id,
                    next_seq,
                    entry_in.bucket.value if hasattr(entry_in.bucket, "value") else (entry_in.bucket or "TASK"),
                    entry_in.title,
                    entry_in.tags or "",
                    entry_in.description or "",
                    timestamp_str,
                    attachments_json,
                    entry_in.parent_id
                )
            )
            conn.commit()
            
        return self.get_entry(padded_id)

    def get_entry(self, entry_id: str) -> Optional[Entry]:
        # Support optional omission of '#' in inputs for convenience
        if not entry_id.startswith("#"):
            entry_id = f"#{int(entry_id):04d}" if entry_id.isdigit() else f"#{entry_id}"

        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_entry(row)
        return None

    def get_subtasks(self, parent_id: str) -> List[Entry]:
        if not parent_id.startswith("#"):
            parent_id = f"#{int(parent_id):04d}" if parent_id.isdigit() else f"#{parent_id}"
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM entries WHERE parent_id = ? ORDER BY seq ASC",
                (parent_id,)
            )
            return [self._row_to_entry(row) for row in cursor.fetchall()]

    def update_embedding(self, entry_id: str, vector: list) -> None:
        """Store a float32 embedding blob for the given entry."""
        if not vector:
            return
        blob = struct.pack(f"{len(vector)}f", *vector)
        with self._get_connection() as conn:
            conn.execute("UPDATE entries SET embedding = ? WHERE id = ?", (blob, entry_id))
            conn.commit()

    def has_embeddings(self) -> bool:
        with self._get_connection() as conn:
            return conn.execute(
                "SELECT EXISTS(SELECT 1 FROM entries WHERE embedding IS NOT NULL LIMIT 1)"
            ).fetchone()[0] == 1

    def semantic_search(self, query_text: str, top_k: int = 20) -> List[Entry]:
        """
        Cosine-similarity search over stored float32 embedding blobs.
        Returns up to top_k entries sorted by descending similarity.
        Returns empty list if no embeddings exist or Ollama is unavailable.
        """
        from backend.llm import embed_text  # local import to avoid circular dependency
        query_vec = embed_text(query_text)
        if not query_vec:
            return []
        q_norm = math.sqrt(sum(x * x for x in query_vec))
        if q_norm == 0:
            return []

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM entries WHERE embedding IS NOT NULL ORDER BY timestamp DESC"
            )
            rows = cursor.fetchall()

        scored = []
        for row in rows:
            blob = row["embedding"]
            if not blob:
                continue
            n = len(blob) // 4
            if n != len(query_vec):
                continue
            vec = struct.unpack(f"{n}f", blob)
            dot = sum(a * b for a, b in zip(query_vec, vec))
            v_norm = math.sqrt(sum(x * x for x in vec))
            if v_norm == 0:
                continue
            scored.append((dot / (q_norm * v_norm), row))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [self._row_to_entry(row) for _, row in scored[:top_k]]

    def search_entries(self, query: str = "", sort_by: str = "recency", mode: str = "keyword") -> List[Entry]:
        """
        mode: "keyword" (FTS5 + metadata filters, default)
              "semantic" (embedding cosine similarity; falls back to keyword FTS5 if Ollama is offline)
        """
        if mode == "semantic" and query.strip():
            sem = self.semantic_search(query.strip())
            if sem:
                return sem
            # Semantic unavailable — fall back to FTS5 OR across each query word
            fts_fallback = " OR ".join(f"{w}*" for w in query.split() if w.strip())
            return self.search_entries(fts_fallback, sort_by, mode="keyword")

        # --- keyword / metadata filter path ---
        # Parse query for metadata tags inside keyword boundaries (e.g. status:open, bucket:TT, tag:xyz)
        filters = {}
        tag_filters = []
        cleaned_words = []
        for word in query.split():
            if ":" in word:
                key, val = word.split(":", 1)
                key = key.lower()
                if key == "tag":
                    for sub_tag in val.split(","):
                        if sub_tag.strip():
                            tag_filters.append(sub_tag.strip().lower())
                else:
                    filters[key] = val.lower()
            else:
                cleaned_words.append(word)
        
        keyword_query = " ".join(cleaned_words).strip()
        
        sql = "SELECT * FROM entries"
        params = []
        where_clauses = []

        # Apply specific status and bucket filters if extracted
        if "status" in filters:
            where_clauses.append("status = ?")
            params.append(filters["status"])
        if "bucket" in filters:
            b_val = filters["bucket"].upper()
            if b_val == "EPIC": b_val = "GOAL"
            elif b_val == "US": b_val = "NOTE"
            elif b_val == "TT": b_val = "TASK"
            elif b_val == "PT": b_val = "ISSUE"
            where_clauses.append("upper(bucket) = ?")
            params.append(b_val)
        if "parent" in filters:
            p_id = filters["parent"]
            if not p_id.startswith("#"):
                p_id = f"#{p_id}"
            where_clauses.append("parent_id = ?")
            params.append(p_id)

        # Apply tag intersection filter (reduces results, since each tag must be matched via AND)
        for t in tag_filters:
            where_clauses.append("(',' || tags || ',') LIKE ?")
            params.append(f"%,{t},%")

        # If we have free-text query, use FTS5 full-text match with general fallback
        if keyword_query:
            try:
                # Try FTS5 matching first
                fts_sql = """
                    SELECT e.* FROM entries e 
                    JOIN entries_fts f ON e.id = f.id 
                    WHERE entries_fts MATCH ?
                """
                has_fts_operators = any(token in keyword_query for token in (" OR ", " AND ", " NOT ", "(", ")", '"', "*"))
                fts_query = keyword_query if has_fts_operators else f"{keyword_query}*"
                fts_params = [fts_query]
                
                # Stack extra criteria
                if where_clauses:
                    qualified_clauses = []
                    for c in where_clauses:
                        qc = c.replace("status =", "e.status =").replace("upper(bucket) =", "upper(e.bucket) =").replace("tags", "e.tags")
                        qualified_clauses.append(qc)
                    fts_sql += " AND " + " AND ".join(qualified_clauses)
                    fts_params.extend(params)
                
                if sort_by == "relevance":
                    fts_sql += " ORDER BY f.rank ASC, e.timestamp DESC"
                else:
                    fts_sql += " ORDER BY e.timestamp DESC"
                
                with self._get_connection() as conn:
                    cursor = conn.execute(fts_sql, fts_params)
                    rows = cursor.fetchall()
                    if rows:
                        return [self._row_to_entry(r) for r in rows]
            except sqlite3.OperationalError:
                # Fallback to slower traditional LIKE queries if FTS parsing fails
                pass

            # standard LIKE query construction
            like_query = f"%{keyword_query}%"
            where_clauses.append("(title LIKE ? OR tags LIKE ? OR description LIKE ? OR id LIKE ?)")
            params.extend([like_query, like_query, like_query, like_query])

        if where_clauses:
            sql += " WHERE " + " AND ".join(where_clauses)
        
        sql += " ORDER BY timestamp DESC"

        with self._get_connection() as conn:
            cursor = conn.execute(sql, params)
            rows = cursor.fetchall()
            results = [self._row_to_entry(row) for row in rows]
            
            # Post-sort by relevance in Python if FTS5 wasn't triggered but sort_by is relevance
            if sort_by == "relevance" and keyword_query:
                def get_relevance_score(item: Entry):
                    score = 0
                    q = keyword_query.lower()
                    if q in item.title.lower(): score += 10
                    if item.tags and q in item.tags.lower(): score += 5
                    if item.description and q in item.description.lower(): score += 2
                    return score
                results.sort(key=get_relevance_score, reverse=True)
                
            return results

    def update_entry(self, entry_id: str, patch: PartialEntry) -> Optional[Entry]:
        # Standardize ID prefix symbol
        if not entry_id.startswith("#"):
            entry_id = f"#{int(entry_id):04d}" if entry_id.isdigit() else f"#{entry_id}"

        entry = self.get_entry(entry_id)
        if not entry:
            return None

        update_fields = []
        params = []

        # Map non-none fields dynamically
        fields_to_map = {
            "bucket": patch.bucket.value if patch.bucket else None,
            "title": patch.title,
            "tags": patch.tags,
            "description": patch.description,
            "status": patch.status,
            "parent_id": patch.parent_id
        }

        for k, v in fields_to_map.items():
            if v is not None:
                update_fields.append(f"{k} = ?")
                params.append(v)

        if not update_fields:
            return entry

        params.append(entry_id)
        sql = f"UPDATE entries SET {', '.join(update_fields)} WHERE id = ?"

        with self._get_connection() as conn:
            conn.execute(sql, params)
            conn.commit()

        return self.get_entry(entry_id)

    def delete_entry(self, entry_id: str) -> bool:
        if not entry_id.startswith("#"):
            entry_id = f"#{int(entry_id):04d}" if entry_id.isdigit() else f"#{entry_id}"

        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
            conn.commit()
            return cursor.rowcount > 0

    def export_all_entries(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            # Exclude embedding BLOB — it's a machine-generated search index, not user data,
            # and bytes are not JSON-serialisable. It will be regenerated on the next search.
            cursor = conn.execute(
                "SELECT id, seq, bucket, title, tags, description, timestamp, status, attachments, parent_id "
                "FROM entries ORDER BY seq ASC"
            )
            return [dict(row) for row in cursor.fetchall()]

    def import_all_entries(self, entries_list: List[Dict[str, Any]]):
        """
        Accept an array of records and overwrite database atomically.
        Avoid duplicate insertions and handle sequence preservation.
        """
        with self._get_connection() as conn:
            # Purge existing data and recreate safely
            conn.execute("DELETE FROM entries")
            conn.execute("DELETE FROM entries_fts")
            
            for entry in entries_list:
                # Support custom timestamps or fallback to now
                ts = entry.get("timestamp") or datetime.now(timezone.utc).isoformat()
                
                # Safely parse seq or recalculate sequence mapping
                id_str = entry.get("id", "")
                seq_val = entry.get("seq")
                if seq_val is None:
                    try:
                        seq_val = int(id_str.replace("#", "")) if id_str.startswith("#") else 1
                    except ValueError:
                        seq_val = 1

                bucket_val = entry.get("bucket") or "TASK"
                if bucket_val == "EPIC": bucket_val = "GOAL"
                elif bucket_val == "US": bucket_val = "NOTE"
                elif bucket_val == "TT": bucket_val = "TASK"
                elif bucket_val == "PT": bucket_val = "ISSUE"

                attachments_val = entry.get("attachments") or []
                if isinstance(attachments_val, list):
                    attachments_json = json.dumps(attachments_val)
                elif isinstance(attachments_val, str):
                    attachments_json = attachments_val
                else:
                    attachments_json = "[]"

                conn.execute(
                    """
                    INSERT INTO entries (id, seq, bucket, title, tags, description, timestamp, status, attachments)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        id_str,
                        seq_val,
                        bucket_val,
                        entry.get("title", "Untitled note"),
                        entry.get("tags") or "",
                        entry.get("description") or "",
                        ts,
                        entry.get("status", "open"),
                        attachments_json
                    )
                )
            conn.commit()

    # --- Conversation Session Handlers ---
    def create_conversation(self, title: Optional[str] = None, conversation_id: Optional[str] = None) -> str:
        now = datetime.now(timezone.utc).isoformat()
        conv_id = conversation_id or str(uuid.uuid4())
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO conversations (id, title, summary, created_at, updated_at)
                VALUES (?, ?, '', ?, ?)
                """,
                (conv_id, title or "MemoryVault Chat", now, now)
            )
            conn.commit()
        return conv_id

    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def ensure_conversation(self, conversation_id: Optional[str] = None, title: Optional[str] = None) -> str:
        if conversation_id and self.get_conversation(conversation_id):
            return conversation_id
        return self.create_conversation(title=title, conversation_id=conversation_id)

    def update_conversation_summary(self, conversation_id: str, summary: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE conversations SET summary = ?, updated_at = ? WHERE id = ?",
                (summary, now, conversation_id)
            )
            conn.commit()

    def add_conversation_turn(
        self,
        conversation_id: str,
        role: str,
        content: str,
        context_entry_ids: Optional[List[str]] = None,
        model_used: str = "",
        latency_ms: int = 0
    ) -> int:
        self.ensure_conversation(conversation_id)
        now = datetime.now(timezone.utc).isoformat()
        context_json = json.dumps(context_entry_ids or [])
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO conversation_turns (conversation_id, role, content, context_entry_ids, model_used, latency_ms, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, role, content, context_json, model_used, latency_ms, now)
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id)
            )
            conn.commit()
            return cursor.lastrowid or 0

    def get_recent_turns(self, conversation_id: str, limit: int = 8) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM conversation_turns
                WHERE conversation_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (conversation_id, limit)
            )
            rows = list(reversed(cursor.fetchall()))

        turns = []
        for row in rows:
            item = dict(row)
            try:
                item["context_entry_ids"] = json.loads(item.get("context_entry_ids") or "[]")
            except Exception:
                item["context_entry_ids"] = []
            turns.append(item)
        return turns

    def get_conversation_turn_count(self, conversation_id: str) -> int:
        with self._get_connection() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM conversation_turns WHERE conversation_id = ?",
                (conversation_id,)
            ).fetchone()[0]

    # --- Local Tracing Analytics Database Handlers ---
    def add_llm_trace(self, trace: LLMTrace) -> int:
        timestamp_str = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO llm_traces (prompt, response, model_used, latency_ms, status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    trace.prompt,
                    trace.response,
                    trace.model_used,
                    trace.latency_ms,
                    trace.status,
                    timestamp_str
                )
            )
            conn.commit()
            return cursor.lastrowid or 0

    def get_llm_traces(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM llm_traces ORDER BY id DESC LIMIT ?", (limit,)
            )
            return [dict(row) for row in cursor.fetchall()]
            
    def get_backlog_metrics(self) -> Dict[str, Any]:
        """
        Computes fast stats for visual css cards or charts.
        """
        with self._get_connection() as conn:
            total_items = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
            open_count = conn.execute("SELECT COUNT(*) FROM entries WHERE status = 'open'").fetchone()[0]
            progress_count = conn.execute("SELECT COUNT(*) FROM entries WHERE status = 'in-progress'").fetchone()[0]
            done_count = conn.execute("SELECT COUNT(*) FROM entries WHERE status = 'done'").fetchone()[0]
            
            buckets_cursor = conn.execute("SELECT bucket, COUNT(*) as qty FROM entries GROUP BY bucket")
            buckets_stat = {r["bucket"]: r["qty"] for r in buckets_cursor.fetchall()}
            
            # Fill missing keys automatically
            for b in ["GOAL", "NOTE", "TASK", "ISSUE", "EPIC", "US", "TT", "PT"]:
                if b not in buckets_stat:
                    buckets_stat[b] = 0

            # Map legacy keys if they are missing but our migrated DB has the new ones
            if buckets_stat["EPIC"] == 0:
                buckets_stat["EPIC"] = buckets_stat.get("GOAL", 0)
            if buckets_stat["US"] == 0:
                buckets_stat["US"] = buckets_stat.get("NOTE", 0)
            if buckets_stat["TT"] == 0:
                buckets_stat["TT"] = buckets_stat.get("TASK", 0)
            if buckets_stat["PT"] == 0:
                buckets_stat["PT"] = buckets_stat.get("ISSUE", 0)

            # Ensure EVENT, REMINDER, JOURNAL are also filled even if 0
            for extra_b in ["EVENT", "REMINDER", "JOURNAL"]:
                if extra_b not in buckets_stat:
                    buckets_stat[extra_b] = 0

            return {
                "total": total_items,
                "open": open_count,
                "in_progress": progress_count,
                "done": done_count,
                "buckets": buckets_stat
            }

    def get_buckets(self) -> List[BucketModel]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM buckets")
            rows = cursor.fetchall()
            return [
                BucketModel(
                    name=row["name"],
                    color=row["color"],
                    template=row["template"],
                    is_custom=bool(row["is_custom"])
                ) for row in rows
            ]

    def add_custom_bucket(self, name: str, color: str, template: Optional[str] = None) -> bool:
        normalized_name = name.strip().upper()
        if not normalized_name:
            return False
            
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO buckets (name, color, template, is_custom)
                VALUES (?, ?, ?, 1)
                """,
                (normalized_name, color, template)
            )
            conn.commit()
            return True

    def delete_custom_bucket(self, name: str) -> bool:
        normalized_name = name.strip().upper()
        if normalized_name in ["GOAL", "NOTE", "TASK", "ISSUE", "EVENT", "REMINDER", "JOURNAL"]:
            return False
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM buckets WHERE name = ? AND is_custom = 1", (normalized_name,))
            conn.commit()
            return cursor.rowcount > 0
