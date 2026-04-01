"""Batch endpoints (T021-T022)."""

import asyncio
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.batch import (
    BatchSubmission,
    BatchSummary,
)
from agent_orchestrator.services import batch_processor
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
    data["screenshot_before"] = row["screenshot_before_path"]
    data["screenshot_after"] = row["screenshot_after_path"]
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

    # Fire-and-forget: trigger batch processing (store ref for cancellation)
    task = asyncio.create_task(batch_processor.process_batch(project_id, batch_id))
    batch_processor.register_batch_task(batch_id, task)

    cursor = await db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,))
    row = await cursor.fetchone()
    return _row_to_summary(row)


@router.get("/projects/{project_id}/batches/{batch_id}/tasks")
async def get_batch_tasks(project_id: str, batch_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM batches WHERE id = ? AND project_id = ?",
        (batch_id, project_id),
    )
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    task_cursor = await db.execute(
        "SELECT * FROM tasks WHERE batch_id = ? ORDER BY created_at",
        (batch_id,),
    )
    task_rows = await task_cursor.fetchall()
    return {
        "tasks": [
            {
                "id": t["id"],
                "batch_id": t["batch_id"],
                "agent_id": t["agent_id"],
                "type": t["type"],
                "status": t["status"],
                "prompt": t["prompt"],
                "result": t["result"],
                "error": t["error"],
                "created_at": t["created_at"],
                "completed_at": t["completed_at"],
            }
            for t in task_rows
        ]
    }


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
    """Return all agent traces for a batch (one per action)."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM agent_traces WHERE batch_id = ? ORDER BY created_at",
        (batch_id,),
    )
    rows = await cursor.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="Trace not found")

    traces = []
    for row in rows:
        step_cursor = await db.execute(
            "SELECT * FROM trace_steps WHERE trace_id = ? ORDER BY sequence_index",
            (row["id"],),
        )
        step_rows = await step_cursor.fetchall()

        # Fetch the prompt from the tasks table
        task_cursor = await db.execute(
            "SELECT prompt FROM tasks WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1",
            (row["agent_id"],),
        )
        task_row = await task_cursor.fetchone()

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

        traces.append({
            "id": row["id"],
            "batch_id": row["batch_id"],
            "agent_id": row["agent_id"],
            "agent_name": row["agent_name"],
            "agent_model": row["agent_model"],
            "prompt": task_row["prompt"] if task_row else None,
            "status": row["status"],
            "total_duration_ms": row["total_duration_ms"],
            "total_cost_usd": row["total_cost_usd"],
            "total_tokens": row["total_tokens"],
            "input_tokens": row["input_tokens"] if "input_tokens" in row.keys() else None,
            "output_tokens": row["output_tokens"] if "output_tokens" in row.keys() else None,
            "steps": steps,
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        })

    return {"traces": traces}


@router.get("/cursors")
async def get_active_cursors(page_url: str):
    """Return cursor data for all actively processing batches on a given page URL."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT id FROM batches WHERE page_url = ? AND status = 'processing'",
        (page_url,),
    )
    batch_rows = await cursor.fetchall()

    all_agents = []
    for batch_row in batch_rows:
        batch_id = batch_row["id"]
        # Get actions (selectors) for this batch
        action_cursor = await db.execute(
            "SELECT sequence_index, selector FROM actions WHERE batch_id = ? ORDER BY sequence_index",
            (batch_id,),
        )
        actions = await action_cursor.fetchall()

        # Get tasks (agent IDs) for this batch, joined with agent status
        task_cursor = await db.execute(
            """SELECT t.agent_id, a.status AS agent_status
               FROM tasks t
               LEFT JOIN agents a ON a.id = t.agent_id
               WHERE t.batch_id = ?
               ORDER BY t.created_at""",
            (batch_id,),
        )
        tasks = await task_cursor.fetchall()

        # Match actions to agents by index, skip agents that already finished
        for idx, action in enumerate(actions):
            if idx >= len(tasks):
                continue
            agent_id = tasks[idx]["agent_id"]
            agent_status = tasks[idx]["agent_status"] or ""

            # Don't return agents that are already stopped/failed/error
            if agent_status in ("stopped", "failed", "error"):
                continue

            # Use same format as Electron UI: agent-{agentId[:8]}
            agent_name = f"agent-{agent_id[:8]}"

            all_agents.append({
                "agentId": agent_id,
                "agentName": agent_name,
                "selector": action["selector"],
                "colorIndex": idx,
                "batchId": batch_id,
            })

    return {"agents": all_agents}


@router.post("/projects/{project_id}/batches/{batch_id}/stop")
async def stop_batch(project_id: str, batch_id: str):
    """Stop a running batch and all its agents."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, status FROM batches WHERE id = ? AND project_id = ?",
        (batch_id, project_id),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Batch not found")

    if row["status"] not in ("pending", "processing"):
        raise HTTPException(
            status_code=409,
            detail=f"Batch is already {row['status']}",
        )

    stopped = await batch_processor.stop_batch(batch_id)

    if not stopped:
        # No active task found (orphaned from AO restart) — force-cancel in DB
        now = datetime.now(UTC).isoformat()
        await db.execute(
            "UPDATE batches SET status = 'cancelled', completed_at = ? WHERE id = ?",
            (now, batch_id),
        )
        # Also stop any orphaned agents/tasks for this batch
        await db.execute(
            """UPDATE agents SET status = 'stopped'
               WHERE id IN (SELECT agent_id FROM tasks WHERE batch_id = ?)
               AND status NOT IN ('completed', 'failed', 'stopped', 'error')""",
            (batch_id,),
        )
        await db.execute(
            """UPDATE tasks SET status = 'failed', error = 'Cancelled by user', completed_at = ?
               WHERE batch_id = ? AND status NOT IN ('completed', 'failed')""",
            (now, batch_id),
        )
        await db.commit()

    return {
        "batch_id": batch_id,
        "status": "cancelled",
        "stopped": stopped,
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

    # Clean up screenshot files before cascading deletes
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

    # Find agents spawned for this batch (via tasks table)
    agent_cursor = await db.execute(
        "SELECT DISTINCT agent_id FROM tasks WHERE batch_id = ?", (batch_id,),
    )
    agent_ids = [row["agent_id"] for row in await agent_cursor.fetchall()]

    # Delete trace_steps and agent_traces for this batch
    await db.execute("DELETE FROM trace_steps WHERE trace_id IN (SELECT id FROM agent_traces WHERE batch_id = ?)", (batch_id,))
    await db.execute("DELETE FROM agent_traces WHERE batch_id = ?", (batch_id,))

    # Delete tasks linked to this batch
    await db.execute("DELETE FROM tasks WHERE batch_id = ?", (batch_id,))

    # Delete activity events for agents spawned by this batch
    if agent_ids:
        placeholders = ",".join("?" * len(agent_ids))
        await db.execute(f"DELETE FROM activity_events WHERE agent_id IN ({placeholders})", agent_ids)

    # Delete the agents themselves
    if agent_ids:
        await db.execute(f"DELETE FROM agents WHERE id IN ({placeholders})", agent_ids)

    # Delete the batch (actions cascade-delete via FK)
    await db.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
