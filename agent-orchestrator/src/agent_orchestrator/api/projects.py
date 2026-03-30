"""Project CRUD endpoints (T019)."""

import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.project import Project, ProjectCreate, ProjectUpdate
from agent_orchestrator.services.project_detector import detect as detect_project

router = APIRouter(tags=["projects"])


def _row_to_project(row) -> dict:
    return Project(
        id=row["id"],
        name=row["name"],
        path=row["path"],
        framework=row["framework"],
        dev_command=row["dev_command"],
        dev_port=row["dev_port"],
        package_manager=row["package_manager"],
        styling_approach=row["styling_approach"],
        status=row["status"],
        dev_server_url=row["dev_server_url"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).model_dump(mode="json")


@router.get("/projects")
async def list_projects():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM projects ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_project(r) for r in rows]


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate):
    db = await get_db()
    project_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    name = body.name or Path(body.path).name

    # Auto-detect project properties.
    detected = detect_project(body.path)

    await db.execute(
        """INSERT INTO projects (id, name, path, framework, dev_command, dev_port,
           package_manager, styling_approach, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (project_id, name, body.path,
         detected["framework"], detected["dev_command"], detected["dev_port"],
         detected["package_manager"], detected["styling_approach"],
         now, now),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = await cursor.fetchone()
    return _row_to_project(row)


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _row_to_project(row)


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate):
    db = await get_db()

    # Verify exists
    cursor = await db.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(UTC).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id]

    await db.execute(
        f"UPDATE projects SET {set_clause} WHERE id = ?", values
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = await cursor.fetchone()
    return _row_to_project(row)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
