# Spec 008: Replace HTTP Polling with NATS Pub/Sub

## Context

VEX causes high CPU usage (fans spinning) because of 7+ `setInterval` polls (200ms to 10s) running simultaneously across the Electron app and Chrome extension — all hitting HTTP endpoints, triggering React re-renders, and creating unnecessary network traffic. NATS infrastructure is already in place and used for agent step/status streaming. The fix is to publish state-change events from the backend and subscribe to them in the frontend, eliminating polling entirely for data that changes in response to backend actions.

---

## 1. Architecture

**Pattern:** Backend publishes events after DB commits → Electron main process subscribes via NATS WebSocket → forwards to renderer via IPC → React components listen and re-fetch full data on event (invalidation, not delta application).

**3 new NATS subjects:**

| Subject | Purpose |
|---------|---------|
| `vex.project.events` | Project CRUD + agent registration/status changes |
| `vex.batch.events` | Batch submitted/status transitions |
| `vex.activity.events` | New activity entries |

---

## 2. Backend: Add NATS Publish Calls

### 2a. Project CRUD — `api/projects.py`

Add `from agent_orchestrator.services import nats_service`.

Publish `vex.project.events` after each DB commit:

- `create_project()` → `{"event": "created", "project": <project_data>}`
- `update_project()` → `{"event": "updated", "project_id": ..., "project": <project_data>}`
- `delete_project()` → `{"event": "deleted", "project_id": ...}`

### 2b. Agent Registration — `api/agents.py`

Add `from agent_orchestrator.services import nats_service`.

Publish `vex.project.events` after DB commit:

- `register_agent()` → `{"event": "agent_registered", "project_id": ..., "agent": <agent_data>}`
- `deregister_agent()` → `{"event": "agent_deregistered", "agent_id": ...}`

### 2c. Batch Submission — `api/batches.py`

Add `from agent_orchestrator.services import nats_service`.

Publish `vex.batch.events` after batch creation in `submit_batch()`:

- `{"event": "submitted", "project_id": ..., "batch_id": ...}`

Note: `batch_processor.py` already publishes `vex.batch.{id}.status` for processing/completed/failed/cancelled transitions.

### 2d. Activity Events — `services/batch_processor.py`

Publish `vex.activity.events` after each existing `INSERT INTO activity_events`:

- Batch processing started (~line 251): `{"event": "batch_processing", "project_id": ..., "batch_id": ...}`
- Batch outcome (~line 349): `{"event": "batch_completed|batch_failed", "project_id": ..., "batch_id": ...}`

`nats_service` is already imported in this file.

### 2e. Log Streaming — `adapters/claude_code_sdk.py`

Slow the busy-wait log streaming loop from `asyncio.sleep(0.5)` to `asyncio.sleep(1.5)` (line 1013). This can't be replaced with events since it polls an in-memory buffer.

---

## 3. Electron Main Process: NATS-to-IPC Bridge

**File:** `electron-app/src/main/index.ts` — after the existing `unsubscribe-agent-steps` handler (line 529).

Add 3 pairs of IPC handlers following the existing `subscribe-agent-steps` pattern:

| IPC Handler | NATS Subject | IPC Channel |
|-------------|-------------|-------------|
| `subscribe-project-events` / `unsubscribe-project-events` | `vex.project.events` | `project-event` |
| `subscribe-batch-events` / `unsubscribe-batch-events` | `vex.batch.events` | `batch-event` |
| `subscribe-activity-events` / `unsubscribe-activity-events` | `vex.activity.events` | `activity-event` |

Each handler: `ensureNatsConnection()` → `nc.subscribe(subject)` → async iterate → `mainWindow.webContents.send(channel, data)`. Deduplicates via the existing `natsSubscriptions` map.

---

## 4. Electron Preload + Types

**File:** `electron-app/src/main/preload.ts` — after `onAgentHook` (line 86).

Add 9 methods (3 per subject), following the `subscribeAgentSteps`/`onAgentStep` pattern:

```text
subscribeProjectEvents / unsubscribeProjectEvents / onProjectEvent
subscribeBatchEvents   / unsubscribeBatchEvents   / onBatchEvent
subscribeActivityEvents / unsubscribeActivityEvents / onActivityEvent
```

**File:** `electron-app/src/renderer/electron.d.ts` — after line 45.

Add matching type declarations for all 9 methods.

---

## 5. Electron Renderer: Replace Polling with Event Listeners

### 5a. Global Subscriptions — `App.tsx`

Add `useEffect` to subscribe to `project-events` and `batch-events` on mount (needed by multiple pages). Unsubscribe on cleanup.

### 5b. Projects Page — `pages/Projects.tsx` (lines 205-209)

- Remove `setInterval(fetchProjects, 5000)`
- Replace with `onProjectEvent(() => fetchProjects())` + `onBatchEvent(() => fetchProjects())`
- Keep initial `fetchProjects()` call on mount

### 5c. Project Detail — `pages/ProjectDetail.tsx` (lines 118-134)

- Remove both polling useEffects (2s project status + 3s agents)
- Replace with `onProjectEvent` listener that calls `fetchProject()` or `fetchAgents()` based on event type
- Add debounce (300ms) to avoid re-fetch storms during rapid agent status changes

### 5d. Batch List — `components/project-detail/BatchList.tsx` (lines 62-68)

- Remove `setInterval(fetchBatches, 5000)`
- Replace with `onBatchEvent` listener filtered by `project_id`
- Keep initial `fetchBatches()` on mount

### 5e. Activity Page — `pages/Activity.tsx` (lines 78-84)

- Remove `setInterval(fetchData, 10000)`
- Replace with `subscribeActivityEvents()` on mount + `onActivityEvent(() => fetchData())`
- Unsubscribe on cleanup (activity subscription is page-local)

### 5f. Dev Server Logs — `components/project-detail/DevServerLogs.tsx` (line 105)

- Slow polling from 1s to 3s (reads from Electron child process stdout — no NATS event source)

---

## 6. Chrome Extension: Replace AgentCursors HTTP Poll

**File:** `chrome-extension/src/content/components/AgentCursors.tsx`

- Lines 445-483: Replace 3s HTTP poll with single initial fetch + NATS subscription to `vex.project.events` for agent status changes (completion detection). The existing `vex.batch.*.cursors` subscription (line 486) already handles cursor initialization.
- Line 219: Slow cursor position interval from 200ms to 500ms (DOM layout tracking — can't be event-driven).

---

## 7. What Stays as Polling

| Poll | Interval | Reason |
|------|----------|--------|
| Dev server logs (`DevServerLogs.tsx`) | 1s → 3s | Reads from Electron child process stdout, no backend event source |
| Health check (`ConnectionStatus.tsx`) | 4s | Connectivity probe — NATS can't tell you if HTTP is up |
| Cursor position (`AgentCursors.tsx`) | 200ms → 500ms | DOM layout tracking, purely client-side |

---

## 8. Files Modified (15 total)

| File | Change |
|------|--------|
| `agent-orchestrator/.../api/projects.py` | Add 3 publish calls |
| `agent-orchestrator/.../api/agents.py` | Add 2 publish calls |
| `agent-orchestrator/.../api/batches.py` | Add 1 publish call |
| `agent-orchestrator/.../services/batch_processor.py` | Add 2 publish calls |
| `agent-orchestrator/.../adapters/claude_code_sdk.py` | Slow asyncio.sleep 0.5→1.5 |
| `electron-app/src/main/index.ts` | Add 6 IPC handlers |
| `electron-app/src/main/preload.ts` | Add 9 API methods |
| `electron-app/src/renderer/electron.d.ts` | Add 9 type declarations |
| `electron-app/src/renderer/App.tsx` | Add global NATS subscriptions |
| `electron-app/.../pages/Projects.tsx` | Replace poll → event listener |
| `electron-app/.../pages/ProjectDetail.tsx` | Replace 2 polls → event listeners |
| `electron-app/.../project-detail/DevServerLogs.tsx` | Slow 1s→3s |
| `electron-app/.../project-detail/BatchList.tsx` | Replace poll → event listener |
| `electron-app/.../pages/Activity.tsx` | Replace poll → event listener |
| `chrome-extension/.../components/AgentCursors.tsx` | Replace HTTP poll + slow position interval |

---

## 9. Verification

1. `cd agent-orchestrator && uv run ruff check .` — lint backend
2. `cd chrome-extension && npm run build` — build extension
3. `cd electron-app && npm run build` — build electron app
4. Start VEX with `./dev-setup.sh`
5. Functional checks:
   - Create/delete a project → Projects page updates instantly without polling
   - Run a batch → BatchList updates on status change
   - Agent completion → cursor updates in Chrome extension
   - Activity page shows new events immediately
6. CPU monitoring — expect dramatic drop at idle (no more 2-10s polling cycles)
