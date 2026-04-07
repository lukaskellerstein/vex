# Research: Replace HTTP Polling with NATS Pub/Sub

## R1: NATS Subject Naming for New Event Channels

**Decision**: Use 3 new broadcast subjects: `vex.project.events`, `vex.batch.events`, `vex.activity.events`

**Rationale**: The existing pattern uses per-entity subjects (`vex.agent.{id}.step`, `vex.batch.{id}.status`). For UI invalidation, we need broadcast channels — the UI doesn't know which entity changed, it needs to know *that* something changed. Broadcast subjects avoid N subscriptions (one per entity) in favor of one subscription with event-type filtering.

**Alternatives considered**:
- Per-entity subjects (e.g., `vex.project.{id}.events`): Rejected — the Projects page needs all project changes, not just one. Would require wildcard subscriptions and add complexity.
- Single `vex.events` subject: Rejected — too coarse. Components would receive irrelevant events, and debouncing would be harder to scope.

## R2: Event-Driven Invalidation vs Delta Application

**Decision**: Use invalidation (re-fetch full data on event receipt), not delta application (apply event payload directly to state).

**Rationale**: The current components already have `fetchProjects()`, `fetchBatches()`, etc. Invalidation reuses these functions and avoids duplicating state management logic. The HTTP round-trip is cheap (local network, SQLite reads). Delta application would require keeping frontend state in sync with backend state — a much larger change with more failure modes.

**Alternatives considered**:
- Delta application (update React state directly from event payload): Rejected — requires maintaining a parallel state model in the frontend, increases complexity, and creates consistency risks.

## R3: Debounce Strategy for Rapid Events

**Decision**: Debounce re-fetch calls at 300ms per data source using a simple timeout-based debounce.

**Rationale**: During batch processing, multiple agent status changes and batch status changes can fire within milliseconds. Without debouncing, each event triggers a separate HTTP re-fetch and React re-render. 300ms is fast enough to feel instant to users while batching rapid-fire events.

**Alternatives considered**:
- No debounce: Rejected — batch processing can generate 10+ events per second, causing re-render storms.
- Throttle instead of debounce: Rejected — debounce is simpler and more appropriate here (we want the final state after a burst, not intermediate states).

## R4: NATS Reconnection and Stale State Recovery

**Decision**: On NATS reconnection, trigger a full data refresh for all subscribed components.

**Rationale**: NATS events during disconnection are lost (no persistence/replay). After reconnect, the UI state may be stale. A full re-fetch is the simplest way to ensure consistency. The nats.ws client fires reconnect events that can be hooked.

**Alternatives considered**:
- NATS JetStream (persistent messages): Rejected — overengineered for single-user local deployment. Adds operational complexity for a problem that a single HTTP re-fetch solves.

## R5: Chrome Extension Cursor Polling Replacement

**Decision**: Replace the 3s HTTP poll to `/api/cursors` with an initial fetch on mount + NATS subscription to `vex.project.events` for agent completion detection. Keep the existing `vex.batch.*.cursors` subscription for cursor initialization.

**Rationale**: The HTTP poll exists to detect when agents finish (to remove cursors) and when new cursors appear. Cursor initialization is already handled by `vex.batch.*.cursors` NATS subscription. Agent completion is already published on `vex.agent.{id}.status`. The only gap is detecting new batches — which `vex.batch.events` covers.

**Alternatives considered**:
- Keep HTTP polling at slower interval: Rejected — doesn't achieve the goal of eliminating polling.

## R6: What Stays as Polling

**Decision**: Three polling loops are intentionally retained.

| Poll | Interval | Reason |
|------|----------|--------|
| Dev server logs (`DevServerLogs.tsx`) | 1s → 3s | Reads from Electron child process stdout. No backend event source. |
| Health check (`ConnectionStatus.tsx`) | 4s (unchanged) | Connectivity probe — events can't tell you if the connection is down. |
| Cursor position (`AgentCursors.tsx`) | 200ms → 500ms | DOM layout tracking, purely client-side computation. |

## R7: asyncio.sleep in Log Streaming

**Decision**: Slow the busy-wait log streaming loop from `asyncio.sleep(0.5)` to `asyncio.sleep(1.5)` in `claude_code_sdk.py`.

**Rationale**: This loop polls an in-memory buffer (not a backend endpoint). It can't be event-driven. Slowing it from 0.5s to 1.5s reduces CPU wake-ups by 3x with minimal impact on log freshness.
