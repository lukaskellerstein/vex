"""Health and configuration endpoints."""

import time
from datetime import UTC, datetime

from fastapi import APIRouter

from agent_orchestrator.db.database import get_db
from agent_orchestrator.services import nats_service

router = APIRouter()

_start_time = time.time()


@router.get("/health")
async def health():
    db = await get_db()
    try:
        await db.execute("SELECT 1")
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {
        "status": "healthy" if db_status == "ok" else "degraded",
        "uptime": int(time.time() - _start_time),
        "agentCount": 0,
        "natsConnected": nats_service.is_connected(),
        "dbStatus": db_status,
    }


@router.get("/config")
async def get_config():
    """Return all global config as a flat dict."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT key, value FROM config WHERE scope = 'global'"
    )
    rows = await cursor.fetchall()
    return {row["key"]: row["value"] for row in rows}


@router.patch("/config")
async def update_config(body: dict):
    """Upsert each key-value pair into the global config table."""
    db = await get_db()
    now = datetime.now(UTC).isoformat()

    for key, value in body.items():
        await db.execute(
            """INSERT OR REPLACE INTO config (key, value, scope, updated_at)
               VALUES (?, ?, 'global', ?)""",
            (key, str(value), now),
        )
    await db.commit()

    # Return the full config after update
    cursor = await db.execute(
        "SELECT key, value FROM config WHERE scope = 'global'"
    )
    rows = await cursor.fetchall()
    return {row["key"]: row["value"] for row in rows}
