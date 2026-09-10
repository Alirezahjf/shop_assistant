# ============================================================================
# db.py — پایگاه داده SQLite (WAL) + مهاجرت خودکار
# ============================================================================
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Optional

from .config import DB_PATH

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    device_label TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'upload',          -- upload | telegram | sample | paste
    source_file TEXT NOT NULL DEFAULT '',
    file_unique_id TEXT UNIQUE,                     -- ضد ایمپورت تکراری از تلگرام
    created_at TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    range_days INTEGER NOT NULL DEFAULT 30,
    snapshot_json TEXT NOT NULL,
    analysis_json TEXT,
    analysis_model TEXT,
    analyzed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_profiles_imported ON profiles(imported_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tg_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    with _lock:
        conn = connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db() -> None:
    with get_db() as db:
        db.executescript(SCHEMA)


# ---------------------------------------------------------------------------
# پروفایل‌ها
# ---------------------------------------------------------------------------
def next_uid(db: sqlite3.Connection) -> str:
    row = db.execute(
        "SELECT uid FROM profiles WHERE uid GLOB 'U-[0-9]*' ORDER BY CAST(substr(uid,3) AS INTEGER) DESC LIMIT 1"
    ).fetchone()
    max_n = 0
    if row:
        try:
            max_n = int(row["uid"].split("-")[1])
        except (IndexError, ValueError):
            max_n = 0
    return f"U-{max_n + 1:04d}"


def insert_profile(db: sqlite3.Connection, *, name: str, source: str, source_file: str,
                   file_unique_id: Optional[str], snapshot: dict) -> str:
    uid = next_uid(db)
    db.execute(
        """INSERT INTO profiles (uid, name, device_label, source, source_file, file_unique_id,
               created_at, imported_at, range_days, snapshot_json)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (uid, name, snapshot.get("deviceLabel", ""), source, source_file, file_unique_id,
         snapshot.get("createdAt", ""), int(time.time() * 1000), snapshot.get("rangeDays", 30),
         json.dumps(snapshot, ensure_ascii=False)),
    )
    return uid


def list_profiles(db: sqlite3.Connection) -> Iterable[sqlite3.Row]:
    return db.execute(
        """SELECT uid, name, device_label, source, source_file, created_at, imported_at,
                  range_days, snapshot_json, analysis_json, analysis_model, analyzed_at
           FROM profiles ORDER BY imported_at DESC"""
    )


def get_profile(db: sqlite3.Connection, uid: str) -> Optional[sqlite3.Row]:
    return db.execute("SELECT * FROM profiles WHERE uid = ?", (uid,)).fetchone()


def delete_profile(db: sqlite3.Connection, uid: str) -> bool:
    cur = db.execute("DELETE FROM profiles WHERE uid = ?", (uid,))
    return cur.rowcount > 0


def rename_profile(db: sqlite3.Connection, uid: str, name: str) -> bool:
    cur = db.execute("UPDATE profiles SET name = ? WHERE uid = ?", (name, uid))
    return cur.rowcount > 0


def save_analysis(db: sqlite3.Connection, uid: str, analysis: dict, model: str) -> None:
    db.execute(
        "UPDATE profiles SET analysis_json = ?, analysis_model = ?, analyzed_at = ? WHERE uid = ?",
        (json.dumps(analysis, ensure_ascii=False), model, int(time.time() * 1000), uid),
    )


def file_unique_id_exists(db: sqlite3.Connection, file_unique_id: str) -> bool:
    return db.execute("SELECT 1 FROM profiles WHERE file_unique_id = ?", (file_unique_id,)).fetchone() is not None


def global_stats(db: sqlite3.Connection) -> Dict[str, int]:
    row = db.execute(
        """SELECT COUNT(*) AS profiles,
                  COALESCE(SUM(json_extract(snapshot_json,'$.stats.domains')),0) AS domains,
                  COALESCE(SUM(json_extract(snapshot_json,'$.stats.searches')),0) AS searches,
                  COALESCE(SUM(json_extract(snapshot_json,'$.stats.totalVisits')),0) AS visits
           FROM profiles"""
    ).fetchone()
    return {k: row[k] for k in ("profiles", "domains", "searches", "visits")}


# ---------------------------------------------------------------------------
# settings / sessions / tg_state
# ---------------------------------------------------------------------------
def get_setting(db: sqlite3.Connection, key: str) -> Optional[str]:
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(db: sqlite3.Connection, key: str, value: str) -> None:
    db.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, value))


def delete_setting(db: sqlite3.Connection, key: str) -> None:
    db.execute("DELETE FROM settings WHERE key = ?", (key,))


def create_session(db: sqlite3.Connection, token: str, expires_at: int) -> None:
    db.execute("INSERT INTO sessions (token, expires_at) VALUES (?,?)", (token, expires_at))


def get_session(db: sqlite3.Connection, token: str) -> Optional[sqlite3.Row]:
    return db.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()


def delete_session(db: sqlite3.Connection, token: str) -> None:
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))


def purge_expired_sessions(db: sqlite3.Connection) -> None:
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))


def get_tg_state(db: sqlite3.Connection, key: str, default: str = "") -> str:
    row = db.execute("SELECT value FROM tg_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_tg_state(db: sqlite3.Connection, key: str, value: str) -> None:
    db.execute("INSERT INTO tg_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, value))
