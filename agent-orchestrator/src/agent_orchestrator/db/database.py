"""SQLite database management with async access via aiosqlite."""

import aiosqlite
from pathlib import Path

DB_DIR = Path.home() / ".vex"
DB_PATH = DB_DIR / "vex.db"
DATA_DIR = DB_DIR / "data"

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    """Get the shared database connection."""
    global _db
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


async def init_db() -> None:
    """Initialize database: create dirs, connect, run schema."""
    global _db
    DB_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(str(DB_PATH))
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await _create_tables(_db)


async def close_db() -> None:
    """Close the database connection."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None


async def _create_tables(db: aiosqlite.Connection) -> None:
    """Create all tables if they don't exist."""
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            framework TEXT,
            dev_command TEXT,
            dev_port INTEGER DEFAULT 3000,
            package_manager TEXT,
            styling_approach TEXT,
            model TEXT,
            auth_header TEXT,
            status TEXT DEFAULT 'idle',
            dev_server_pid INTEGER,
            dev_server_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            tier INTEGER DEFAULT 1,
            capabilities TEXT NOT NULL,
            status TEXT DEFAULT 'registered',
            pid INTEGER,
            project_id TEXT,
            last_heartbeat TEXT,
            config TEXT,
            tasks_completed INTEGER DEFAULT 0,
            tasks_failed INTEGER DEFAULT 0,
            total_cost_usd REAL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            page_url TEXT NOT NULL,
            page_title TEXT NOT NULL,
            action_count INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            duration_ms INTEGER,
            cost_usd REAL,
            error_message TEXT,
            agent_id TEXT,
            submitted_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS actions (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL,
            sequence_index INTEGER NOT NULL,
            type TEXT NOT NULL,
            selector TEXT NOT NULL,
            data TEXT NOT NULL,
            screenshot_before_path TEXT,
            screenshot_after_path TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_actions_batch ON actions(batch_id, sequence_index);

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            agent_id TEXT,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            prompt TEXT NOT NULL,
            context TEXT,
            result TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            assigned_at TEXT,
            completed_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS config (
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            scope TEXT DEFAULT 'global',
            project_id TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_config_unique
            ON config(key, scope, COALESCE(project_id, ''));

        CREATE TABLE IF NOT EXISTS activity_events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            project_id TEXT,
            project_name TEXT,
            agent_id TEXT,
            agent_name TEXT,
            summary TEXT NOT NULL,
            meta TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_activity_created
            ON activity_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_project
            ON activity_events(project_id);
        CREATE INDEX IF NOT EXISTS idx_activity_type
            ON activity_events(type);

        CREATE TABLE IF NOT EXISTS agent_traces (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            agent_id TEXT,
            agent_name TEXT,
            agent_model TEXT,
            status TEXT DEFAULT 'running',
            total_duration_ms INTEGER,
            total_cost_usd REAL,
            total_tokens INTEGER,
            input_tokens INTEGER,
            output_tokens INTEGER,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS trace_steps (
            id TEXT PRIMARY KEY,
            trace_id TEXT NOT NULL,
            sequence_index INTEGER NOT NULL,
            type TEXT NOT NULL,
            content TEXT,
            metadata TEXT,
            duration_ms INTEGER,
            token_count INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (trace_id) REFERENCES agent_traces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_trace_steps_trace
            ON trace_steps(trace_id, sequence_index);

        CREATE TABLE IF NOT EXISTS subagent_metadata (
            id TEXT PRIMARY KEY,
            parent_agent_id TEXT NOT NULL,
            subagent_id TEXT NOT NULL,
            subagent_type TEXT NOT NULL,
            description TEXT,
            transcript_path TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_subagent_parent
            ON subagent_metadata(parent_agent_id);
        CREATE INDEX IF NOT EXISTS idx_subagent_sid
            ON subagent_metadata(subagent_id);
    """)

    # Migrations for existing databases: add new columns if missing.
    migrations = [
        ("batches", "duration_ms", "ALTER TABLE batches ADD COLUMN duration_ms INTEGER"),
        ("batches", "cost_usd", "ALTER TABLE batches ADD COLUMN cost_usd REAL"),
        ("batches", "error_message", "ALTER TABLE batches ADD COLUMN error_message TEXT"),
        ("batches", "agent_id", "ALTER TABLE batches ADD COLUMN agent_id TEXT REFERENCES agents(id)"),
        ("agents", "tasks_completed", "ALTER TABLE agents ADD COLUMN tasks_completed INTEGER DEFAULT 0"),
        ("agents", "tasks_failed", "ALTER TABLE agents ADD COLUMN tasks_failed INTEGER DEFAULT 0"),
        ("agents", "total_cost_usd", "ALTER TABLE agents ADD COLUMN total_cost_usd REAL DEFAULT 0"),
        ("tasks", "batch_id", "ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL"),
        ("agent_traces", "input_tokens", "ALTER TABLE agent_traces ADD COLUMN input_tokens INTEGER"),
        ("agent_traces", "output_tokens", "ALTER TABLE agent_traces ADD COLUMN output_tokens INTEGER"),
        ("projects", "model", "ALTER TABLE projects ADD COLUMN model TEXT"),
        ("projects", "auth_header", "ALTER TABLE projects ADD COLUMN auth_header TEXT"),
    ]
    for _table, _col, sql in migrations:
        try:
            await db.execute(sql)
        except Exception:
            pass  # Column already exists

    # Drop UNIQUE constraint on agent_traces.batch_id if present.
    # Earlier schema had batch_id UNIQUE (1 trace per batch), but the current
    # design creates 1 trace per action, so multiple traces per batch.
    try:
        row = await db.execute_fetchall(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_traces'"
        )
        if row and "UNIQUE" in (row[0][0] or ""):
            await db.executescript("""
                CREATE TABLE agent_traces_new (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT,
                    agent_id TEXT,
                    agent_name TEXT,
                    agent_model TEXT,
                    status TEXT DEFAULT 'running',
                    total_duration_ms INTEGER,
                    total_cost_usd REAL,
                    total_tokens INTEGER,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL,
                    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
                );
                INSERT INTO agent_traces_new SELECT * FROM agent_traces;
                DROP TABLE agent_traces;
                ALTER TABLE agent_traces_new RENAME TO agent_traces;
            """)
    except Exception:
        pass  # Table doesn't exist yet or migration already applied

    await db.commit()
