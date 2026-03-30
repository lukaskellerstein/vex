# Tasks: First Full Run

**Input**: Design documents from `/specs/002-first-full-run/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Ensure dependencies are installed and project builds cleanly before any code changes.

- [ ] T001 Verify `nats-server` binary is available on PATH and document version in `electron-app/README.md`
- [ ] T002 [P] Run `uv sync` in `agent-orchestrator/` to ensure `claude-agent-sdk` dependency is installed
- [ ] T003 [P] Run `npm install` in `electron-app/` and verify `npm run build` succeeds

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire NATS connection in FastAPI lifespan — required by both US1 (health reporting) and US2 (event publishing).

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Wire `nats_service.connect()` on startup and `nats_service.disconnect()` on shutdown in `agent-orchestrator/src/agent_orchestrator/main.py` FastAPI lifespan
- [ ] T005 Update health endpoint in `agent-orchestrator/src/agent_orchestrator/api/config.py` to return real NATS connection status from `nats_service.is_connected()` instead of hardcoded `False`

**Checkpoint**: AgentManager starts, connects to NATS, and `/api/health` reports real NATS status.

---

## Phase 3: User Story 1 - NATS Starts Automatically (Priority: P1) MVP

**Goal**: Electron app reliably starts NATS as a managed child process with port-conflict detection, health checking, orphan cleanup, and graceful shutdown.

**Independent Test**: Launch the Electron app → NATS is reachable on port 4222 within 5 seconds → quit the app → NATS process is terminated and port released.

### Implementation for User Story 1

- [ ] T006 [US1] Add port-availability check before NATS spawn: use `net.createServer` probe on port 4222 in `electron-app/src/main/process-manager.ts`. If port is in use, emit error event with actionable message.
- [ ] T007 [US1] Add PID file management for NATS: write `nats-server` PID to `~/.vex/nats.pid` after spawn, remove on graceful shutdown, in `electron-app/src/main/process-manager.ts`
- [ ] T008 [US1] Add orphan cleanup on startup: read `~/.vex/nats.pid`, check if process is alive, kill if stale, in `electron-app/src/main/process-manager.ts`
- [ ] T009 [US1] Add TCP health check for NATS: attempt `net.createConnection` to port 4222 after spawn, with retry logic (500ms interval, 10 retries), in `electron-app/src/main/process-manager.ts`
- [ ] T010 [US1] Add NATS binary existence check on startup: verify `nats-server` is resolvable on PATH before spawning. If missing, emit error with install instructions, in `electron-app/src/main/process-manager.ts`
- [ ] T011 [US1] Update `StatusBar.tsx` to display real NATS health status from ProcessManager events in `electron-app/src/renderer/components/StatusBar.tsx`
- [ ] T012 [US1] Expose NATS health status via IPC: add `get-nats-status` handler in `electron-app/src/main/index.ts` and corresponding method in `electron-app/src/main/preload.ts`

**Checkpoint**: Electron app launches → NATS starts with health verification → StatusBar shows green → quit terminates NATS cleanly. Port conflict and missing binary scenarios show clear errors.

---

## Phase 4: User Story 2 - Real Claude Agent SDK Integration (Priority: P1)

**Goal**: Replace the stub `ClaudeCodeSDKAdapter` with a real implementation that creates `ClaudeSDKClient` sessions, sends tasks with project context, streams responses, and publishes progress via NATS.

**Independent Test**: Start AgentManager, register an SDK agent via `POST /api/agents`, submit a task via `POST /api/tasks`, verify real Claude Agent SDK output is returned (not stub messages).

### Implementation for User Story 2

- [ ] T013 [US2] Rewrite `ClaudeCodeSDKAdapter.start()` to create a `ClaudeSDKClient` instance with `ClaudeAgentOptions` (system_prompt, model, permission_mode, allowed_tools) and store as `SDKAgentSession` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T014 [US2] Rewrite `ClaudeCodeSDKAdapter.send_task()` to call `client.query(prompt)` and iterate `client.receive_response()`, publishing progress events to NATS subject `vex.task.{task_id}.progress` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T015 [US2] Build prompt formatter: convert task dict (project context + batch actions) into a structured system prompt for the Claude Agent SDK in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T016 [US2] Rewrite `ClaudeCodeSDKAdapter.get_status()` to return real session status (idle/running/completed/failed) from `SDKAgentSession` tracking in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T017 [US2] Rewrite `ClaudeCodeSDKAdapter.subscribe_logs()` to yield real-time messages from the SDK response stream (TextBlock, ToolUseBlock, ResultMessage) in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T018 [US2] Rewrite `ClaudeCodeSDKAdapter.stop()` to gracefully close the `ClaudeSDKClient` async context and clean up session state in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T019 [US2] Add error handling for SDK failures: catch authentication errors, timeouts, and SDK unavailability; return actionable error messages and set agent status to `error` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T020 [US2] Publish task completion event to NATS subject `vex.task.{task_id}.complete` with result summary, cost, and duration from `ResultMessage` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`

**Checkpoint**: AgentManager running → register SDK agent → submit task → real Claude Agent SDK processes it → streaming progress on NATS → task result stored in DB with real code changes.

---

## Phase 5: User Story 3 - End-to-End First Full Run (Priority: P2)

**Goal**: Validate the complete flow: Chrome extension batch submission → AgentManager → Claude Agent SDK → code change proposal returned to UI.

**Independent Test**: Launch Electron app → add a test project → open Chrome extension on project's dev server → make a visual edit → submit batch → see real code change proposal in Vex UI.

### Implementation for User Story 3

- [ ] T021 [US3] Verify batch-to-task pipeline: ensure `POST /api/projects/{id}/batches` correctly creates a task and routes it to the SDK adapter by tracing the flow in `agent-orchestrator/src/agent_orchestrator/api/batches.py` and `agent-orchestrator/src/agent_orchestrator/api/tasks.py`
- [ ] T022 [US3] Wire task result display in AgentPanel: update `electron-app/src/renderer/components/AgentPanel.tsx` to show real agent output (code changes, status, cost) instead of placeholder content
- [ ] T023 [US3] Add agent log streaming display: subscribe to NATS task progress events in the Electron renderer and show live agent activity in `electron-app/src/renderer/components/AgentPanel.tsx`
- [ ] T024 [US3] Add task result polling or NATS subscription in `electron-app/src/main/index.ts`: fetch completed task results via `GET /api/tasks/{id}` and forward to renderer via IPC

**Checkpoint**: Full end-to-end cycle works — visual edit in Chrome extension produces a real code change proposal visible in the Vex desktop UI.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and robustness improvements across all stories.

- [ ] T025 [P] Add NATS crash detection and auto-restart notification in `electron-app/src/main/process-manager.ts` — emit UI event when NATS restarts so StatusBar can flash a warning
- [ ] T026 [P] Add configurable agent task timeout (default 30s per constitution) in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — cancel SDK client if exceeded
- [ ] T027 [P] Handle concurrent batch submission: reject or queue new batch if agent is already processing in `agent-orchestrator/src/agent_orchestrator/api/tasks.py`
- [ ] T028 Run quickstart.md validation: follow the quickstart steps on a clean environment and verify the full setup works end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T002 for agent-orchestrator deps)
- **US1 (Phase 3)**: Depends on Phase 1 (T003 for electron-app build). Independent of Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2 (T004/T005 for NATS connection in lifespan)
- **US3 (Phase 5)**: Depends on both US1 and US2 being complete
- **Polish (Phase 6)**: Depends on US1 + US2 complete; can overlap with US3

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 1. No dependency on other stories.
- **User Story 2 (P1)**: Can start after Phase 2. No dependency on US1 (uses NATS via AgentManager, not Electron).
- **User Story 3 (P2)**: Depends on BOTH US1 and US2 — integration validation.

### Within Each User Story

- US1: T006 (port check) → T007 (PID file) → T008 (orphan cleanup) → T009 (health check) → T010 (binary check) can run before T006. T011/T012 (UI) depend on T009.
- US2: T013 (start) → T014 (send_task) → T015 (prompt formatter) can parallel with T013. T016/T017/T018 depend on T013. T19/T20 depend on T014.
- US3: T021 (verify pipeline) first → T022/T023/T024 can run in parallel after.

### Parallel Opportunities

- Phase 1: T002 and T003 are fully parallel (different components)
- Phase 2: T004 and T005 are sequential (T005 depends on T004)
- US1: T006 and T010 can run in parallel (different concerns)
- US1: T011 and T012 can run in parallel (renderer vs main process)
- US2: T015 (prompt formatter) can run in parallel with T013 (start rewrite)
- US2: T016, T017, T018 can run in parallel (independent methods, same file but different functions)
- Polish: T025, T026, T027 are fully parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Parallel batch 1 — independent port/binary checks:
Task: "T006 [US1] Add port-availability check in process-manager.ts"
Task: "T010 [US1] Add NATS binary existence check in process-manager.ts"

# Parallel batch 2 — UI updates (after T009 health check):
Task: "T011 [US1] Update StatusBar.tsx with real NATS status"
Task: "T012 [US1] Expose NATS health via IPC in index.ts + preload.ts"
```

## Parallel Example: User Story 2

```bash
# Parallel batch 1 — independent adapter methods:
Task: "T013 [US2] Rewrite start() with ClaudeSDKClient"
Task: "T015 [US2] Build prompt formatter"

# Parallel batch 2 — after T013 (depend on session tracking):
Task: "T016 [US2] Rewrite get_status()"
Task: "T017 [US2] Rewrite subscribe_logs()"
Task: "T018 [US2] Rewrite stop()"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (NATS wiring in lifespan)
3. Complete Phase 3: US1 — NATS starts reliably
4. Complete Phase 4: US2 — Real SDK adapter
5. **STOP and VALIDATE**: Test US1 and US2 independently
6. Both P1 stories deliver standalone value

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 → NATS launches reliably → Validate
3. Add US2 → Real agent tasks work → Validate
4. Add US3 → Full end-to-end validated → Demo-ready
5. Polish → Edge cases handled → Production-ready

---

## Notes

- All US2 tasks touch the same file (`claude_code_sdk.py`) but different methods — mark parallel only when truly independent functions
- US1 and US2 can proceed in parallel since they touch different components (Electron vs Python)
- US3 is purely integration — no new code beyond wiring and UI updates
- The 30s generation timeout from the constitution applies to agent tasks (T026)
