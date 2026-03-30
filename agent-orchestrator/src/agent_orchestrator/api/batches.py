"""Batch endpoints (T021-T022)."""

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.batch import (
    BatchSubmission,
    BatchSummary,
)
from agent_orchestrator.services.screenshot_store import delete_screenshot, save_screenshot

router = APIRouter(tags=["batches"])


def _row_to_summary(row) -> dict:
    return BatchSummary(
        id=row["id"],
        project_id=row["project_id"],
        page_url=row["page_url"],
        page_title=row["page_title"],
        action_count=row["action_count"],
        status=row["status"],
        duration_ms=row["duration_ms"],
        cost_usd=row["cost_usd"],
        error_message=row["error_message"],
        agent_id=row["agent_id"],
        submitted_at=row["submitted_at"],
        completed_at=row["completed_at"],
    ).model_dump(mode="json")


def _action_row_to_data(row) -> dict:
    data = json.loads(row["data"])
    data["screenshot_before"] = None
    data["screenshot_after"] = None
    return data


@router.post(
    "/projects/{project_id}/batches", status_code=status.HTTP_201_CREATED
)
async def submit_batch(project_id: str, body: BatchSubmission):
    db = await get_db()

    # Verify project exists
    cursor = await db.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    batch_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    payload = body.batch

    await db.execute(
        """INSERT INTO batches (id, project_id, page_url, page_title, action_count, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (batch_id, project_id, payload.page_url, payload.page_title, len(payload.actions), now),
    )

    for idx, action in enumerate(payload.actions):
        action_id = uuid.uuid4().hex

        # Extract and save screenshots
        screenshot_before_path = None
        screenshot_after_path = None
        if action.screenshot_before:
            screenshot_before_path = save_screenshot(project_id, action.screenshot_before)
        if action.screenshot_after:
            screenshot_after_path = save_screenshot(project_id, action.screenshot_after)

        # Store action data without base64 screenshots
        action_data = action.model_dump(exclude={"screenshot_before", "screenshot_after"})
        data_json = json.dumps(action_data)

        await db.execute(
            """INSERT INTO actions (id, batch_id, sequence_index, type, selector, data,
               screenshot_before_path, screenshot_after_path, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                action_id, batch_id, idx, action.type, action.selector,
                data_json, screenshot_before_path, screenshot_after_path, now,
            ),
        )

    await db.commit()

    cursor = await db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,))
    row = await cursor.fetchone()
    return _row_to_summary(row)


@router.get("/projects/{project_id}/batches")
async def list_batches(project_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM batches WHERE project_id = ? ORDER BY submitted_at DESC",
        (project_id,),
    )
    rows = await cursor.fetchall()
    return [_row_to_summary(r) for r in rows]


@router.get("/projects/{project_id}/batches/latest")
async def get_latest_batch(project_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM batches WHERE project_id = ? ORDER BY submitted_at DESC LIMIT 1",
        (project_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No batches found")

    action_cursor = await db.execute(
        "SELECT * FROM actions WHERE batch_id = ? ORDER BY sequence_index",
        (row["id"],),
    )
    action_rows = await action_cursor.fetchall()
    actions = [_action_row_to_data(a) for a in action_rows]

    result = _row_to_summary(row)
    result["actions"] = actions
    return result


@router.get("/projects/{project_id}/batches/{batch_id}")
async def get_batch(project_id: str, batch_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM batches WHERE id = ? AND project_id = ?",
        (batch_id, project_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    action_cursor = await db.execute(
        "SELECT * FROM actions WHERE batch_id = ? ORDER BY sequence_index",
        (batch_id,),
    )
    action_rows = await action_cursor.fetchall()
    actions = [_action_row_to_data(a) for a in action_rows]

    result = _row_to_summary(row)
    result["actions"] = actions
    return result


@router.get("/batches/{batch_id}/trace")
async def get_batch_trace(batch_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM agent_traces WHERE batch_id = ?", (batch_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Trace not found")

    step_cursor = await db.execute(
        "SELECT * FROM trace_steps WHERE trace_id = ? ORDER BY sequence_index",
        (row["id"],),
    )
    step_rows = await step_cursor.fetchall()

    steps = []
    for s in step_rows:
        metadata = json.loads(s["metadata"]) if s["metadata"] else None
        steps.append({
            "id": s["id"],
            "sequence_index": s["sequence_index"],
            "type": s["type"],
            "content": s["content"],
            "metadata": metadata,
            "duration_ms": s["duration_ms"],
            "token_count": s["token_count"],
            "created_at": s["created_at"],
        })

    return {
        "id": row["id"],
        "batch_id": row["batch_id"],
        "agent_id": row["agent_id"],
        "agent_name": row["agent_name"],
        "agent_model": row["agent_model"],
        "status": row["status"],
        "total_duration_ms": row["total_duration_ms"],
        "total_cost_usd": row["total_cost_usd"],
        "total_tokens": row["total_tokens"],
        "steps": steps,
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


@router.delete(
    "/projects/{project_id}/batches/{batch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_batch(project_id: str, batch_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT id FROM batches WHERE id = ? AND project_id = ?",
        (batch_id, project_id),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Actions cascade-delete via FK, but screenshot files need manual cleanup
    action_cursor = await db.execute(
        "SELECT screenshot_before_path, screenshot_after_path FROM actions WHERE batch_id = ?",
        (batch_id,),
    )
    action_rows = await action_cursor.fetchall()
    for a in action_rows:
        if a["screenshot_before_path"]:
            delete_screenshot(a["screenshot_before_path"])
        if a["screenshot_after_path"]:
            delete_screenshot(a["screenshot_after_path"])

    await db.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
