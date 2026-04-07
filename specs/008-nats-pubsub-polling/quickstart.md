# Quickstart: Replace HTTP Polling with NATS Pub/Sub

## What This Feature Does

Replaces 7+ polling loops (setInterval) across the Electron app and Chrome extension with NATS pub/sub event-driven updates. The backend publishes events when state changes; the frontend listens and re-fetches data on demand.

## Implementation Order

### Layer 1: Backend Event Publishing (Python)

Add `nats_service.publish()` calls in 4 backend files after DB commits:

1. `api/projects.py` — publish `vex.project.events` on create/update/delete
2. `api/agents.py` — publish `vex.project.events` on register/deregister
3. `api/batches.py` — publish `vex.batch.events` on submit
4. `services/batch_processor.py` — publish `vex.activity.events` after activity_events INSERT

Each publish is a single `await nats_service.publish(subject, payload)` call. Follow the existing pattern in `batch_processor.py` (lines 67-70, 352-355).

### Layer 2: Electron NATS-to-IPC Bridge (TypeScript)

Add 3 pairs of IPC handlers in `electron-app/src/main/index.ts`, following the `subscribe-agent-steps` pattern (lines 461-529):

- `subscribe-project-events` / `unsubscribe-project-events` → `vex.project.events` → `project-event`
- `subscribe-batch-events` / `unsubscribe-batch-events` → `vex.batch.events` → `batch-event`
- `subscribe-activity-events` / `unsubscribe-activity-events` → `vex.activity.events` → `activity-event`

Add 9 preload methods in `preload.ts` and matching types in `electron.d.ts`.

### Layer 3: Electron Renderer (React)

Replace `setInterval` with event listeners in 5 components:

1. `App.tsx` — global subscriptions to project-events and batch-events on mount
2. `Projects.tsx` — remove 5s poll, add `onProjectEvent` + `onBatchEvent`
3. `ProjectDetail.tsx` — remove 2s+3s polls, add `onProjectEvent`
4. `BatchList.tsx` — remove 5s poll, add `onBatchEvent`
5. `Activity.tsx` — remove 10s poll, add `onActivityEvent`

Each component: keep initial fetch, add event listener with 300ms debounce, cleanup on unmount.

### Layer 4: Chrome Extension

Replace HTTP poll in `AgentCursors.tsx` with initial fetch + NATS subscription.

### Layer 5: Cleanup

- Slow `DevServerLogs.tsx` poll from 1s to 3s
- Slow `claude_code_sdk.py` asyncio.sleep from 0.5 to 1.5

## Key Patterns to Follow

- **Publish pattern**: `await nats_service.publish("vex.{domain}.events", {"event": "...", ...})`
- **IPC bridge pattern**: Copy `subscribe-agent-steps` handler structure
- **Preload pattern**: Copy `subscribeAgentSteps`/`onAgentStep` method structure
- **Renderer pattern**: `useEffect(() => { const cleanup = window.electronAPI.onProjectEvent(() => debouncedFetch()); return cleanup; }, [])`

## Testing

1. Backend: `cd agent-orchestrator && uv run ruff check .`
2. Extension: `cd chrome-extension && npm run build`
3. Electron: `cd electron-app && npm run build`
4. Functional: Start with `./dev-setup.sh`, verify instant UI updates on project/batch/agent changes
5. CPU: Verify idle state produces no polling HTTP requests
