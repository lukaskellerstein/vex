# Spec 003: Wire Batch Submission to Agent Execution + Show Output in Electron

## Problem

When the Chrome extension submits a batch of visual edits via `POST /api/projects/{id}/batches`, the AO stores it in SQLite but nothing else happens. The `ClaudeCodeSDKAdapter` and `AgentManagerService` are fully implemented but never instantiated. The Electron app has an Agent Panel but nothing works because no agents are ever created and no logs endpoint exists.

## Design Decisions

- **One ephemeral agent per action** — each action in a batch spawns its own agent, runs in parallel, dies after completion
- **Agents are ephemeral** — after the task completes (or fails), the agent is stopped and cleaned up. No long-lived agents.
- **Async processing** via `asyncio.create_task` — HTTP response returns immediately, agents run in background
- **Electron polls HTTP** — no WebSocket/NATS needed on the Electron side
- **Bypass TaskRouter** — the batch processor directly creates agents and assigns tasks (TaskRouter requires pre-registered running agents, unnecessary complexity)
- **Step tracking** — each agent's `log_buffer` captures text blocks and tool usage as "steps". The Electron app polls these to show past/current steps.

## Changes

### 1. Add `batch_id` column to `tasks` table

**File:** `agent-orchestrator/src/agent_orchestrator/db/database.py`

- Add `batch_id TEXT` + FK to `batches(id)` in the `CREATE TABLE tasks` statement
- Add `ALTER TABLE tasks ADD COLUMN batch_id TEXT` migration guard (try/except) for existing DBs

### 2. Create batch processor service (NEW FILE)

**File:** `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py`

Module-level singleton. Core logic:

```text
process_batch(project_id, batch_id):
  1. Get project info (path, framework, styling_approach)
  2. Load batch actions from DB
  3. Update batch status -> processing
  4. For EACH action, in parallel (asyncio.gather):
     a. Create agent row in DB (name="agent-{batch_id[:8]}-{action_idx}", type="claude-code-sdk")
     b. Start agent via AgentManagerService.start_agent()
     c. Create task row in DB (with batch_id, agent_id, status=in_progress)
     d. Call adapter.send_task(agent_id, task_dict) — task contains SINGLE action
     e. On completion: task -> completed, agent -> stopped (cleanup session)
     f. On failure: task -> failed, agent -> stopped with error
  5. After ALL agents finish (gather):
     - If all succeeded: batch -> completed
     - If any failed: batch -> failed
```

Each action's processing is wrapped in an async function, all run via `asyncio.gather(*action_tasks)`.

Also exposes:
- `get_logs(agent_id) -> list[str]` — reads from `adapter._sessions[agent_id].log_buffer`
- `get_steps(agent_id) -> list[dict]` — structured step data (type, content, timestamp) for the Electron detail view

### 3. Enhance log_buffer to capture structured steps

**File:** `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`

Add a `steps: list[dict]` field to `SDKAgentSession` alongside `log_buffer`. Each step is:

```python
{
    "type": "text" | "tool_use" | "tool_result" | "progress" | "error" | "completed",
    "content": str,
    "timestamp": str,
    "status": "past" | "current" | "pending",
}
```

In `send_task()`, when processing messages:
- `TextBlock` → append step with type="text"
- `ToolUseBlock` → append step with type="tool_use", mark previous step as "past", this as "current"
- `ResultMessage` → append step with type="completed"
- On error → append step with type="error"

The last non-completed step has status="current", all prior have "past".

### 4. Trigger processing after batch insert

**File:** `agent-orchestrator/src/agent_orchestrator/api/batches.py`

After `await db.commit()` (line 83), add:

```python
asyncio.create_task(batch_processor.process_batch(project_id, batch_id))
```

Add endpoint `GET /projects/{project_id}/batches/{batch_id}/task` → returns all tasks for the batch (one per action/agent).

### 5. Add agent logs + steps endpoints

**File:** `agent-orchestrator/src/agent_orchestrator/api/agents.py`

```python
@router.get("/agents/{agent_id}/logs")
async def get_agent_logs(agent_id: str):
    return batch_processor.get_logs(agent_id)


@router.get("/agents/{agent_id}/steps")
async def get_agent_steps(agent_id: str):
    return batch_processor.get_steps(agent_id)
```

### 6. Add endpoint: agents by project

**File:** `agent-orchestrator/src/agent_orchestrator/api/agents.py`

```python
@router.get("/projects/{project_id}/agents")
async def list_project_agents(project_id: str):
    # Returns all agents for this project, ordered by created_at DESC
    # Includes running count in response
```

### 7. Initialize batch processor in app lifespan

**File:** `agent-orchestrator/src/agent_orchestrator/main.py`

Import batch processor singleton. No special init needed.

### 8. Electron: Add IPC handlers

**File:** `electron-app/src/main/index.ts`
- `get-project-batches` → `GET /api/projects/{projectId}/batches`
- `get-project-agents` → `GET /api/projects/{projectId}/agents`
- `get-batch-tasks` → `GET /api/projects/{projectId}/batches/{batchId}/task`
- `get-agent-steps` → `GET /api/agents/{agentId}/steps`

**File:** `electron-app/src/main/preload.ts`
- Expose: `getProjectBatches`, `getProjectAgents`, `getBatchTasks`, `getAgentSteps`

### 9. Electron: Redesign ProjectDetail to show agents

**File:** `electron-app/src/renderer/pages/ProjectDetail.tsx`

Replace the static "Recent Batches" section with an **Agents section**:

**Agents overview (always visible when project selected):**
- Header: "Agents (3 running, 2 completed)" — count from polled data
- List of agents for this project, each showing:
  - Agent name (e.g. "agent-a1b2c3d4-0")
  - Status badge (running/completed/failed)
  - Action type + selector it's working on
  - Clickable row

**Agent detail (when clicked):**
- Expands inline or replaces the list (like a master-detail)
- Shows the action this agent is processing
- **Steps timeline**: vertical list of past/current steps
  - Past steps: dimmed, with checkmark
  - Current step: highlighted, with spinner
  - Each step shows: type icon (text/tool), content preview, timestamp
- Terminal-style full log view (raw `log_buffer`)

Poll `getProjectAgents(projectId)` every 3s. When an agent is selected, poll `getAgentSteps(agentId)` every 2s.

### 10. Keep existing AgentPanel as global view

The existing `AgentPanel.tsx` shows ALL agents globally. Keep it as-is for the global view, but the project-scoped agent list in `ProjectDetail` is the primary way to see what's happening per-project.

## Files Summary

| File | Action |
|------|--------|
| `agent-orchestrator/.../db/database.py` | Add `batch_id` to tasks table |
| `agent-orchestrator/.../services/batch_processor.py` | **NEW** — orchestration: spawn parallel agents per action |
| `agent-orchestrator/.../adapters/claude_code_sdk.py` | Add `steps` list to session, populate during send_task |
| `agent-orchestrator/.../api/batches.py` | Fire-and-forget processing + batch-tasks endpoint |
| `agent-orchestrator/.../api/agents.py` | Add logs, steps, and project-scoped agents endpoints |
| `agent-orchestrator/.../main.py` | Import batch processor |
| `electron-app/src/main/index.ts` | 4 new IPC handlers |
| `electron-app/src/main/preload.ts` | 4 new exposed APIs |
| `electron-app/src/renderer/pages/ProjectDetail.tsx` | Agents section with detail/steps view |

## Verification

1. Start dev environment (`./dev-setup.sh`)
2. Create a project in Electron, start its dev server
3. Open Chrome extension, make 2-3 visual edits, submit batch
4. Check AO logs (`/tmp/vex-logs/ao.log`) — should see N agents starting in parallel
5. In Electron ProjectDetail: verify agents appear with "running" status
6. Click an agent: verify steps appear in real-time (tool calls, text output)
7. After all agents finish: batch status → completed, agents → stopped
8. Verify agent detail still shows full step history after completion
