"""Batch processor — spawns parallel agents per batch action."""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

from agent_orchestrator.db.database import get_db
from agent_orchestrator.services.agent_manager import AgentManagerService
from agent_orchestrator.services import nats_service
from agent_orchestrator.adapters.claude_code_sdk import get_agent_profile, _VEX_SESSION_NS
from agent_orchestrator.utils.ids import generate_agent_id

logger = logging.getLogger(__name__)

_agent_manager: AgentManagerService | None = None
_running_batches: dict[str, dict] = {}  # batch_id → {"task": asyncio.Task, "agent_ids": list[str]}


def init(agent_manager: AgentManagerService) -> None:
    """Initialize batch processor with agent manager reference."""
    global _agent_manager
    _agent_manager = agent_manager


def register_batch_task(batch_id: str, task: asyncio.Task) -> None:
    """Store a reference to the batch processing task for cancellation."""
    entry = _running_batches.setdefault(batch_id, {})
    entry["task"] = task
    entry.setdefault("agent_ids", [])


async def stop_batch(batch_id: str) -> bool:
    """Stop a running batch by interrupting its agents and cancelling the task.

    Returns True if the batch was found and stopped.
    """
    entry = _running_batches.get(batch_id)
    if entry is None:
        return False

    # Phase 1: Interrupt all active SDK sessions for this batch's agents
    if _agent_manager:
        adapter = _agent_manager._adapters.get("claude-code-sdk")
        if adapter:
            for agent_id in entry.get("agent_ids", []):
                try:
                    await adapter.abort(agent_id)
                except Exception:
                    logger.exception("Error aborting agent %s in batch %s", agent_id, batch_id)

    # Phase 2: Cancel the asyncio task as backstop
    task = entry.get("task")
    if task and not task.done():
        task.cancel()

    # Update DB status
    db = await get_db()
    await db.execute(
        "UPDATE batches SET status = 'cancelled', completed_at = ? WHERE id = ? AND status IN ('pending', 'processing')",
        (datetime.now(UTC).isoformat(), batch_id),
    )
    await db.commit()

    # Publish batch status event
    now_ts = datetime.now(UTC).isoformat()
    await nats_service.publish(
        f"vex.batch.{batch_id}.status",
        {"batch_id": batch_id, "status": "cancelled", "timestamp": now_ts},
    )
    await nats_service.publish("vex.batch.events", {
        "event": "cancelled",
        "batch_id": batch_id,
        "timestamp": now_ts,
    })

    logger.info("Batch %s: stop requested", batch_id)
    return True


async def abort_agent(agent_id: str) -> bool:
    """Abort a single running agent by interrupting its SDK session.

    Returns True if the agent was found and interrupted.
    """
    if _agent_manager is None:
        return False
    adapter = _agent_manager._adapters.get("claude-code-sdk")
    if adapter is None:
        return False
    session = adapter._sessions.get(agent_id)
    if session is None or session.status != "running":
        return False
    try:
        await adapter.abort(agent_id)
        return True
    except Exception:
        logger.exception("Error aborting agent %s", agent_id)
        return False


async def continue_agent(agent_id: str, message: str) -> None:
    """Continue a conversation with a finished agent by sending a follow-up message."""
    if _agent_manager is None:
        logger.error("Batch processor not initialized")
        return

    db = await get_db()

    # Look up agent and its project
    agent_row = await db.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    agent = await agent_row.fetchone()
    if not agent:
        raise ValueError(f"Agent {agent_id} not found")

    project_id = agent["project_id"]
    project_row = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    project = await project_row.fetchone()
    if not project:
        raise ValueError(f"Project {project_id} not found for agent {agent_id}")

    session_id = str(uuid.uuid5(_VEX_SESSION_NS, agent_id))

    # Create a continuation task
    task_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    await db.execute(
        """INSERT INTO tasks (id, project_id, agent_id, type, status, prompt, created_at, assigned_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (task_id, project_id, agent_id, "continue", "in_progress", message, now, now),
    )
    await db.commit()

    try:
        # Start the agent (transitions status to running)
        await _agent_manager.start_agent(
            agent_id=agent_id,
            project_id=project_id,
            project_path=project["path"],
            adapter_type="claude-code-sdk",
        )

        # Resume conversation via adapter
        adapter = _agent_manager._adapters.get("claude-code-sdk")
        if not adapter:
            raise RuntimeError("claude-code-sdk adapter not available")

        await adapter.resume(
            agent_id=agent_id,
            project_id=project_id,
            project_path=project["path"],
            message=message,
            session_id=session_id,
        )

        # Extract cost/duration from session steps
        session = adapter._sessions.get(agent_id)
        cost_usd = None
        duration_ms = None
        completed_at = datetime.now(UTC).isoformat()
        was_cancelled = session and session.status == "cancelled"

        if session:
            for step in reversed(session.steps):
                if step.get("type") == "completed":
                    cost_usd = step.get("cost_usd")
                    duration_ms = step.get("duration_ms")
                    break

            # Persist trace (batch_id=None for continuations)
            await _persist_trace(
                db, None, agent_id, agent["name"],
                session, cost_usd, duration_ms, completed_at,
            )

        if was_cancelled:
            await db.execute(
                "UPDATE tasks SET status = 'cancelled', result = 'Cancelled by user', completed_at = ? WHERE id = ?",
                (completed_at, task_id),
            )
            await db.execute(
                "UPDATE agents SET status = 'stopped' WHERE id = ?",
                (agent_id,),
            )
            await db.commit()
            logger.info("Agent %s continuation cancelled", agent_id)
        else:
            await db.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?",
                (completed_at, task_id),
            )
            await db.execute(
                "UPDATE agents SET tasks_completed = tasks_completed + 1 WHERE id = ?",
                (agent_id,),
            )
            await db.commit()
            logger.info("Agent %s continuation completed", agent_id)

    except Exception:
        logger.exception("Agent %s continuation failed", agent_id)
        completed_at = datetime.now(UTC).isoformat()
        await db.execute(
            "UPDATE tasks SET status = 'failed', completed_at = ? WHERE id = ?",
            (completed_at, task_id),
        )
        await db.execute(
            "UPDATE agents SET tasks_failed = tasks_failed + 1, status = 'failed' WHERE id = ?",
            (agent_id,),
        )
        await db.commit()

        await _persist_error_trace(
            db, None, agent_id, agent["name"],
            "failed", str(Exception), completed_at,
        )

    finally:
        try:
            await _agent_manager.stop_agent(agent_id)
        except Exception:
            logger.exception("Error stopping agent %s after continuation", agent_id)


async def process_batch(project_id: str, batch_id: str) -> None:
    """Process a batch by spawning one agent per action in parallel."""
    if _agent_manager is None:
        logger.error("Batch processor not initialized")
        return

    db = await get_db()

    # Load batch actions
    cursor = await db.execute(
        "SELECT * FROM actions WHERE batch_id = ? ORDER BY sequence_index",
        (batch_id,),
    )
    actions = await cursor.fetchall()

    if not actions:
        await db.execute(
            "UPDATE batches SET status = 'completed', completed_at = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), batch_id),
        )
        await db.commit()
        logger.info("Batch %s has zero actions, marked completed", batch_id)
        return

    # Load project info
    cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    project = await cursor.fetchone()
    if project is None:
        logger.error("Project %s not found for batch %s", project_id, batch_id)
        return

    # Update batch status to processing
    await db.execute("UPDATE batches SET status = 'processing' WHERE id = ?", (batch_id,))

    # Log activity event: batch processing started
    event_id = uuid.uuid4().hex
    await db.execute(
        """INSERT INTO activity_events (id, type, project_id, project_name, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (event_id, "batch_processing", project_id, project["name"],
         f"Batch {batch_id[:8]} started processing {len(actions)} action(s)",
         datetime.now(UTC).isoformat()),
    )
    await db.commit()

    await nats_service.publish("vex.activity.events", {
        "event": "batch_processing",
        "project_id": project_id,
        "batch_id": batch_id,
        "timestamp": datetime.now(UTC).isoformat(),
    })
    await nats_service.publish("vex.batch.events", {
        "event": "processing",
        "project_id": project_id,
        "batch_id": batch_id,
        "timestamp": datetime.now(UTC).isoformat(),
    })

    logger.info("Batch %s: processing %d actions", batch_id, len(actions))

    # Pre-generate agent IDs so we can publish cursor mapping before execution
    agent_ids = [generate_agent_id() for _ in actions]

    # Load batch page_url for cursor overlay
    batch_cursor = await db.execute("SELECT page_url FROM batches WHERE id = ?", (batch_id,))
    batch_row = await batch_cursor.fetchone()
    page_url = batch_row["page_url"] if batch_row else ""

    # Publish cursor init via NATS so Chrome extension can show cursors
    cursor_agents = []
    for idx, action in enumerate(actions):
        cursor_agents.append({
            "agentId": agent_ids[idx],
            "agentName": f"agent-{agent_ids[idx]}",
            "selector": action["selector"],
            "colorIndex": idx,
        })
    cursor_payload = {
        "type": "cursor_init",
        "batchId": batch_id,
        "pageUrl": page_url,
        "agents": cursor_agents,
    }
    cursor_subject = f"vex.batch.{batch_id}.cursors"
    logger.info("Publishing cursor init on %s: %d agents, pageUrl=%s", cursor_subject, len(cursor_agents), page_url)
    await nats_service.publish(cursor_subject, cursor_payload)

    # Track agent IDs for cancellation support
    entry = _running_batches.setdefault(batch_id, {})
    entry["agent_ids"] = list(agent_ids)

    # Spawn one agent per action in parallel
    tasks = []
    for idx, action in enumerate(actions):
        tasks.append(
            _process_action(project, batch_id, action, idx, agent_ids[idx])
        )

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Determine batch outcome
        any_cancelled = any(isinstance(r, asyncio.CancelledError) for r in results)
        any_failed = any(
            (isinstance(r, Exception) and not isinstance(r, asyncio.CancelledError))
            or r is False
            for r in results
        )

        if any_cancelled:
            batch_status = "cancelled"
        elif any_failed:
            batch_status = "failed"
        else:
            batch_status = "completed"

        now = datetime.now(UTC).isoformat()
        db = await get_db()

        # Compute batch duration from submitted_at → now
        batch_cursor = await db.execute(
            "SELECT submitted_at FROM batches WHERE id = ?", (batch_id,),
        )
        batch_row = await batch_cursor.fetchone()
        batch_duration_ms = None
        if batch_row and batch_row["submitted_at"]:
            submitted = datetime.fromisoformat(batch_row["submitted_at"])
            completed = datetime.fromisoformat(now)
            batch_duration_ms = int((completed - submitted).total_seconds() * 1000)

        # Sum cost from agent traces for this batch
        cost_cursor = await db.execute(
            "SELECT COALESCE(SUM(total_cost_usd), 0) AS total_cost FROM agent_traces WHERE batch_id = ?",
            (batch_id,),
        )
        cost_row = await cost_cursor.fetchone()
        batch_cost_usd = cost_row["total_cost"] if cost_row and cost_row["total_cost"] else None

        await db.execute(
            "UPDATE batches SET status = ?, completed_at = ?, duration_ms = ?, cost_usd = ? WHERE id = ? AND status NOT IN ('cancelled')",
            (batch_status, now, batch_duration_ms, batch_cost_usd, batch_id),
        )

        # Log activity event: batch outcome
        event_id = uuid.uuid4().hex
        succeeded = sum(1 for r in results if r is True)
        failed_count = len(results) - succeeded
        summary = f"Batch {batch_id[:8]} {batch_status}: {succeeded}/{len(results)} actions succeeded"
        if failed_count > 0:
            summary += f", {failed_count} failed/cancelled"
        await db.execute(
            """INSERT INTO activity_events (id, type, project_id, project_name, summary, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (event_id, f"batch_{batch_status}", project_id, project["name"], summary, now),
        )
        await db.commit()

        # Publish batch status event for real-time UI updates
        await nats_service.publish(
            f"vex.batch.{batch_id}.status",
            {"batch_id": batch_id, "status": batch_status, "timestamp": now},
        )
        await nats_service.publish("vex.batch.events", {
            "event": batch_status,
            "project_id": project_id,
            "batch_id": batch_id,
            "timestamp": now,
        })
        await nats_service.publish("vex.activity.events", {
            "event": f"batch_{batch_status}",
            "project_id": project_id,
            "batch_id": batch_id,
            "timestamp": now,
        })
        logger.info("Batch %s: %s", batch_id, batch_status)

    except asyncio.CancelledError:
        # Batch task itself was cancelled (backstop from stop_batch)
        now = datetime.now(UTC).isoformat()
        db = await get_db()
        await db.execute(
            "UPDATE batches SET status = 'cancelled', completed_at = ? WHERE id = ? AND status NOT IN ('cancelled')",
            (now, batch_id),
        )
        await db.commit()
        await nats_service.publish(
            f"vex.batch.{batch_id}.status",
            {"batch_id": batch_id, "status": "cancelled", "timestamp": now},
        )
        await nats_service.publish("vex.batch.events", {
            "event": "cancelled",
            "project_id": project_id,
            "batch_id": batch_id,
            "timestamp": now,
        })
        logger.info("Batch %s: cancelled via task cancellation", batch_id)

    finally:
        _running_batches.pop(batch_id, None)


async def _process_action(
    project,
    batch_id: str,
    action,
    action_idx: int,
    agent_id: str | None = None,
) -> bool:
    """Process a single action: create agent, send task, persist trace, cleanup."""
    db = await get_db()
    now = datetime.now(UTC).isoformat()
    if agent_id is None:
        agent_id = generate_agent_id()
    agent_name = f"agent-{agent_id}"
    task_id = uuid.uuid4().hex

    try:
        # Create agent row in DB
        capabilities_json = json.dumps(["code-edit", "file-system"])
        await db.execute(
            """INSERT INTO agents (id, name, type, tier, capabilities, status, project_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (agent_id, agent_name, "claude-code-sdk", 1, capabilities_json, "created", project["id"], now),
        )

        # Create task row linked to batch
        action_data = json.loads(action["data"]) if isinstance(action["data"], str) else action["data"]
        screenshot_before = action["screenshot_before_path"]
        screenshot_after = action["screenshot_after_path"]
        prompt = _build_prompt(project, action, action_data, screenshot_before, screenshot_after)

        await db.execute(
            """INSERT INTO tasks (id, project_id, agent_id, batch_id, type, status, prompt, created_at, assigned_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (task_id, project["id"], agent_id, batch_id, "code-edit", "in_progress", prompt, now, now),
        )
        await db.commit()

        # Start agent via AgentManagerService
        await _agent_manager.start_agent(
            agent_id=agent_id,
            project_id=project["id"],
            project_path=project["path"],
            adapter_type="claude-code-sdk",
        )

        # Get adapter and send task
        adapter = _agent_manager._adapters.get("claude-code-sdk")
        if adapter is None:
            raise RuntimeError("claude-code-sdk adapter not registered")

        task_dict = {
            "task_id": task_id,
            "prompt": prompt,
            "context": {
                "project_path": project["path"],
                "framework": project["framework"],
                "styling_approach": project["styling_approach"],
                "actions": [_action_to_dict(action, action_data, screenshot_before, screenshot_after)],
            },
        }

        await adapter.send_task(agent_id, task_dict)

        # Get session for step/cost data
        session = adapter._sessions.get(agent_id)
        cost_usd = None
        duration_ms = None
        was_cancelled = session and session.status == "cancelled"

        if session:
            for step in reversed(session.steps):
                if step.get("type") == "completed":
                    cost_usd = step.get("cost_usd")
                    duration_ms = step.get("duration_ms")
                    break

        # Persist trace
        completed_at = datetime.now(UTC).isoformat()
        await _persist_trace(db, batch_id, agent_id, agent_name, session, cost_usd, duration_ms, completed_at)

        if was_cancelled:
            await db.execute(
                "UPDATE tasks SET status = 'cancelled', result = 'Cancelled by user', completed_at = ? WHERE id = ?",
                (completed_at, task_id),
            )
            await db.execute(
                "UPDATE agents SET status = 'stopped' WHERE id = ?",
                (agent_id,),
            )
            await db.commit()
            logger.info("Action %d in batch %s cancelled for agent %s", action_idx, batch_id, agent_id)
            return False
        else:
            await db.execute(
                "UPDATE tasks SET status = 'completed', result = 'Action processed successfully', completed_at = ? WHERE id = ?",
                (completed_at, task_id),
            )
            await db.execute(
                "UPDATE agents SET tasks_completed = tasks_completed + 1, total_cost_usd = total_cost_usd + ? WHERE id = ?",
                (cost_usd or 0, agent_id),
            )
            await db.commit()

            await db.execute(
                """INSERT INTO activity_events (id, type, project_id, project_name, agent_id, agent_name, summary, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (uuid.uuid4().hex, "task_completed", project["id"], project["name"], agent_id, agent_name,
                 f"Agent {agent_name} completed action: {action['type']} on {action['selector']}",
                 datetime.now(UTC).isoformat()),
            )
            await db.commit()

            logger.info("Action %d in batch %s completed by agent %s", action_idx, batch_id, agent_id)
            return True

    except asyncio.CancelledError:
        # Task was cancelled via asyncio (backstop from stop_batch)
        logger.info("Action %d in batch %s cancelled (asyncio) for agent %s", action_idx, batch_id, agent_id)
        db = await get_db()
        completed_at = datetime.now(UTC).isoformat()
        await db.execute(
            "UPDATE tasks SET status = 'cancelled', result = 'Cancelled by user', completed_at = ? WHERE id = ?",
            (completed_at, task_id),
        )
        await db.execute(
            "UPDATE agents SET status = 'stopped' WHERE id = ?",
            (agent_id,),
        )
        try:
            await _persist_error_trace(db, batch_id, agent_id, agent_name, "cancelled", "Cancelled by user", completed_at)
        except Exception:
            logger.exception("Failed to persist cancel trace for agent %s", agent_id)
        await db.commit()
        raise  # Re-raise so gather captures it

    except Exception as e:
        logger.exception("Action %d in batch %s failed: %s", action_idx, batch_id, e)

        db = await get_db()
        error_msg = str(e)
        completed_at = datetime.now(UTC).isoformat()

        await db.execute(
            "UPDATE tasks SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
            (error_msg, completed_at, task_id),
        )
        await db.execute(
            "UPDATE agents SET status = 'failed', tasks_failed = tasks_failed + 1 WHERE id = ?",
            (agent_id,),
        )
        try:
            await _persist_error_trace(db, batch_id, agent_id, agent_name, "failed", error_msg, completed_at)
        except Exception:
            logger.exception("Failed to persist error trace for agent %s", agent_id)

        await db.execute(
            """INSERT INTO activity_events (id, type, project_id, project_name, agent_id, agent_name, summary, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (uuid.uuid4().hex, "task_failed", project["id"], project["name"], agent_id, agent_name,
             f"Agent {agent_name} failed action: {action['type']} on {action['selector']}: {error_msg[:200]}",
             datetime.now(UTC).isoformat()),
        )
        await db.commit()
        return False

    finally:
        # Cleanup: stop agent
        try:
            await _agent_manager.stop_agent(agent_id)
        except Exception:
            logger.exception("Error stopping agent %s", agent_id)


async def _persist_trace(
    db,
    batch_id: str,
    agent_id: str,
    agent_name: str,
    session,
    cost_usd: float | None,
    duration_ms: int | None,
    completed_at: str,
) -> None:
    """Persist agent execution trace and steps to DB."""
    trace_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    steps = session.steps if session else []

    total_tokens = 0
    input_tokens = 0
    output_tokens = 0
    for step in steps:
        total_tokens += step.get("token_count", 0)
        # Extract input/output tokens from the completed step
        if step.get("type") == "completed":
            input_tokens = step.get("input_tokens", 0) or 0
            output_tokens = step.get("output_tokens", 0) or 0

    await db.execute(
        """INSERT INTO agent_traces (id, batch_id, agent_id, agent_name, agent_model, status,
           total_duration_ms, total_cost_usd, total_tokens, input_tokens, output_tokens,
           created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            trace_id, batch_id, agent_id, agent_name, get_agent_profile().get("model", "claude-opus-4-6"),
            "completed", duration_ms, cost_usd, total_tokens, input_tokens, output_tokens,
            now, completed_at,
        ),
    )

    for idx, step in enumerate(steps):
        step_id = uuid.uuid4().hex
        # Build metadata: include tool_name for tool_call steps, exclude internal fields
        excluded_keys = {"type", "content", "timestamp", "status", "tool_input"}
        meta_dict = {k: v for k, v in step.items() if k not in excluded_keys}
        metadata = json.dumps(meta_dict) if meta_dict else None
        await db.execute(
            """INSERT INTO trace_steps (id, trace_id, sequence_index, type, content, metadata,
               duration_ms, token_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                step_id, trace_id, idx, step.get("type", "unknown"),
                step.get("content", "")[:10000], metadata,
                step.get("duration_ms"), step.get("token_count"), step.get("timestamp", now),
            ),
        )

    await db.commit()


async def _persist_error_trace(
    db,
    batch_id: str,
    agent_id: str,
    agent_name: str,
    status: str,
    error_message: str,
    completed_at: str,
) -> None:
    """Persist a minimal trace for agents that failed/cancelled before normal trace persistence."""
    trace_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()

    await db.execute(
        """INSERT INTO agent_traces (id, batch_id, agent_id, agent_name, agent_model, status,
           total_duration_ms, total_cost_usd, total_tokens, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            trace_id, batch_id, agent_id, agent_name,
            get_agent_profile().get("model", "claude-opus-4-6"),
            status, None, None, 0, now, completed_at,
        ),
    )

    step_id = uuid.uuid4().hex
    await db.execute(
        """INSERT INTO trace_steps (id, trace_id, sequence_index, type, content, metadata,
           duration_ms, token_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (step_id, trace_id, 0, "error", error_message[:10000], None, None, None, now),
    )


def get_steps(agent_id: str) -> list[dict]:
    """Get structured steps for a live agent from the adapter session."""
    if _agent_manager is None:
        return []
    adapter = _agent_manager._adapters.get("claude-code-sdk")
    if adapter is None:
        return []
    session = adapter._sessions.get(agent_id)
    if session is None:
        return []
    return list(session.steps)


def get_logs(agent_id: str) -> list[str]:
    """Get log buffer for a live agent from the adapter session."""
    if _agent_manager is None:
        return []
    adapter = _agent_manager._adapters.get("claude-code-sdk")
    if adapter is None:
        return []
    session = adapter._sessions.get(agent_id)
    if session is None:
        return []
    return list(session.log_buffer)


def _build_prompt(
    project, action, action_data: dict,
    screenshot_before: str | None = None,
    screenshot_after: str | None = None,
) -> str:
    """Build prompt for a single action.

    Two modes:
    - **Prompt-driven** (insert/replaceImage/generateSection with a generation prompt):
      The user's creative prompt is the primary task. The selector/position is context
      for WHERE to apply the result in the code.
    - **Delta-driven** (styleChange, resize, editText, move, delete, etc.):
      The structural DOM change is the primary task. Apply it precisely.
    """
    action_type = action["type"]
    selector = action["selector"]
    instruction = action_data.get("instruction", "")
    generation_prompt = action_data.get("prompt", "")

    # Detect prompt-driven actions
    is_prompt_driven = bool(generation_prompt) and action_type in (
        "insert", "replaceImage", "generateSection",
    )

    parts = [
        f"Project: {project['path']}",
        f"Framework: {project['framework'] or 'unknown'}",
        f"Styling: {project['styling_approach'] or 'unknown'}",
    ]

    url = action_data.get("url")
    if url:
        parts.append(f"URL: {url}")

    parts.append("")

    if is_prompt_driven:
        # ── Prompt-driven: user's creative intent is the task ──
        parts.extend([
            "## Task",
            f"{generation_prompt}",
            "",
            "## Where to apply",
            f"**Action**: [{action_type}] at `{selector}`",
        ])
        if action_type == "insert":
            pos = action_data.get("position", "after")
            visual_pos = action_data.get("visual_position", "")
            ref = action_data.get("reference_selector", "")
            content = action_data.get("content", {})
            parts.append(f"**Position**: {pos}" + (f" relative to `{ref}`" if ref else ""))
            if visual_pos in ("left", "right"):
                parts.append(
                    f"**Visual placement**: {visual_pos} of the reference element. "
                    "The new element must appear side-by-side with the reference. "
                    "If the parent is not already a horizontal layout (flexbox row or CSS grid), "
                    "wrap the reference and new element in a flex row container."
                )
            if content:
                tag = content.get("tag", "div")
                parts.append(f"**Element to create**: `<{tag}>`")
        elif action_type == "replaceImage":
            if action_data.get("original_src"):
                parts.append(f"**Replace image at**: `{action_data['original_src']}`")
            if action_data.get("dimensions"):
                d = action_data["dimensions"]
                parts.append(f"**Dimensions**: {d.get('width', '?')}x{d.get('height', '?')}px")
        elif action_type == "generateSection":
            pos = action_data.get("position", "after")
            ref = action_data.get("reference_selector", "")
            parts.append(f"**Position**: {pos}" + (f" relative to `{ref}`" if ref else ""))
            if action_data.get("style_hint"):
                parts.append(f"**Style hint**: {action_data['style_hint']}")

        if instruction:
            parts.append(f"**Additional instruction**: {instruction}")

    else:
        # ── Delta-driven: structural change is the task ──
        parts.extend([
            "## Task",
            "Apply the following visual edit:",
            "",
            f"**Action**: [{action_type}] `{selector}`",
        ])
        if instruction:
            parts.append(f"**Instruction**: {instruction}")
        _append_action_details(parts, action_type, action_data)

    # --- Element context (select actions carry rich metadata) ---
    _append_element_context(parts, action_data)

    # --- Screenshots ---
    _append_screenshots(parts, action_type, screenshot_before, screenshot_after)

    return "\n".join(parts)


def _append_action_details(parts: list[str], action_type: str, data: dict) -> None:
    """Append action-type-specific details to the prompt."""
    if action_type == "select":
        # Instruction is the main payload, already appended above
        pass

    elif action_type == "editText":
        before_text = data.get("before", "")
        after_text = data.get("after", "")
        parts.append(f"**Text change**: `{before_text}` → `{after_text}`")

    elif action_type == "styleChange":
        if data.get("changes"):
            parts.append("**Style changes**:")
            for change in data["changes"]:
                prop = change.get("property", "")
                parts.append(f"  - `{prop}`: `{change.get('before', '')}` → `{change.get('after', '')}`")
        if data.get("hover_changes"):
            parts.append("**Hover state changes**:")
            for hc in data["hover_changes"]:
                parts.append(f"  - `{hc.get('property', '')}`: `{hc.get('value', '')}` — {hc.get('description', '')}")
        if data.get("transition"):
            t = data["transition"]
            parts.append(f"**Transition**: duration={t.get('duration', 'none')}, easing={t.get('easing', 'none')}")

    elif action_type == "resize":
        if data.get("deltas"):
            parts.append("**Resize deltas**:")
            for delta in data["deltas"]:
                prop = delta.get("property", delta.get("prop", ""))
                before_val = delta.get("before", delta.get("from", ""))
                after_val = delta.get("after", delta.get("to", ""))
                parts.append(f"  - `{prop}`: `{before_val}` → `{after_val}`")

    elif action_type == "insert":
        pos = data.get("position", "after")
        visual_pos = data.get("visual_position", "")
        ref = data.get("reference_selector", "")
        content = data.get("content", {})
        parts.append(f"**Position**: {pos}" + (f" (visually {visual_pos})" if visual_pos else ""))
        if visual_pos in ("left", "right"):
            parts.append(
                "**Layout**: Place the new element side-by-side with the reference. "
                "Use a flex row wrapper if the parent is not already horizontal."
            )
        if ref:
            parts.append(f"**Reference element**: `{ref}`")
        if content:
            parts.append(f"**Content**: tag=`{content.get('tag', 'div')}`, text=`{content.get('text', '')}`")
            if content.get("attributes"):
                parts.append(f"**Attributes**: {json.dumps(content['attributes'])}")
        if data.get("prompt"):
            parts.append(f"**Generation prompt**: {data['prompt']}")

    elif action_type == "delete":
        html = data.get("deleted_outer_html", "")
        if html:
            # Truncate to avoid overwhelming the prompt
            truncated = html[:500] + ("..." if len(html) > 500 else "")
            parts.append(f"**Deleted HTML**:\n```html\n{truncated}\n```")

    elif action_type == "duplicate":
        after_sel = data.get("inserted_after", "")
        if after_sel:
            parts.append(f"**Inserted after**: `{after_sel}`")

    elif action_type == "move":
        parent = data.get("parent_selector", "")
        from_idx = data.get("from_index", "")
        to_idx = data.get("to_index", "")
        if parent:
            parts.append(f"**Parent**: `{parent}`")
        parts.append(f"**Move**: index {from_idx} → {to_idx}")

    elif action_type == "wrap":
        wrapper = data.get("wrapper", {})
        if wrapper:
            tag = wrapper.get("tag", "div")
            classes = " ".join(wrapper.get("class_list", wrapper.get("classList", [])))
            parts.append(f"**Wrapper**: `<{tag}" + (f' class="{classes}"' if classes else "") + ">`")

    elif action_type == "replaceImage":
        if data.get("original_src"):
            parts.append(f"**Original src**: `{data['original_src']}`")
        method = data.get("method", "")
        parts.append(f"**Method**: {method}")
        if data.get("dimensions"):
            d = data["dimensions"]
            parts.append(f"**Dimensions**: {d.get('width', '?')}x{d.get('height', '?')}px")
        if data.get("prompt"):
            parts.append(f"**Generation prompt**: {data['prompt']}")
        if data.get("generated_url"):
            parts.append(f"**Generated URL**: `{data['generated_url']}`")

    elif action_type == "generateSection":
        pos = data.get("position", "after")
        ref = data.get("reference_selector", "")
        parts.append(f"**Position**: {pos}" + (f" relative to `{ref}`" if ref else ""))
        if data.get("prompt"):
            parts.append(f"**Generation prompt**: {data['prompt']}")
        if data.get("style_hint"):
            parts.append(f"**Style hint**: {data['style_hint']}")
        if data.get("generated_html"):
            html = data["generated_html"]
            truncated = html[:800] + ("..." if len(html) > 800 else "")
            parts.append(f"**Generated HTML preview**:\n```html\n{truncated}\n```")

    elif action_type == "copyStyle":
        if data.get("from_selector"):
            parts.append(f"**Copy from**: `{data['from_selector']}`")
        if data.get("to_selector"):
            parts.append(f"**Apply to**: `{data['to_selector']}`")
        if data.get("copied_properties"):
            parts.append("**Copied properties**:")
            for prop, val in data["copied_properties"].items():
                parts.append(f"  - `{prop}`: `{val}`")


def _append_element_context(parts: list[str], data: dict) -> None:
    """Append element context info when available (primarily from select actions)."""
    has_context = any(data.get(k) for k in (
        "tag_name", "react_component", "react_source_file",
        "accessibility_path", "computed_styles", "class_list",
    ))
    if not has_context:
        return

    parts.append("")
    parts.append("## Element Context")

    if data.get("react_component"):
        parts.append(f"**React component**: `{data['react_component']}`")
    if data.get("react_source_file"):
        parts.append(f"**Source file**: `{data['react_source_file']}`")
    if data.get("accessibility_path"):
        parts.append(f"**Accessibility path**: {data['accessibility_path']}")
    if data.get("tag_name"):
        tag_info = f"`<{data['tag_name']}"
        if data.get("class_list"):
            tag_info += f" class=\"{' '.join(data['class_list'])}\""
        tag_info += ">`"
        parts.append(f"**Element**: {tag_info}")
    if data.get("parent_tag"):
        parts.append(f"**Parent**: `<{data['parent_tag']}>`")
    if data.get("text_content"):
        text = data["text_content"][:100]
        parts.append(f"**Text**: `{text}`")
    if data.get("computed_styles"):
        # Include a compact summary of key styles
        styles = data["computed_styles"]
        style_lines = [f"  - `{k}`: `{v}`" for k, v in styles.items() if v and v != "none" and v != "normal" and v != "0px"]
        if style_lines:
            parts.append("**Current styles**:")
            parts.extend(style_lines[:15])  # Cap at 15 to avoid bloat


def _append_screenshots(
    parts: list[str], action_type: str,
    screenshot_before: str | None, screenshot_after: str | None,
) -> None:
    """Append screenshot references with context-appropriate labels."""
    if not screenshot_before and not screenshot_after:
        return

    parts.append("")
    parts.append("## Screenshots")
    parts.append("Use the Read tool to view these images for visual reference:")

    if action_type == "select":
        # Select has a single reference screenshot (current state of the element)
        if screenshot_before:
            parts.append(f"- **Reference** (current state of the element): `{screenshot_before}`")
        if screenshot_after:
            parts.append(f"- **After**: `{screenshot_after}`")
    else:
        if screenshot_before:
            parts.append(f"- **Before**: `{screenshot_before}`")
        if screenshot_after:
            parts.append(f"- **After**: `{screenshot_after}`")


def _action_to_dict(
    action, action_data: dict,
    screenshot_before: str | None = None,
    screenshot_after: str | None = None,
) -> dict:
    """Convert DB action row + parsed data to a dict for the adapter prompt."""
    result = {
        "type": action["type"],
        "selector": action["selector"],
        "instruction": action_data.get("instruction", ""),
    }
    # Propagate type-specific fields
    for key in ("before", "after", "changes", "deltas", "dimensions",
                "before_styles", "after_styles", "position", "content",
                "deleted_outer_html", "wrapper", "data",
                "reference_selector", "visual_position", "inserted_after",
                "parent_selector", "from_index", "to_index",
                "original_src", "method", "prompt", "generated_url",
                "style_hint", "generated_html",
                "from_selector", "to_selector", "copied_properties",
                "hover_changes", "transition",
                "url", "tag_name", "class_list", "text_content",
                "computed_styles", "parent_tag", "child_count",
                "accessibility_path", "react_component", "react_source_file"):
        if action_data.get(key) is not None:
            result[key] = action_data[key]
    # Propagate screenshot paths
    if screenshot_before:
        result["screenshot_before"] = screenshot_before
    if screenshot_after:
        result["screenshot_after"] = screenshot_after
    return result
