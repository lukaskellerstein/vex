"""MCP server wrapper — exposes orchestrator functionality as MCP tool definitions.

Each function directly queries the database (same process), avoiding HTTP
round-trips. The TOOL_DEFINITIONS list can be registered with any MCP-compatible
server framework.
"""

import json
import logging
from datetime import UTC, datetime

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


def _row_to_dict(row, keys: list[str]) -> dict:
    return {k: row[k] for k in keys}


async def vex_get_pending_batch(project_id: str) -> dict:
    """Get the latest batch for a project, including its actions."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM batches WHERE project_id = ? ORDER BY submitted_at DESC LIMIT 1",
        (project_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return {"error": "No batches found", "project_id": project_id}

    batch = {
        "id": row["id"],
        "project_id": row["project_id"],
        "page_url": row["page_url"],
        "page_title": row["page_title"],
        "action_count": row["action_count"],
        "status": row["status"],
        "submitted_at": row["submitted_at"],
        "completed_at": row["completed_at"],
    }

    action_cursor = await db.execute(
        "SELECT * FROM actions WHERE batch_id = ? ORDER BY sequence_index",
        (row["id"],),
    )
    action_rows = await action_cursor.fetchall()
    batch["actions"] = [json.loads(a["data"]) for a in action_rows]
    return batch


async def vex_get_task(task_id: str) -> dict:
    """Get a task by ID."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = await cursor.fetchone()
    if row is None:
        return {"error": "Task not found", "task_id": task_id}

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


async def vex_submit_result(task_id: str, status: str, result: str | None = None) -> dict:
    """Submit a result for a task."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
    if await cursor.fetchone() is None:
        return {"error": "Task not found", "task_id": task_id}

    now = datetime.now(UTC).isoformat()
    new_status = TaskStatus.COMPLETED if status == "completed" else TaskStatus.FAILED
    error = result if status != "completed" else None
    result_val = result if status == "completed" else None

    await db.execute(
        "UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?",
        (new_status, result_val, error, now, task_id),
    )
    await db.commit()
    return {"task_id": task_id, "status": str(new_status), "completed_at": now}


async def vex_get_project_context(project_id: str) -> dict:
    """Get project details by ID."""
    db = await get_db()
    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = await cursor.fetchone()
    if row is None:
        return {"error": "Project not found", "project_id": project_id}

    return {
        "id": row["id"],
        "name": row["name"],
        "path": row["path"],
        "framework": row["framework"],
        "dev_command": row["dev_command"],
        "dev_port": row["dev_port"],
        "package_manager": row["package_manager"],
        "styling_approach": row["styling_approach"],
        "status": row["status"],
        "dev_server_url": row["dev_server_url"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def vex_register_agent(name: str, capabilities: list[str]) -> dict:
    """Register a new agent."""
    from agent_orchestrator.utils.ids import generate_agent_id

    db = await get_db()
    agent_id = generate_agent_id()
    now = datetime.now(UTC).isoformat()
    capabilities_json = json.dumps(capabilities)

    await db.execute(
        """INSERT INTO agents (id, name, type, tier, capabilities, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (agent_id, name, "external", 3, capabilities_json, now),
    )
    await db.commit()
    return {"agent_id": agent_id, "name": name, "capabilities": capabilities}


async def vex_heartbeat(agent_id: str) -> dict:
    """Send a heartbeat for an agent."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        return {"error": "Agent not found", "agent_id": agent_id}

    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE agents SET last_heartbeat = ?, status = 'running' WHERE id = ?",
        (now, agent_id),
    )
    await db.commit()
    return {"agent_id": agent_id, "status": "ok", "timestamp": now}


# MCP tool definitions for registration with an MCP server framework.
TOOL_DEFINITIONS = [
    {
        "name": "vex_get_pending_batch",
        "description": "Get the latest pending batch of UI actions for a project.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
            },
            "required": ["project_id"],
        },
        "handler": vex_get_pending_batch,
    },
    {
        "name": "vex_get_task",
        "description": "Get a task by its ID, including status and result.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task ID"},
            },
            "required": ["task_id"],
        },
        "handler": vex_get_task,
    },
    {
        "name": "vex_submit_result",
        "description": "Submit the result of a completed or failed task.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task ID"},
                "status": {
                    "type": "string",
                    "enum": ["completed", "failed"],
                    "description": "Whether the task completed or failed",
                },
                "result": {
                    "type": "string",
                    "description": "The result output or error message",
                },
            },
            "required": ["task_id", "status"],
        },
        "handler": vex_submit_result,
    },
    {
        "name": "vex_get_project_context",
        "description": "Get project configuration and context.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
            },
            "required": ["project_id"],
        },
        "handler": vex_get_project_context,
    },
    {
        "name": "vex_register_agent",
        "description": "Register a new agent with the orchestrator.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Agent display name"},
                "capabilities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of capabilities the agent supports",
                },
            },
            "required": ["name", "capabilities"],
        },
        "handler": vex_register_agent,
    },
    {
        "name": "vex_heartbeat",
        "description": "Send a heartbeat to keep an agent's status as running.",
        "parameters": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "The agent ID"},
            },
            "required": ["agent_id"],
        },
        "handler": vex_heartbeat,
    },
]
