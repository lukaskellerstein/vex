"""Activity event endpoints."""

import json

from fastapi import APIRouter, Query

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.activity import ActivityEvent

router = APIRouter(tags=["activity"])


def _row_to_event(row) -> dict:
    meta = json.loads(row["meta"]) if row["meta"] else None
    return ActivityEvent(
        id=row["id"],
        type=row["type"],
        project_id=row["project_id"],
        project_name=row["project_name"],
        agent_id=row["agent_id"],
        agent_name=row["agent_name"],
        summary=row["summary"],
        meta=meta,
        created_at=row["created_at"],
    ).model_dump(mode="json")


@router.get("/activity")
async def list_activity(
    project_id: str | None = Query(default=None),
    type: str | None = Query(default=None),
    since: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
):
    db = await get_db()
    conditions = []
    params: list = []

    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)
    if type:
        conditions.append("type = ?")
        params.append(type)
    if since:
        conditions.append("created_at > ?")
        params.append(since)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    cursor = await db.execute(
        f"SELECT * FROM activity_events {where} ORDER BY created_at DESC LIMIT ?",
        params + [limit],
    )
    rows = await cursor.fetchall()
    return [_row_to_event(r) for r in rows]


@router.get("/activity/stats")
async def activity_stats(since: str | None = Query(default=None)):
    db = await get_db()
    time_filter = ""
    params: list = []
    if since:
        time_filter = "AND created_at > ?"
        params.append(since)

    cursor = await db.execute(
        f"SELECT COUNT(*) as cnt FROM activity_events WHERE type = 'batch_completed' {time_filter}",
        params,
    )
    row = await cursor.fetchone()
    completed = row["cnt"] if row else 0

    cursor = await db.execute(
        f"SELECT COUNT(*) as cnt FROM activity_events WHERE type = 'batch_failed' {time_filter}",
        params,
    )
    row = await cursor.fetchone()
    failed = row["cnt"] if row else 0

    cursor = await db.execute(
        f"""SELECT COALESCE(SUM(json_extract(meta, '$.action_count')), 0) as total
            FROM activity_events WHERE type IN ('batch_completed', 'batch_failed') {time_filter}""",
        params,
    )
    row = await cursor.fetchone()
    total_actions = row["total"] if row else 0

    cursor = await db.execute("SELECT COUNT(*) as cnt FROM agents WHERE status = 'running'")
    row = await cursor.fetchone()
    active_agents = row["cnt"] if row else 0

    cursor = await db.execute(
        f"""SELECT COALESCE(SUM(json_extract(meta, '$.cost_usd')), 0) as total
            FROM activity_events WHERE type IN ('batch_completed', 'batch_failed') {time_filter}""",
        params,
    )
    row = await cursor.fetchone()
    total_cost = row["total"] if row else 0

    return {
        "completed_batches": completed,
        "failed_batches": failed,
        "total_actions": int(total_actions),
        "active_agents": active_agents,
        "total_cost_usd": round(float(total_cost), 4),
    }
