"""Project CRUD endpoints (T019)."""

import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status

from agent_orchestrator.db.database import DATA_DIR, get_db
from agent_orchestrator.models.project import Project, ProjectCreate, ProjectUpdate
from agent_orchestrator.services import nats_service
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
        model=row["model"],
        auth_header=row["auth_header"],
        status=row["status"],
        dev_server_url=row["dev_server_url"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).model_dump(mode="json")


def _redact(project_dict: dict) -> dict:
    """Return a copy of a project dict with secret fields stripped.

    ``auth_header`` is a credential — it must never reach the Chrome extension
    (which reads the project list over HTTP and subscribes to project events over
    NATS/WebSocket). The single-project GET is Electron-only and returns it intact
    so the detail UI can edit it.
    """
    redacted = dict(project_dict)
    redacted.pop("auth_header", None)
    return redacted


@router.get("/projects")
async def list_projects():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM projects ORDER BY created_at DESC")
    rows = await cursor.fetchall()

    # Enrich with running agent counts per project
    agent_cursor = await db.execute(
        "SELECT project_id, COUNT(*) as cnt, MIN(created_at) as earliest "
        "FROM agents WHERE status = 'running' AND project_id IS NOT NULL "
        "GROUP BY project_id"
    )
    agent_rows = await agent_cursor.fetchall()
    agent_map: dict[str, dict] = {}
    now = datetime.now(UTC)
    for ar in agent_rows:
        try:
            earliest = datetime.fromisoformat(ar["earliest"])
            if earliest.tzinfo is None:
                earliest = earliest.replace(tzinfo=UTC)
            elapsed = int((now - earliest).total_seconds())
        except (ValueError, TypeError):
            elapsed = 0
        agent_map[ar["project_id"]] = {
            "agentCount": ar["cnt"],
            "agentRunningSeconds": max(elapsed, 0),
        }

    projects = []
    for r in rows:
        p = _redact(_row_to_project(r))
        info = agent_map.get(r["id"], {})
        p["agentCount"] = info.get("agentCount", 0)
        p["agentRunningSeconds"] = info.get("agentRunningSeconds", 0)
        projects.append(p)

    return projects


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
    project_data = _row_to_project(row)

    await nats_service.publish("vex.project.events", {
        "event": "created",
        "project_id": project_id,
        "project": _redact(project_data),
        "timestamp": now,
    })

    return project_data


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

    # "default" / "" mean "use the Claude Code default" — stored as NULL.
    if updates.get("model") in ("", "default"):
        updates["model"] = None

    # An empty auth header means "no auth" — stored as NULL so injection is skipped.
    if "auth_header" in updates and not (updates["auth_header"] or "").strip():
        updates["auth_header"] = None

    updates["updated_at"] = datetime.now(UTC).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id]

    await db.execute(
        f"UPDATE projects SET {set_clause} WHERE id = ?", values
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = await cursor.fetchone()
    project_data = _row_to_project(row)

    await nats_service.publish("vex.project.events", {
        "event": "updated",
        "project_id": project_id,
        "project": _redact(project_data),
        "timestamp": updates["updated_at"],
    })

    return project_data


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, delete_source: bool = False):
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, path FROM projects WHERE id = ?", (project_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project_path = row["path"]

    # Delete trace steps and agent traces for all batches in this project
    await db.execute(
        "DELETE FROM trace_steps WHERE trace_id IN "
        "(SELECT id FROM agent_traces WHERE batch_id IN "
        "(SELECT id FROM batches WHERE project_id = ?))",
        (project_id,),
    )
    await db.execute(
        "DELETE FROM agent_traces WHERE batch_id IN "
        "(SELECT id FROM batches WHERE project_id = ?)",
        (project_id,),
    )

    # Delete agents spawned for this project's batches (via tasks)
    agent_cursor = await db.execute(
        "SELECT DISTINCT agent_id FROM tasks WHERE batch_id IN "
        "(SELECT id FROM batches WHERE project_id = ?)",
        (project_id,),
    )
    agent_ids = [row["agent_id"] for row in await agent_cursor.fetchall()]

    await db.execute(
        "DELETE FROM tasks WHERE batch_id IN "
        "(SELECT id FROM batches WHERE project_id = ?)",
        (project_id,),
    )

    if agent_ids:
        placeholders = ",".join("?" * len(agent_ids))
        await db.execute(
            f"DELETE FROM activity_events WHERE agent_id IN ({placeholders})",
            agent_ids,
        )
        await db.execute(
            f"DELETE FROM agents WHERE id IN ({placeholders})", agent_ids
        )

    # Delete any remaining activity events linked directly to the project
    await db.execute(
        "DELETE FROM activity_events WHERE project_id = ?", (project_id,)
    )

    # Delete any remaining agents linked directly to the project
    await db.execute("DELETE FROM agents WHERE project_id = ?", (project_id,))

    # Delete the project row (batches, actions, config cascade via FK)
    await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    await db.commit()

    await nats_service.publish("vex.project.events", {
        "event": "deleted",
        "project_id": project_id,
        "timestamp": datetime.now(UTC).isoformat(),
    })

    # Clean up screenshot directory from filesystem
    project_data_dir = DATA_DIR / project_id
    if project_data_dir.exists():
        shutil.rmtree(project_data_dir)

    # Optionally delete the project source directory
    if delete_source and project_path:
        source_dir = Path(project_path)
        if source_dir.exists() and source_dir.is_dir():
            shutil.rmtree(source_dir)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
