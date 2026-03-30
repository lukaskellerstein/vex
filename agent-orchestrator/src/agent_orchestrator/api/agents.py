"""Agent endpoints (T026)."""

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Response, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.agent import Agent, AgentCreate, HeartbeatRequest

router = APIRouter(tags=["agents"])

# Tier mapping based on agent type
_TIER_MAP = {
    "claude-code-sdk": 1,
    "cli-wrapper": 2,
    "external": 3,
}


def _row_to_agent(row) -> dict:
    capabilities = json.loads(row["capabilities"]) if row["capabilities"] else []
    config = json.loads(row["config"]) if row["config"] else None
    return Agent(
        id=row["id"],
        name=row["name"],
        type=row["type"],
        tier=row["tier"],
        capabilities=capabilities,
        status=row["status"],
        pid=row["pid"],
        project_id=row["project_id"],
        last_heartbeat=row["last_heartbeat"],
        config=config,
        tasks_completed=row["tasks_completed"],
        tasks_failed=row["tasks_failed"],
        total_cost_usd=row["total_cost_usd"],
        created_at=row["created_at"],
    ).model_dump(mode="json")


@router.get("/agents")
async def list_agents():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_agent(r) for r in rows]


@router.post("/agents", status_code=status.HTTP_201_CREATED)
async def register_agent(body: AgentCreate):
    db = await get_db()
    agent_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    tier = _TIER_MAP.get(body.type, 1)
    capabilities_json = json.dumps(body.capabilities)

    await db.execute(
        """INSERT INTO agents (id, name, type, tier, capabilities, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (agent_id, body.name, body.type, tier, capabilities_json, now),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    return _row_to_agent(row)


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _row_to_agent(row)


@router.get("/agents/{agent_id}/logs")
async def get_agent_logs(
    agent_id: str,
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0),
):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # For now, return empty logs — agent log storage will be populated
    # when agents actually run and produce output
    return []


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deregister_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/agents/{agent_id}/heartbeat")
async def heartbeat(agent_id: str, body: HeartbeatRequest):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE agents SET last_heartbeat = ?, status = ? WHERE id = ?",
        (now, body.status, agent_id),
    )
    await db.commit()
    return {"status": "ok", "timestamp": now}


@router.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.execute(
        "UPDATE agents SET status = 'starting' WHERE id = ?", (agent_id,)
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    return _row_to_agent(row)


@router.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.execute(
        "UPDATE agents SET status = 'stopping' WHERE id = ?", (agent_id,)
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    return _row_to_agent(row)
