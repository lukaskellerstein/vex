# Spec 007: Continue Conversation with Finished Agent

## Context

Agents currently operate fire-and-forget: user submits a batch, agent processes it, agent is torn down. If the agent breaks something, the user can't tell the same agent "fix what you broke" — they'd need a new agent that lacks prior context.

The Claude Agent SDK (v0.1.53) natively supports multi-turn via `session_id`. Sessions persist to `~/.claude/projects/<cwd>/<session_id>.jsonl`. A new `ClaudeSDKClient` with same `cwd` + `session_id` loads prior conversation history automatically.

**Goal**: Allow users to send follow-up messages to completed/failed agents from **both** the Electron UI and the Chrome Extension.

---

## 1. Backend: SDK Adapter — `session_id` + `resume()`

**File**: `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`

- Set `session.session_id = f"vex-{agent_id}"` in `start()` (~line 166)
- Pass `session_id` in `send_task()`: `await session.client.query(prompt, session_id=session.session_id)` (~line 250)
- **Refactor**: Extract the message streaming loop (~lines 269-605) into a shared `_stream_response(session, task_id)` to avoid duplication
- **Add `resume()` method**:
  - Accepts `agent_id, project_id, project_path, message, session_id`
  - Reconstructs `ClaudeAgentOptions` from profile (same as `start()`, same `cwd`)
  - Creates new `ClaudeSDKClient` + `SDKAgentSession` with the given `session_id`
  - Enters context, calls `query(message, session_id=session_id)`, streams via `_stream_response()`

**File**: `agent-orchestrator/src/agent_orchestrator/adapters/base.py`
- Add abstract `resume()` to `AgentAdapter`

## 2. Backend: `continue_agent()` orchestration

**File**: `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py`

- Add `continue_agent(agent_id: str, message: str)` — mirrors `_process_action()` structure:
  1. Look up agent -> project from DB
  2. Derive `session_id = f"vex-{agent_id}"`
  3. Create task row (type=`"continue"`, prompt=message)
  4. `_agent_manager.start_agent()` -> status=running
  5. `adapter.resume(...)` -> stream response
  6. `_persist_trace()` on completion
  7. Finally: `_agent_manager.stop_agent(agent_id)`

## 3. Backend: API endpoint

**File**: `agent-orchestrator/src/agent_orchestrator/api/agents.py`

- Add `ContinueRequest(BaseModel)` with `message: str` (in `models/agent.py`)
- Add `POST /api/agents/{agent_id}/continue`:
  - Validate agent exists and is in terminal state (`completed`, `failed`, `stopped`)
  - Reject if agent is already `running` (race condition guard)
  - Spawn `asyncio.create_task(continue_agent(agent_id, body.message))`
  - Return `{"status": "resuming", "agent_id": agent_id}`

## 4. Backend: Multi-trace retrieval

**File**: `agent-orchestrator/src/agent_orchestrator/api/agents.py`

- Modify `get_agent_trace()` to return **all** traces for the agent ordered by `created_at ASC`
- Each trace includes its steps and the associated task prompt
- Return: `{ "traces": [...], "agent_id": ... }`
- UI can display full multi-turn history

## 5. Electron App: IPC bridge

**File**: `electron-app/src/main/preload.ts`

```typescript
continueAgent: (agentId: string, message: string) =>
  ipcRenderer.invoke("continue-agent", agentId, message),
```

**File**: `electron-app/src/main/index.ts`

```typescript
ipcMain.handle("continue-agent", async (_event, agentId: string, message: string) => {
  return apiPost(`/api/agents/${agentId}/continue`, { message });
});
```

**File**: `electron-app/src/renderer/electron.d.ts`

```typescript
continueAgent: (agentId: string, message: string) => Promise<any>;
```

## 6. Electron App: AgentTrace follow-up input

**File**: `electron-app/src/renderer/pages/AgentTrace.tsx`

- Add state: `followUpMessage`, `isSending`
- Add `handleContinue()`:
  - Calls `window.electronAPI.continueAgent(agentId, message)`
  - Clears input, resets to live mode (`setTrace(null)`, `setLiveSteps([])`, `setAgentStatus("running")`)
  - Re-subscribes to NATS (same agentId -> same subjects -> existing subscription logic works)
- Render fixed-bottom input bar when `displayStatus` is terminal:
  - Textarea + Send button, Catppuccin Mocha themed
  - Disabled while `isSending`
- Update `fetchPersistedTrace()` to handle multi-trace response:
  - Concatenate steps across traces with turn separators
  - Aggregate metrics (cost, tokens, duration)

## 7. Chrome Extension: Agent follow-up from content script

The extension needs a way to continue conversations with completed/failed agents directly on the page. The `AgentCursors` component already tracks agents and their completion status.

### 7a. Agent completion notification with "Continue" action

**File**: `chrome-extension/src/content/components/AgentCursors.tsx`

- When an agent completes or fails, instead of immediately fading it out, show a **notification badge** on the cursor with:
  - Status icon (check/X)
  - Agent name
  - A small "Reply" / chat icon button
- Clicking the reply button opens a **floating input panel** anchored near the cursor position
- The floating panel contains:
  - A textarea for the follow-up message
  - Send button
  - Close/dismiss button
- On send: `POST /api/agents/{agentId}/continue` directly via `fetch()` (same pattern as existing HTTP calls in the extension)
- After sending: reset agent status to "running", cursor reappears with animation
- On dismiss: proceed with normal fade-out

### 7b. Persistent agent status panel (optional enhancement)

**File**: `chrome-extension/src/content/components/AgentStatusPanel.tsx` (new)

- A small floating panel (bottom-right corner) that appears when agents are active on the page
- Shows list of agents with status (running/completed/failed)
- Each completed/failed agent has a "Continue" button
- Clicking opens the same follow-up input
- This ensures the user can continue even if they missed the cursor notification

### 7c. NATS re-subscription for continued agents

- When user sends a continue message, the extension re-subscribes to `vex.agent.{agentId}.status` (already done via `subscribeAgentStatus()`)
- The `completedAgentIdsRef` set needs to be updated to remove the agent so it can be "resurrected" when the continue response starts
- Agent cursor transitions back to "running" state with the animated arrow

---

## Key Design Decisions

1. **New client per resume, not keep-alive**: SDK persists sessions to disk. Simpler than maintaining long-lived clients.
2. **Same agent_id reused**: Status cycles `completed/failed` -> `running` -> `completed/failed`. Same NATS subjects, existing subscriptions pick up new steps.
3. **New trace per turn**: Each continuation creates a new `agent_traces` row. API returns all, UI concatenates.
4. **Chrome extension calls API directly**: No IPC bridge needed — the extension already uses `fetch()` to talk to the AO at `localhost:8420`.
5. **Cursor-anchored input**: Natural UX — the user sees where the agent worked, and can reply right there.

---

## Files to Modify

| File | Change |
|------|--------|
| `agent-orchestrator/.../adapters/claude_code_sdk.py` | `session_id`, `resume()`, refactor streaming |
| `agent-orchestrator/.../adapters/base.py` | Abstract `resume()` |
| `agent-orchestrator/.../services/batch_processor.py` | `continue_agent()` |
| `agent-orchestrator/.../api/agents.py` | `/continue` endpoint, multi-trace retrieval |
| `agent-orchestrator/.../models/agent.py` | `ContinueRequest` model |
| `electron-app/src/main/preload.ts` | `continueAgent` IPC |
| `electron-app/src/main/index.ts` | `continue-agent` handler |
| `electron-app/src/renderer/electron.d.ts` | Type declaration |
| `electron-app/src/renderer/pages/AgentTrace.tsx` | Input bar, multi-trace display |
| `chrome-extension/src/content/components/AgentCursors.tsx` | Completion notification + reply input |
| `chrome-extension/src/content/components/AgentStatusPanel.tsx` | New: floating agent status panel |

---

## Verification

1. **Backend**: `POST /api/agents/{id}/continue` -> 200 for terminal agents, 409 for running
2. **Electron UI**: Navigate to completed agent trace -> input bar visible -> send message -> agent resumes with live steps -> new trace appended
3. **Chrome Extension**: Agent completes on page -> reply button appears on cursor -> type message -> send -> cursor transitions back to running -> agent resumes with context
4. **NATS**: Steps stream on same `vex.agent.{id}.step` subject during continuation
5. **Multi-turn context**: Verify the SDK loads prior conversation (check that the agent references its prior work in the response)
