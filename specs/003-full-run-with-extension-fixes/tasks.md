# Tasks: Full Run with Extension Fixes

**Input**: Design documents from `/specs/003-full-run-with-extension-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks grouped by user story. US1-US2 (backend/Electron) and US3-US6 (extension) are independent workstreams.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Ensure all dependencies are installed and projects build cleanly.

- [x] T001 Verify `nats-server` binary is on PATH and record version
- [x] T002 [P] Run `uv sync` in `agent-orchestrator/` to ensure `claude-agent-sdk` is installed
- [x] T003 [P] Run `npm install` in `electron-app/` and verify `npm run build` succeeds
- [x] T004 [P] Run `npm install` in `chrome-extension/` and verify `npm run build` succeeds

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire NATS connection in FastAPI lifespan — required by US1 (health) and US2 (event publishing).

- [x] T005 Wire `nats_service.connect()` on startup and `nats_service.disconnect()` on shutdown in `agent-orchestrator/src/agent_orchestrator/main.py` FastAPI lifespan
- [x] T006 Update health endpoint to return real NATS status from `nats_service.is_connected()` in `agent-orchestrator/src/agent_orchestrator/api/config.py`

**Checkpoint**: AgentManager starts, connects to NATS, `/api/health` reports real NATS status.

---

## Phase 3: User Story 1 - NATS Starts Automatically (Priority: P1) MVP

**Goal**: Electron app reliably starts NATS with port-conflict detection, health checking, orphan cleanup, and graceful shutdown.

**Independent Test**: Launch Electron app → NATS reachable on :4222 within 5s → quit → port released.

### Implementation for User Story 1

- [x] T007 [US1] Add port-availability check before NATS spawn using `net.createServer` probe on port 4222 in `electron-app/src/main/process-manager.ts`
- [x] T008 [US1] Add PID file management: write NATS PID to `~/.vex/nats.pid` after spawn, remove on shutdown, in `electron-app/src/main/process-manager.ts`
- [x] T009 [US1] Add orphan cleanup on startup: read `~/.vex/nats.pid`, check if process alive, kill if stale, in `electron-app/src/main/process-manager.ts`
- [x] T010 [US1] Add TCP health check for NATS: `net.createConnection` to port 4222 with retry (500ms interval, 10 retries) in `electron-app/src/main/process-manager.ts`
- [x] T011 [P] [US1] Add NATS binary existence check: verify `nats-server` on PATH before spawn, emit error with install instructions, in `electron-app/src/main/process-manager.ts`
- [x] T012 [P] [US1] Expose NATS health via IPC: add `get-nats-status` handler in `electron-app/src/main/index.ts` and method in `electron-app/src/main/preload.ts`
- [x] T013 [US1] Update StatusBar to display real NATS health from IPC in `electron-app/src/renderer/components/StatusBar.tsx`

**Checkpoint**: Electron launches → NATS starts with health verification → StatusBar green → quit cleans up.

---

## Phase 4: User Story 2 - Real Claude Agent SDK Integration (Priority: P1)

**Goal**: Replace stub `ClaudeCodeSDKAdapter` with real `ClaudeSDKClient` integration — real agent sessions, streaming output, NATS progress events.

**Independent Test**: Start AgentManager → register SDK agent → submit task → verify real Claude output (not stubs).

### Implementation for User Story 2

- [x] T014 [US2] Rewrite `start()`: create `ClaudeSDKClient` with `ClaudeAgentOptions` (system_prompt, model, permission_mode, allowed_tools), store as `SDKAgentSession` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T015 [P] [US2] Build prompt formatter: convert task dict (project context + batch actions) into structured system prompt in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T016 [US2] Rewrite `send_task()`: call `client.query(prompt)`, iterate `client.receive_response()`, publish progress to NATS `vex.task.{task_id}.progress` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T017 [US2] Rewrite `get_status()`: return real session status from `SDKAgentSession` tracking in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T018 [P] [US2] Rewrite `subscribe_logs()`: yield real messages (TextBlock, ToolUseBlock, ResultMessage) from SDK response stream in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T019 [P] [US2] Rewrite `stop()`: close `ClaudeSDKClient` async context, clean up session state in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T020 [US2] Add error handling: catch auth errors, timeouts, SDK unavailability; set status to error with actionable messages in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T021 [US2] Publish task completion to NATS `vex.task.{task_id}.complete` with result, cost, duration from `ResultMessage` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`

**Checkpoint**: AgentManager running → register SDK agent → submit task → real Claude response streamed via NATS → result in DB.

---

## Phase 5: User Story 3 - Screenshot in Select Dialog (Priority: P2)

**Goal**: PopupDialog in select mode displays a screenshot thumbnail of the selected element.

**Independent Test**: Select mode → click element → popup shows screenshot thumbnail within 1s.

### Implementation for User Story 3

- [x] T022 [US3] Trigger `captureScreenshot()` on element click in select mode (before dialog opens) and pass result to PopupDialog in `chrome-extension/src/content/App.tsx`
- [x] T023 [US3] Add screenshot thumbnail display to PopupDialog: render `<img>` with base64 src between header and editor, with loading placeholder while capture is pending, in `chrome-extension/src/content/components/PopupDialog.tsx`
- [x] T024 [US3] Add CSS for screenshot thumbnail: max 140px height, full width, rounded corners, loading skeleton animation in `chrome-extension/src/content/styles/content.css`

**Checkpoint**: Select mode → click element → popup shows screenshot with highlighted element.

---

## Phase 6: User Story 4 - Resize Mode Hover Borders (Priority: P2)

**Goal**: Elements show visible hover borders when developer hovers in resize mode.

**Independent Test**: Resize mode → hover over elements → each gets a visible border.

### Implementation for User Story 4

- [x] T025 [US4] Integrate `useHoverHighlight` hook into ResizeMode: activate when no element is selected (`selectedElement === null`), suppress when handles are visible, in `chrome-extension/src/content/components/ResizeMode.tsx`
- [x] T026 [US4] Render hover highlight overlay (border + label) in ResizeMode's render output, reusing `.cs-highlight` CSS class, in `chrome-extension/src/content/components/ResizeMode.tsx`

**Checkpoint**: Resize mode → hover shows border → click element → hover suppressed → resize handles visible.

---

## Phase 7: User Story 5 - Style Editor Improvements (Priority: P2)

**Goal**: Style editor becomes draggable, shows selection border on styled element, and integrates copy-style functionality.

**Independent Test**: Style mode → click element → panel draggable by header → element has border → "Copy Style" button works.

### Implementation for User Story 5

- [x] T027 [US5] Add drag behavior to StylePanel header: `onPointerDown`/`onPointerMove`/`onPointerUp` handlers, track `isDragging`/`dragOffset` state, update `left`/`top` position clamped to viewport, in `chrome-extension/src/content/components/StylePanel.tsx`
- [x] T028 [US5] Add selection border overlay for the styled element: render a highlight div (similar to `.cs-selected`) when style panel is open, in `chrome-extension/src/content/components/StylePanel.tsx`
- [x] T029 [US5] Extract copy-style logic from `CopyStyle.tsx` into a reusable hook or function that can be invoked from StylePanel in `chrome-extension/src/content/components/CopyStyle.tsx`
- [x] T030 [US5] Add "Copy Style" button to StylePanel header: clicking it triggers the extracted copy-style flow (two-phase: pick source, pick target), in `chrome-extension/src/content/components/StylePanel.tsx`
- [x] T031 [US5] Remove standalone `copyStyle` mode from mode enum and toolbar buttons in `chrome-extension/src/content/App.tsx` and `chrome-extension/src/content/components/Toolbar.tsx`
- [x] T032 [US5] Add CSS for drag cursor, selection border in style mode, and copy-style button styling in `chrome-extension/src/content/styles/content.css`

**Checkpoint**: Style mode → click element → border visible → drag panel → use Copy Style button → standalone mode gone.

---

## Phase 8: User Story 6 - Action List on Page Toolbar (Priority: P3)

**Goal**: Action list relocated from popup to on-page toolbar with expandable chevron panel.

**Independent Test**: Record actions → click chevron on toolbar → panel shows all actions → popup no longer has action list.

### Implementation for User Story 6

- [x] T033 [US6] Add chevron toggle button to Toolbar component with expand/collapse state in `chrome-extension/src/content/components/Toolbar.tsx`
- [x] T034 [US6] Create ActionPanel component: expandable panel below toolbar showing action list with type badges, truncated selectors, instructions, inline edit, and remove button, in `chrome-extension/src/content/components/ActionPanel.tsx`
- [x] T035 [US6] Connect ActionPanel to `useActions` hook: display current actions, handle instruction edits and action removal, in `chrome-extension/src/content/components/ActionPanel.tsx`
- [x] T036 [US6] Integrate ActionPanel into Toolbar: render below toolbar when expanded, ensure dragging works in expanded state, in `chrome-extension/src/content/components/Toolbar.tsx`
- [x] T037 [US6] Remove ActionList component from popup: delete or gut `chrome-extension/src/popup/components/ActionList.tsx` and remove its import/render from `chrome-extension/src/popup/App.tsx`
- [x] T038 [US6] Add CSS for action panel: panel dimensions, action item layout, chevron rotation animation, empty state, in `chrome-extension/src/content/styles/content.css`

**Checkpoint**: Toolbar has chevron → expand shows actions → inline edit works → popup has no action list.

---

## Phase 9: User Story 7 - End-to-End Full Run (Priority: P3)

**Goal**: Validate complete flow: Chrome extension → NATS → AgentManager → Claude Agent SDK → code change back to UI.

**Independent Test**: Full cycle: visual edit → submit batch → real code change proposal in Vex UI.

### Implementation for User Story 7

- [ ] T039 [US7] Verify batch-to-task pipeline: trace flow from `POST /api/projects/{id}/batches` through task creation and SDK adapter dispatch in `agent-orchestrator/src/agent_orchestrator/api/batches.py` and `agent-orchestrator/src/agent_orchestrator/api/tasks.py`
- [ ] T040 [US7] Wire task result display in AgentPanel: show real agent output (code changes, status, cost) in `electron-app/src/renderer/components/AgentPanel.tsx`
- [ ] T041 [US7] Add task result polling via IPC: fetch completed task results via `GET /api/tasks/{id}` and forward to renderer in `electron-app/src/main/index.ts`

**Checkpoint**: End-to-end: visual edit → batch → agent → real code change proposal in UI.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases and robustness across all stories.

- [ ] T042 [P] Add NATS crash detection and auto-restart UI notification in `electron-app/src/main/process-manager.ts`
- [ ] T043 [P] Add configurable agent task timeout (default 30s) with cancellation in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [ ] T044 [P] Handle concurrent batch submission: reject or queue if agent busy in `agent-orchestrator/src/agent_orchestrator/api/tasks.py`
- [ ] T045 [P] Constrain style panel drag to viewport bounds (prevent off-screen) in `chrome-extension/src/content/components/StylePanel.tsx`
- [ ] T046 [P] Add empty state for action panel when no actions recorded in `chrome-extension/src/content/components/ActionPanel.tsx`
- [ ] T047 Run quickstart.md validation end-to-end on clean environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T002 (agent-orchestrator deps)
- **US1 (Phase 3)**: Depends on T003 (electron build). Independent of Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2 (T005/T006 for NATS lifespan wiring)
- **US3-US6 (Phases 5-8)**: Depend on T004 (extension build). Independent of US1/US2.
- **US7 (Phase 9)**: Depends on US1 + US2 complete
- **Polish (Phase 10)**: Can start after US1 + US2; can overlap with US3-US7

### User Story Independence

- **US1 (NATS)**: Electron only — no dependency on other stories
- **US2 (SDK)**: Python only — depends on Phase 2 foundational, no dependency on US1
- **US3 (Screenshot)**: Extension only — independent of all other stories
- **US4 (Resize hover)**: Extension only — independent of all other stories
- **US5 (Style editor)**: Extension only — independent of US3/US4/US6
- **US6 (Action panel)**: Extension only — independent of US3/US4/US5
- **US7 (E2E)**: Integration — depends on US1 + US2

### Two Independent Workstreams

```
Workstream A (Backend/Electron):  Setup → Foundational → US1 ∥ US2 → US7
Workstream B (Chrome Extension):  Setup → US3 ∥ US4 ∥ US5 ∥ US6
```

US3, US4, US5, US6 can ALL run in parallel (different files, different components).

### Within Each User Story

- US1: T007→T008→T009→T010 (sequential chain); T011, T012 parallel after T007; T013 after T012
- US2: T014 first; T015 parallel with T014; T016 after T014; T017/T018/T019 parallel after T014; T020/T021 after T016
- US3: T022→T023→T024 (sequential)
- US4: T025→T026 (sequential)
- US5: T027, T028 parallel; T029→T030 sequential; T031 after T030; T032 parallel with T031
- US6: T033→T034→T035→T036 (sequential); T037 parallel with T033; T038 parallel with T034

---

## Parallel Examples

### Workstream A: Backend

```bash
# After Phase 2 complete, US1 and US2 can run in parallel:
# US1 (Electron):
Task: "T007 [US1] Port-availability check in process-manager.ts"
# US2 (Python):
Task: "T014 [US2] Rewrite start() in claude_code_sdk.py"
Task: "T015 [P] [US2] Build prompt formatter in claude_code_sdk.py"
```

### Workstream B: Extension (all 4 stories in parallel)

```bash
# US3:
Task: "T022 [US3] Trigger captureScreenshot in App.tsx"
# US4:
Task: "T025 [US4] Integrate useHoverHighlight in ResizeMode.tsx"
# US5:
Task: "T027 [US5] Add drag behavior to StylePanel.tsx"
Task: "T028 [P] [US5] Add selection border in StylePanel.tsx"
# US6:
Task: "T033 [US6] Add chevron to Toolbar.tsx"
Task: "T037 [P] [US6] Remove ActionList from popup"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1: Setup
2. Phase 2: Foundational (NATS lifespan)
3. Phase 3: US1 — NATS starts reliably
4. Phase 4: US2 — Real SDK adapter
5. **STOP and VALIDATE**: Both P1 stories independently

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 → NATS reliable → Validate
3. US2 → Real agent → Validate
4. US3-US6 → Extension fixes (can be done in any order) → Validate each
5. US7 → End-to-end → Demo-ready
6. Polish → Edge cases → Production-ready

### Parallel Team Strategy

```
Developer A: US1 (Electron) → US7 (E2E)
Developer B: US2 (Python/SDK)
Developer C: US3 + US4 (Extension: screenshot + resize)
Developer D: US5 + US6 (Extension: style editor + action panel)
```

---

## Notes

- US3-US6 touch different extension component files — safe to parallelize
- US5 (style editor) touches StylePanel.tsx + CopyStyle.tsx + App.tsx + Toolbar.tsx — most complex extension story
- US6 creates a new file (ActionPanel.tsx) — no conflicts with other stories
- The 30s generation timeout from the constitution applies to agent tasks (T043)
- Standalone copyStyle mode removal (T031) must coordinate with App.tsx mode enum
