# Tasks: Replace HTTP Polling with NATS Pub/Sub

**Input**: Design documents from `/specs/008-nats-pubsub-polling/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project scaffolding needed — all files exist. This phase is empty.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend event publishing and Electron NATS-to-IPC bridge — these MUST be complete before any renderer-side polling replacement can work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Backend Event Publishing

- [x] T001 [P] Add NATS publish calls for project CRUD (created, updated, deleted) to `vex.project.events` in `agent-orchestrator/src/agent_orchestrator/api/projects.py` — publish after each DB commit in `create_project()`, `update_project()`, `delete_project()` following the payload format in contracts/nats-events.md
- [x] T002 [P] Add NATS publish calls for agent register/deregister (agent_registered, agent_deregistered) to `vex.project.events` in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — publish after DB commit in `register_agent()` and `deregister_agent()`
- [x] T003 [P] Add NATS publish call for batch submission (submitted) to `vex.batch.events` in `agent-orchestrator/src/agent_orchestrator/api/batches.py` — publish after batch creation in `submit_batch()`
- [x] T004 [P] Add NATS publish calls for activity events (batch_processing, batch_completed, batch_failed) to `vex.activity.events` in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — publish after each `INSERT INTO activity_events` (batch processing started ~line 251, batch outcome ~line 349)
- [x] T005 [P] Add NATS publish call for batch processing/completed/failed/cancelled to `vex.batch.events` in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — publish alongside existing `vex.batch.{id}.status` publishes at lines 67-70, 352-355, 367-370

### Electron NATS-to-IPC Bridge

- [x] T006 Add 6 IPC handlers in `electron-app/src/main/index.ts` — 3 subscribe + 3 unsubscribe handlers for `project-event`, `batch-event`, `activity-event` channels, following the existing `subscribe-agent-steps` / `unsubscribe-agent-steps` pattern (lines 461-529). Each handler: `ensureNatsConnection()` → `nc.subscribe(subject)` → async iterate → `mainWindow.webContents.send(channel, data)`. Use `natsSubscriptions` map for dedup.
- [x] T007 Add 9 preload methods in `electron-app/src/main/preload.ts` — `subscribeProjectEvents`, `unsubscribeProjectEvents`, `onProjectEvent`, `subscribeBatchEvents`, `unsubscribeBatchEvents`, `onBatchEvent`, `subscribeActivityEvents`, `unsubscribeActivityEvents`, `onActivityEvent` following the existing `subscribeAgentSteps`/`onAgentStep` pattern (lines 68-86)
- [x] T008 Add 9 type declarations in `electron-app/src/renderer/electron.d.ts` — matching the 9 preload methods added in T007, following the existing type pattern for `subscribeAgentSteps`/`onAgentStep`/`onAgentStatus`/`onAgentHook`

**Checkpoint**: Backend publishes events, Electron bridges them to renderer. Lint check: `cd agent-orchestrator && uv run ruff check .` and `cd electron-app && npm run build`

---

## Phase 3: User Story 1 - Instant Project List Updates (Priority: P1) 🎯 MVP

**Goal**: Projects page updates instantly on project CRUD without 5s polling interval.

**Independent Test**: Create a project via the UI → projects list updates within 1 second without page refresh.

### Implementation for User Story 1

- [x] T009 [US1] Add global NATS subscriptions in `electron-app/src/renderer/App.tsx` — subscribe to `project-events` and `batch-events` on mount via `window.electronAPI.subscribeProjectEvents()` and `window.electronAPI.subscribeBatchEvents()`. Unsubscribe on cleanup.
- [x] T010 [US1] Replace polling with event listener in `electron-app/src/renderer/pages/Projects.tsx` — remove `setInterval(fetchProjects, 5000)` (line 207), add `window.electronAPI.onProjectEvent(() => debouncedFetchProjects())` and `window.electronAPI.onBatchEvent(() => debouncedFetchProjects())`. Keep initial `fetchProjects()` on mount. Add 300ms debounce to re-fetch.

**Checkpoint**: Projects page reflects CRUD changes instantly. Verify: create/delete/rename a project while watching the Projects page.

---

## Phase 4: User Story 2 - Real-Time Batch and Agent Status on Project Detail (Priority: P1)

**Goal**: Project detail page updates batch list and agent statuses instantly without 2s+3s polling.

**Independent Test**: Submit a batch while viewing project detail → batch status transitions appear in real time.

### Implementation for User Story 2

- [x] T011 [US2] Replace polling with event listeners in `electron-app/src/renderer/pages/ProjectDetail.tsx` — remove both polling useEffects (2s project status poll ~line 122, 3s agents poll ~line 132). Add `window.electronAPI.onProjectEvent(handler)` that calls `fetchProject()` or `fetchAgents()` based on event type. Add 300ms debounce.
- [x] T012 [US2] Replace polling with event listener in `electron-app/src/renderer/components/project-detail/BatchList.tsx` — remove `setInterval(fetchBatches, 5000)` (line 63). Add `window.electronAPI.onBatchEvent(handler)` filtered by `project_id`. Keep initial `fetchBatches()` on mount. Add 300ms debounce.

**Checkpoint**: Project detail shows real-time batch transitions and agent status. Verify: submit a batch, observe status updates without delay.

---

## Phase 5: User Story 3 - Real-Time Activity Feed (Priority: P2)

**Goal**: Activity page shows new entries instantly instead of waiting 10s.

**Independent Test**: Trigger a batch while viewing Activity page → activity entry appears within 1 second.

### Implementation for User Story 3

- [x] T013 [US3] Add activity subscription in `electron-app/src/renderer/App.tsx` — subscribe to `activity-events` on mount via `window.electronAPI.subscribeActivityEvents()`. Unsubscribe on cleanup. (Extend the useEffect added in T009.)
- [x] T014 [US3] Replace polling with event listener in `electron-app/src/renderer/pages/Activity.tsx` — remove `setInterval(fetchData, 10000)` (line 80). Add `window.electronAPI.onActivityEvent(() => debouncedFetchData())`. Keep initial `fetchData()` on mount. Add 300ms debounce.

**Checkpoint**: Activity page updates instantly. Verify: run a batch, check activity events appear without delay.

---

## Phase 6: User Story 4 - Chrome Extension Cursor Updates Without HTTP Polling (Priority: P2)

**Goal**: Chrome extension stops 3s HTTP poll for cursors, uses NATS events instead.

**Independent Test**: Run a batch with cursors active → cursors appear/disappear based on NATS events, no HTTP polling.

### Implementation for User Story 4

- [x] T015 [US4] Replace HTTP polling with NATS subscription in `chrome-extension/src/content/components/AgentCursors.tsx` — remove the 3s `setInterval` HTTP poll to `/api/cursors` (lines 425-463). Replace with: single initial fetch on mount + rely on existing `vex.batch.*.cursors` subscription (line 469) for cursor initialization + existing `vex.agent.{id}.status` subscription (line 290) for agent completion detection.

**Checkpoint**: Cursors appear and disappear without HTTP polling. Verify: `cd chrome-extension && npm run build` succeeds, then test with dev environment.

---

## Phase 7: User Story 5 - Reduced CPU and Network Usage at Idle (Priority: P1)

**Goal**: Zero periodic HTTP requests for project/batch/activity data at idle.

**Independent Test**: Start VEX with no active operations → verify no polling requests over 30 seconds.

### Implementation for User Story 5

- [x] T016 [P] [US5] Slow dev server log polling from 1s to 3s in `electron-app/src/renderer/components/project-detail/DevServerLogs.tsx` (line 86) — change interval from 1000 to 3000
- [x] T017 [P] [US5] Slow log streaming busy-wait from `asyncio.sleep(0.5)` to `asyncio.sleep(1.5)` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` (line 1030)
- [x] T018 [P] [US5] Slow cursor position tracking from 200ms to 500ms in `chrome-extension/src/content/components/AgentCursors.tsx` (line 219) — change interval from 200 to 500

**Checkpoint**: At idle, no polling HTTP requests for projects/batches/activity. Dev server logs and cursor position poll at reduced rates. Verify CPU usage is measurably lower.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and final validation.

- [x] T019 Add NATS reconnection handler in `electron-app/src/main/index.ts` — on NATS reconnect event, send a `nats-reconnected` IPC event to renderer so components can trigger a full data refresh
- [x] T020 Run lint and build verification: `cd agent-orchestrator && uv run ruff check .` && `cd chrome-extension && npm run build` && `cd electron-app && npm run build`
- [x] T021 Run quickstart.md validation — start VEX with `./dev-setup.sh` and verify all 5 user story acceptance scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)**: No dependencies — start immediately. BLOCKS all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion (T006-T008 for IPC bridge)
- **Phase 4 (US2)**: Depends on Phase 2 completion + T009 (global subscriptions from US1)
- **Phase 5 (US3)**: Depends on Phase 2 completion + T009 (global subscriptions from US1)
- **Phase 6 (US4)**: Depends on Phase 2 completion (T001-T005 for backend events)
- **Phase 7 (US5)**: No dependencies — can run in parallel with any phase
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2. Sets up global subscriptions in App.tsx (T009) that US2, US3 depend on.
- **US2 (P1)**: After Phase 2 + T009. Independent from US1 otherwise.
- **US3 (P2)**: After Phase 2 + T009. Extends App.tsx subscription from T009.
- **US4 (P2)**: After Phase 2. Fully independent — Chrome extension, different codebase.
- **US5 (P1)**: Fully independent — only changes polling intervals, no event dependencies.

### Parallel Opportunities

- **Phase 2**: T001-T005 (backend) are all [P] — different files. T006-T008 (Electron) are sequential (IPC → preload → types).
- **Phase 7**: T016, T017, T018 are all [P] — different files, different codebases.
- **US4 + US5**: Can run in parallel with US1/US2/US3 — different codebases.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Backend publish calls — all different files, run in parallel:
Task T001: "Add project CRUD publishes in api/projects.py"
Task T002: "Add agent register/deregister publishes in api/agents.py"
Task T003: "Add batch submission publish in api/batches.py"
Task T004: "Add activity event publishes in batch_processor.py"
Task T005: "Add batch event publishes in batch_processor.py"

# Then sequentially — each depends on the previous:
Task T006: "Add IPC handlers in index.ts"
Task T007: "Add preload methods in preload.ts"
Task T008: "Add type declarations in electron.d.ts"
```

## Parallel Example: Phase 7 (US5 - Reduced CPU)

```bash
# All different files, run in parallel:
Task T016: "Slow DevServerLogs polling in DevServerLogs.tsx"
Task T017: "Slow log streaming sleep in claude_code_sdk.py"
Task T018: "Slow cursor position interval in AgentCursors.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (backend events + IPC bridge)
2. Complete Phase 3: User Story 1 (Projects page)
3. **STOP and VALIDATE**: Create/delete project → verify instant update
4. This alone eliminates the most visible polling loop

### Incremental Delivery

1. Phase 2 → Foundation ready
2. Phase 3 (US1) → Projects page instant updates (MVP!)
3. Phase 4 (US2) → Project detail real-time updates
4. Phase 5 (US3) → Activity feed real-time updates
5. Phase 6 (US4) → Chrome extension polling eliminated
6. Phase 7 (US5) → Remaining intervals slowed
7. Phase 8 → Polish, edge cases, final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No test tasks included — spec does not request TDD approach
- T004 and T005 both modify `batch_processor.py` — implement together to avoid conflicts
- T009 and T013 both modify `App.tsx` — T013 extends T009's useEffect
