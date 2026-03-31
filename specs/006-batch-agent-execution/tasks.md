# Tasks: Wire Batch Submission to Agent Execution

**Input**: Design documents from `/specs/006-batch-agent-execution/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Database migration and shared infrastructure

- [x] T001 Add `batch_id TEXT` column to `tasks` table with FK to `batches(id)` and migration guard in `agent-orchestrator/src/agent_orchestrator/db/database.py`
- [x] T002 [P] Add `steps: list[dict]` field to `SDKAgentSession` dataclass in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Batch processor service and structured step capture — MUST complete before any user story UI work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create batch processor service as module-level singleton in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — implement `process_batch(project_id, batch_id)` that: loads batch actions from DB, updates batch status to "processing", spawns one agent per action via `AgentManagerService.start_agent()`, creates task rows with `batch_id`, calls `adapter.send_task()` for each, uses `asyncio.gather` for parallel execution, updates batch status to "completed"/"failed" based on aggregate results, persists `agent_traces` and `trace_steps` to DB after each agent completes, stops/cleans up agents after completion
- [x] T004 Add structured step capture to `send_task()` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — populate `session.steps` list during message processing: TextBlock → `{"type": "text", "content": ..., "timestamp": ..., "status": "current"}`, ToolUseBlock → `{"type": "tool_use", ...}`, ResultMessage → `{"type": "completed", ...}`, Exception → `{"type": "error", ...}`; update previous step status to "past" when new step arrives
- [x] T005 Expose `get_steps(agent_id)` and `get_logs(agent_id)` methods on the batch processor in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — reads from adapter `_sessions[agent_id].steps` and `.log_buffer` for live agents, falls back to `trace_steps` DB query for completed agents
- [x] T006 Import batch processor in `agent-orchestrator/src/agent_orchestrator/main.py` and register the Claude SDK adapter with `AgentManagerService` during app lifespan startup
- [x] T007 Add `asyncio.create_task(batch_processor.process_batch(project_id, batch_id))` after batch insert in `agent-orchestrator/src/agent_orchestrator/api/batches.py` to trigger fire-and-forget processing

**Checkpoint**: Batch submission now triggers parallel agent execution. Verify via AO logs and DB queries.

---

## Phase 3: User Story 1 — Automatic Batch Processing (Priority: P1) MVP

**Goal**: Submitting a batch triggers automatic parallel agent execution with status tracking, no manual intervention

**Independent Test**: Submit a batch via `curl POST /api/projects/{id}/batches`, check AO logs for agent spawning, verify batch transitions pending → processing → completed/failed via `GET /api/projects/{id}/batches`

### Implementation for User Story 1

- [x] T008 [US1] Add `GET /api/projects/{project_id}/batches/{batch_id}/tasks` endpoint in `agent-orchestrator/src/agent_orchestrator/api/batches.py` — returns all tasks for a batch with their status, agent_id, result, error
- [x] T009 [P] [US1] Add `GET /api/projects/{project_id}/agents` endpoint in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — returns agents filtered by project_id (ordered by created_at DESC) with summary counts (total, running, completed, failed)
- [x] T010 [P] [US1] Add `GET /api/agents/{agent_id}/steps` endpoint in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — returns structured steps from batch processor (live) or trace_steps table (completed)
- [x] T011 [US1] Handle edge case: batch with zero actions in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — mark batch "completed" immediately, no agents spawned
- [x] T012 [US1] Handle edge case: agent session start failure in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — mark task "failed", continue processing remaining actions, agent cleanup

**Checkpoint**: Full batch processing pipeline works end-to-end. Batches are processed automatically, agents run in parallel, statuses update correctly, all new endpoints return data.

---

## Phase 4: User Story 2 — Live Agent Status in Electron (Priority: P2)

**Goal**: Project Detail page shows a live list of agents per project with auto-updating status

**Independent Test**: Submit a batch, open Project Detail in Electron, observe agents appearing with "running" status and transitioning to "completed"/"failed"

### Implementation for User Story 2

- [x] T013 [P] [US2] Add IPC handler `get-project-agents` in `electron-app/src/main/index.ts` — calls `GET /api/projects/{projectId}/agents`
- [x] T014 [P] [US2] Add IPC handler `get-batch-tasks` in `electron-app/src/main/index.ts` — calls `GET /api/projects/{projectId}/batches/{batchId}/tasks`
- [x] T015 [US2] Expose `getProjectAgents` and `getBatchTasks` in `electron-app/src/main/preload.ts`
- [x] T016 [US2] Add "Agents" tab to Project Detail page in `electron-app/src/renderer/pages/ProjectDetail.tsx` — alongside existing "Batches" and "Dev Server Logs" tabs. Show agent list with: name, status badge (running=blue+spinner, completed=green, failed=red), action description, created_at. Header shows summary counts ("3 running, 2 completed"). Poll `getProjectAgents(projectId)` every 3 seconds. Order by created_at DESC.

**Checkpoint**: Electron shows live agent status. User can see agents spawn, run, and complete without refreshing.

---

## Phase 5: User Story 3 — Agent Step Timeline (Priority: P3)

**Goal**: Clicking an agent shows a chronological step-by-step execution timeline

**Independent Test**: Click a running or completed agent in the Agents tab, verify step timeline shows text/tool_use/completed/error steps with timestamps and status indicators

### Implementation for User Story 3

- [x] T017 [P] [US3] Add IPC handler `get-agent-steps` in `electron-app/src/main/index.ts` — calls `GET /api/agents/{agentId}/steps`
- [x] T018 [US3] Expose `getAgentSteps` in `electron-app/src/main/preload.ts`
- [x] T019 [US3] Add agent detail/step timeline view to Project Detail page in `electron-app/src/renderer/pages/ProjectDetail.tsx` — when an agent is clicked in the Agents tab, show inline detail with: action being processed, vertical step timeline (past steps dimmed with checkmark, current step highlighted with spinner), each step shows type icon (text/tool_use), content preview, timestamp. Poll `getAgentSteps(agentId)` every 2 seconds while agent is running. Show full history for completed agents. Error steps marked with red icon and error content.

**Checkpoint**: Full step-by-step visibility into agent execution. Works for both running and completed agents.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases and cleanup

- [x] T020 [P] Handle multiple rapid batch submissions in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — ensure each batch processes independently with no interference
- [x] T021 [P] Add activity event creation in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — log events to `activity_events` table when batch starts processing, completes, or fails
- [x] T022 Run quickstart.md validation — verify end-to-end flow per `specs/006-batch-agent-execution/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — backend endpoints for batch processing
- **US2 (Phase 4)**: Depends on Phase 3 (needs endpoints to poll) — Electron agent list UI
- **US3 (Phase 5)**: Depends on Phase 4 (needs agent list to click on) — step timeline UI
- **Polish (Phase 6)**: Depends on Phases 3-5

### Within Each User Story

- Backend endpoints before Electron IPC handlers
- IPC handlers before preload exposure
- Preload before renderer UI

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T009 and T010 can run in parallel (same file but independent endpoints)
- T013 and T014 can run in parallel (independent IPC handlers)
- T017 can run alongside T013/T014 if Phase 3 endpoints are done

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, launch independent endpoints in parallel:
Task: "T009 — GET /api/projects/{project_id}/agents endpoint in agents.py"
Task: "T010 — GET /api/agents/{agent_id}/steps endpoint in agents.py"
```

## Parallel Example: User Story 2

```bash
# Launch independent IPC handlers in parallel:
Task: "T013 — IPC handler get-project-agents in index.ts"
Task: "T014 — IPC handler get-batch-tasks in index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T007) — CRITICAL
3. Complete Phase 3: User Story 1 (T008-T012)
4. **STOP and VALIDATE**: Submit batch via curl, verify agents spawn, batch completes
5. Core pipeline works — everything else is UI polish

### Incremental Delivery

1. Setup + Foundational → Batch processing works (backend only)
2. Add US1 → All endpoints available → Verify via curl (MVP!)
3. Add US2 → Electron shows live agent list → Visual confirmation
4. Add US3 → Step timeline → Full observability
5. Each story adds visibility without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Always use `ClaudeSDKClient`, never `query()` — per user requirement
- Batch processor routes through `AgentManagerService` for agent-agnostic design (Constitution Principle V)
- Existing `agent_traces`/`trace_steps` tables reused — no new DB tables needed beyond `batch_id` column
