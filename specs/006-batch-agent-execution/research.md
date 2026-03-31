# Research: Wire Batch Submission to Agent Execution

**Feature**: 006-batch-agent-execution
**Date**: 2026-03-30

## R1: Batch Processing Orchestration Pattern

**Decision**: Module-level singleton service (`batch_processor.py`) triggered via `asyncio.create_task` from the batch submission endpoint. Each action spawns an independent agent via `asyncio.gather`.

**Rationale**:
- `asyncio.create_task` provides fire-and-forget semantics — HTTP response returns immediately (FR-011)
- `asyncio.gather` runs all action-agents in parallel (FR-002, SC-002)
- Module-level singleton avoids DI complexity while keeping state accessible for log/step queries
- Aligns with existing service patterns in the codebase (e.g., `nats_service`)

**Alternatives considered**:
- Background task queue (Celery/ARQ): Overkill for single-user desktop app. Adds deployment complexity.
- Sequential processing: Violates SC-002 (parallel execution requirement).
- NATS-triggered processing: Would work but adds unnecessary indirection — the batch endpoint already knows the batch ID.

## R2: Agent Session Lifecycle (ClaudeSDKClient)

**Decision**: Use `ClaudeSDKClient` with async context manager (`async with`) for each ephemeral agent. One client per action, created in `batch_processor.process_batch()`, cleaned up after completion/failure.

**Rationale**:
- User explicitly requires `ClaudeSDKClient` over `query()` — always
- Context manager ensures proper cleanup even on exceptions
- The existing adapter already uses `ClaudeSDKClient` — this extends the pattern
- `send_task()` already handles the `__aenter__`/`__aexit__` lifecycle

**Alternatives considered**:
- `query()` function: Simpler for one-shot tasks, but user mandates `ClaudeSDKClient`
- Persistent long-lived clients: Unnecessary — agents are ephemeral (FR-010)

## R3: Structured Step Capture

**Decision**: Add a `steps: list[dict]` field to `SDKAgentSession` alongside the existing `log_buffer`. Each step is a dict with `type`, `content`, `timestamp`, `status`. Steps are populated during `send_task()` message processing and persisted to `trace_steps` table after completion.

**Rationale**:
- The existing `log_buffer` captures raw strings — not structured enough for the step timeline UI (FR-003, FR-007)
- Step types map directly to SDK message types: `TextBlock` → "text", `ToolUseBlock` → "tool_use", `ResultMessage` → "completed", exceptions → "error"
- Persisting to `trace_steps` (existing table) means steps survive agent cleanup and AO restarts
- The Electron app already has an `AgentTrace` page that reads from `trace_steps`

**Alternatives considered**:
- Hooks (PreToolUse/PostToolUse): More granular but adds complexity. The message stream already provides all needed data.
- JSONL file logging (research-agent pattern): Good for debugging but not queryable via API. DB storage is better for the Electron UI.

## R4: Batch-to-Task Linkage

**Decision**: Add `batch_id TEXT` column to the existing `tasks` table with a foreign key to `batches(id)`. Each action in a batch gets one task row linked to both the batch and the agent processing it.

**Rationale**:
- Enables batch-to-task traceability (FR-012)
- The `tasks` table already has `agent_id` and `project_id` — adding `batch_id` completes the relationship
- Migration guard (`ALTER TABLE ... ADD COLUMN`) handles existing databases

**Alternatives considered**:
- Separate junction table: Over-engineered for a 1:N relationship (one batch → many tasks)
- Storing batch_id in task context JSON: Not queryable, breaks relational integrity

## R5: Electron Polling Strategy

**Decision**: Poll `GET /api/projects/{project_id}/agents` every 3 seconds on the Project Detail page. When an agent is selected, additionally poll `GET /api/agents/{agent_id}/steps` every 2 seconds.

**Rationale**:
- Polling is simple and reliable — no WebSocket infrastructure needed on the Electron side
- 3s interval balances responsiveness (SC-003: within 5s) with load
- 2s for steps gives near-real-time feel for the detail view
- Existing pattern: ProjectDetail already polls project status while dev server is starting

**Alternatives considered**:
- NATS subscription from Electron: Would require WebSocket client in Electron renderer — adds complexity. NATS is currently only used by Chrome Extension.
- Server-Sent Events: Requires additional endpoint type not used elsewhere in the codebase.
- WebSocket: Adds bidirectional channel not needed — polling is sufficient for status display.

## R6: Agent-Agnostic Design

**Decision**: The batch processor uses `AgentManagerService.start_agent()` with `adapter_type` parameter, not the `ClaudeCodeSDKAdapter` directly. This preserves Constitution Principle V (Agent-Agnostic Orchestration).

**Rationale**:
- The `AgentManagerService` already abstracts adapter selection
- Future agent types can be plugged in by registering new adapters
- The batch processor only needs to know: start agent → send task → read steps → stop agent

**Alternatives considered**:
- Direct adapter usage: Simpler but violates Principle V. The batch processor would be coupled to a specific agent type.
