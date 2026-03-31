"""Batch processor — spawns parallel agents per batch action."""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

from agent_orchestrator.db.database import get_db
from agent_orchestrator.services.agent_manager import AgentManagerService
from agent_orchestrator.adapters.claude_code_sdk import get_agent_profile

logger = logging.getLogger(__name__)

_agent_manager: AgentManagerService | None = None


def init(agent_manager: AgentManagerService) -> None:
    """Initialize batch processor with agent manager reference."""
    global _agent_manager
    _agent_manager = agent_manager


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
    logger.info("Batch %s: processing %d actions", batch_id, len(actions))

    # Spawn one agent per action in parallel
    tasks = []
    for idx, action in enumerate(actions):
        tasks.append(
            _process_action(project, batch_id, action, idx)
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Determine batch outcome
    any_failed = any(isinstance(r, Exception) or r is False for r in results)
    now = datetime.now(UTC).isoformat()

    db = await get_db()
    batch_status = "failed" if any_failed else "completed"
    await db.execute(
        "UPDATE batches SET status = ?, completed_at = ? WHERE id = ?",
        (batch_status, now, batch_id),
    )

    # Log activity event: batch completed/failed
    event_id = uuid.uuid4().hex
    succeeded = sum(1 for r in results if r is True)
    failed_count = len(results) - succeeded
    summary = f"Batch {batch_id[:8]} {batch_status}: {succeeded}/{len(results)} actions succeeded"
    if failed_count > 0:
        summary += f", {failed_count} failed"
    await db.execute(
        """INSERT INTO activity_events (id, type, project_id, project_name, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (event_id, f"batch_{batch_status}", project_id, project["name"], summary, now),
    )
    await db.commit()
    logger.info("Batch %s: %s", batch_id, batch_status)


async def _process_action(
    project,
    batch_id: str,
    action,
    action_idx: int,
) -> bool:
    """Process a single action: create agent, send task, persist trace, cleanup."""
    db = await get_db()
    now = datetime.now(UTC).isoformat()
    agent_id = uuid.uuid4().hex
    agent_name = f"agent-{batch_id[:8]}-{action_idx}"
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

        if session:
            # Extract cost from last step if available
            for step in reversed(session.steps):
                if step.get("type") == "completed":
                    cost_usd = step.get("cost_usd")
                    duration_ms = step.get("duration_ms")
                    break

        # Persist trace
        completed_at = datetime.now(UTC).isoformat()
        await _persist_trace(db, batch_id, agent_id, agent_name, session, cost_usd, duration_ms, completed_at)

        # Update task as completed
        await db.execute(
            "UPDATE tasks SET status = 'completed', result = 'Action processed successfully', completed_at = ? WHERE id = ?",
            (completed_at, task_id),
        )

        # Update agent stats
        await db.execute(
            "UPDATE agents SET tasks_completed = tasks_completed + 1, total_cost_usd = total_cost_usd + ? WHERE id = ?",
            (cost_usd or 0, agent_id),
        )
        await db.commit()

        # Log per-agent activity event: task completed
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

    except Exception as e:
        logger.exception("Action %d in batch %s failed: %s", action_idx, batch_id, e)

        # Mark task as failed
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

        # Log per-agent activity event: task failed
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
    for step in steps:
        total_tokens += step.get("token_count", 0)

    await db.execute(
        """INSERT INTO agent_traces (id, batch_id, agent_id, agent_name, agent_model, status,
           total_duration_ms, total_cost_usd, total_tokens, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            trace_id, batch_id, agent_id, agent_name, get_agent_profile().get("model", "claude-opus-4-6"),
            "completed", duration_ms, cost_usd, total_tokens, now, completed_at,
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
                step.get("content", "")[:2000], metadata,
                step.get("duration_ms"), step.get("token_count"), step.get("timestamp", now),
            ),
        )

    await db.commit()


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
            ref = action_data.get("reference_selector", "")
            content = action_data.get("content", {})
            parts.append(f"**Position**: {pos}" + (f" relative to `{ref}`" if ref else ""))
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
