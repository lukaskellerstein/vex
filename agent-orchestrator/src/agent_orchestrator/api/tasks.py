"""Task endpoints (T042)."""

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.task import Task, TaskCreate, TaskResult, TaskStatus
from agent_orchestrator.services.task_router import TaskRouter

router = APIRouter(tags=["tasks"])

_task_router = TaskRouter()


def _row_to_task(row) -> dict:
    context = json.loads(row["context"]) if row["context"] else None
    return Task(
        id=row["id"],
        project_id=row["project_id"],
        agent_id=row["agent_id"],
        type=row["type"],
        status=row["status"],
        prompt=row["prompt"],
        context=context,
        result=row["result"],
        error=row["error"],
        created_at=row["created_at"],
        assigned_at=row["assigned_at"],
        completed_at=row["completed_at"],
    ).model_dump(mode="json")


@router.get("/tasks")
async def list_tasks(
    project_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
):
    db = await get_db()
    conditions = []
    params: list = []

    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)
    if status:
        conditions.append("status = ?")
        params.append(status)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    cursor = await db.execute(
        f"SELECT * FROM tasks {where} ORDER BY created_at DESC LIMIT ?",
        params + [limit],
    )
    rows = await cursor.fetchall()
    return [_row_to_task(r) for r in rows]


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate):
    db = await get_db()

    # Verify project exists
    cursor = await db.execute("SELECT id FROM projects WHERE id = ?", (body.project_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    task_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    context_json = json.dumps(body.context) if body.context else None

    await db.execute(
        """INSERT INTO tasks (id, project_id, type, status, prompt, context, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (task_id, body.project_id, body.type, TaskStatus.PENDING, body.prompt, context_json, now),
    )
    await db.commit()

    # Route task to an available agent
    agent_id = await _task_router.route_task(body.type, body.project_id)
    if agent_id:
        await db.execute(
            "UPDATE tasks SET agent_id = ?, status = ?, assigned_at = ? WHERE id = ?",
            (agent_id, TaskStatus.ASSIGNED, datetime.now(UTC).isoformat(), task_id),
        )
        await db.commit()

    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    return _row_to_task(row)


@router.get("/tasks/pending")
async def list_pending_tasks(capability: str | None = Query(default=None)):
    db = await get_db()
    if capability:
        cursor = await db.execute(
            "SELECT * FROM tasks WHERE status = ? AND type = ? ORDER BY created_at ASC",
            (TaskStatus.PENDING, capability),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC",
            (TaskStatus.PENDING,),
        )
    rows = await cursor.fetchall()
    return [_row_to_task(r) for r in rows]


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return _row_to_task(row)


@router.post("/tasks/{task_id}/result")
async def submit_result(task_id: str, body: TaskResult):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")

    now = datetime.now(UTC).isoformat()
    new_status = TaskStatus.COMPLETED if body.status == "completed" else TaskStatus.FAILED

    await db.execute(
        "UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?",
        (new_status, body.result, body.error, now, task_id),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    return _row_to_task(row)
