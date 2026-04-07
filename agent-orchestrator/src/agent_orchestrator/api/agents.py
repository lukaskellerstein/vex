"""Agent endpoints (T026)."""

import json
from datetime import UTC, datetime

from agent_orchestrator.utils.ids import generate_agent_id

from fastapi import APIRouter, HTTPException, Query, Response, status

from agent_orchestrator.db.database import get_db
from agent_orchestrator.models.agent import Agent, AgentCreate, ContinueRequest, HeartbeatRequest
from agent_orchestrator.services import batch_processor, nats_service

import asyncio

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


@router.get("/projects/{project_id}/agents")
async def list_project_agents(project_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM agents WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    )
    rows = await cursor.fetchall()
    agents_list = [_row_to_agent(r) for r in rows]

    running = sum(1 for a in agents_list if a.get("status") == "running")
    completed = sum(1 for a in agents_list if a.get("status") in ("completed", "stopped"))
    failed = sum(1 for a in agents_list if a.get("status") == "failed")

    return {
        "agents": agents_list,
        "summary": {
            "total": len(agents_list),
            "running": running,
            "completed": completed,
            "failed": failed,
        },
    }


@router.get("/agents")
async def list_agents():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_agent(r) for r in rows]


@router.post("/agents", status_code=status.HTTP_201_CREATED)
async def register_agent(body: AgentCreate):
    db = await get_db()
    agent_id = generate_agent_id()
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
    agent_data = _row_to_agent(row)

    await nats_service.publish("vex.project.events", {
        "event": "agent_registered",
        "project_id": agent_data.get("project_id"),
        "agent": agent_data,
        "timestamp": now,
    })

    return agent_data


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _row_to_agent(row)


@router.post("/agents/{agent_id}/continue")
async def continue_agent(agent_id: str, body: ContinueRequest):
    db = await get_db()
    cursor = await db.execute("SELECT id, status FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    if row["status"] == "running":
        raise HTTPException(status_code=409, detail=f"Agent {agent_id} is currently running")

    terminal = ("completed", "failed", "stopped")
    if row["status"] not in terminal:
        raise HTTPException(
            status_code=409,
            detail=f"Agent {agent_id} is in '{row['status']}' state, cannot continue",
        )

    asyncio.create_task(batch_processor.continue_agent(agent_id, body.message))
    return {"status": "resuming", "agent_id": agent_id}


@router.get("/agents/{agent_id}/trace")
async def get_agent_trace(agent_id: str):
    db = await get_db()

    # Fetch ALL traces for this agent, ordered chronologically
    cursor = await db.execute(
        "SELECT * FROM agent_traces WHERE agent_id = ? ORDER BY created_at ASC",
        (agent_id,),
    )
    trace_rows = await cursor.fetchall()
    if not trace_rows:
        raise HTTPException(status_code=404, detail="Trace not found for this agent")

    # Fetch all tasks for this agent to map prompts by created_at order
    task_cursor = await db.execute(
        "SELECT prompt, created_at FROM tasks WHERE agent_id = ? ORDER BY created_at ASC",
        (agent_id,),
    )
    task_rows = await task_cursor.fetchall()

    traces = []
    for idx, row in enumerate(trace_rows):
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

        # Match prompt from task by index (tasks and traces created in same order)
        prompt = task_rows[idx]["prompt"] if idx < len(task_rows) else None

        traces.append({
            "id": row["id"],
            "batch_id": row["batch_id"],
            "agent_id": row["agent_id"],
            "agent_name": row["agent_name"],
            "agent_model": row["agent_model"],
            "prompt": prompt,
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

    return {
        "agent_id": agent_id,
        "traces": traces,
    }


@router.get("/agents/{agent_id}/steps")
async def get_agent_steps(agent_id: str):
    # Fetch prompt from the most recent task for this agent
    db = await get_db()
    task_cursor = await db.execute(
        "SELECT prompt FROM tasks WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1",
        (agent_id,),
    )
    task_row = await task_cursor.fetchone()
    prompt = task_row["prompt"] if task_row else None

    # Try live steps from batch processor first
    live_steps = batch_processor.get_steps(agent_id)
    if live_steps:
        serialized = []
        excluded = {"tool_input"}
        for i, s in enumerate(live_steps):
            step_dict = {"index": i}
            for k, v in s.items():
                if k not in excluded:
                    step_dict[k] = v
            serialized.append(step_dict)
        return {
            "agent_id": agent_id,
            "status": "running",
            "prompt": prompt,
            "steps": serialized,
        }

    # Fall back to persisted trace_steps from DB
    cursor = await db.execute(
        "SELECT at.status FROM agent_traces at WHERE at.agent_id = ? ORDER BY at.created_at DESC LIMIT 1",
        (agent_id,),
    )
    trace_row = await cursor.fetchone()

    step_cursor = await db.execute(
        """SELECT ts.* FROM trace_steps ts
           JOIN agent_traces at ON ts.trace_id = at.id
           WHERE at.agent_id = ?
           ORDER BY ts.sequence_index""",
        (agent_id,),
    )
    step_rows = await step_cursor.fetchall()

    persisted_steps = []
    for s in step_rows:
        step_dict = {
            "index": s["sequence_index"],
            "type": s["type"],
            "content": s["content"] or "",
            "timestamp": s["created_at"],
            "status": "past",
        }
        if s["metadata"]:
            try:
                meta = json.loads(s["metadata"])
                step_dict.update(meta)
            except (ValueError, TypeError):
                pass
        persisted_steps.append(step_dict)

    return {
        "agent_id": agent_id,
        "status": trace_row["status"] if trace_row else "unknown",
        "prompt": prompt,
        "steps": persisted_steps,
    }


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

    # Try live logs from batch processor
    live_logs = batch_processor.get_logs(agent_id)
    if live_logs:
        return live_logs[offset:offset + limit]

    return []


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deregister_agent(agent_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM agents WHERE id = ?", (agent_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    await db.commit()

    await nats_service.publish("vex.project.events", {
        "event": "agent_deregistered",
        "agent_id": agent_id,
        "timestamp": datetime.now(UTC).isoformat(),
    })

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
    cursor = await db.execute("SELECT id, status FROM agents WHERE id = ?", (agent_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    terminal = ("completed", "failed", "stopped", "error")
    if row["status"] in terminal:
        raise HTTPException(
            status_code=409,
            detail=f"Agent is already {row['status']}",
        )

    # Try to interrupt the agent's active SDK session
    aborted = await batch_processor.abort_agent(agent_id)

    # If no active session to abort, go straight to 'stopped'
    # (orphaned record from AO restart or already finishing)
    final_status = "stopping" if aborted else "stopped"
    await db.execute(
        "UPDATE agents SET status = ? WHERE id = ?", (final_status, agent_id)
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    result_row = await cursor.fetchone()
    result = _row_to_agent(result_row)
    result["aborted"] = aborted
    return result
