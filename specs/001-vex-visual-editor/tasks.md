# Tasks: Vex — Visual Web Development Tool

**Input**: Design documents from `/specs/001-vex-visual-editor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Chrome Extension**: `chrome-extension/src/`
- **AgentManager**: `agent-orchestrator/src/agent_orchestrator/`
- **Electron App**: `electron-app/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the two new projects (AgentManager, Electron App) and update the existing Chrome Extension project structure.

- [x] T001 Initialize Python project with pyproject.toml, uv configuration in `agent-orchestrator/pyproject.toml`
- [x] T002 [P] Create AgentManager package structure with `__init__.py` files in `agent-orchestrator/src/agent_orchestrator/`
- [x] T003 [P] Initialize Electron app with package.json and TypeScript config in `electron-app/package.json`
- [x] T004 [P] Define all 12 action types and shared interfaces in `chrome-extension/src/shared/types.ts` (expand existing Selection type to full Action union type)
- [x] T005 [P] Update Chrome Extension message protocol types in `chrome-extension/src/shared/messages.ts` (replace bridge URL localhost:3456 with AgentManager URL localhost:8420, add mode switching messages)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement SQLite database schema and async connection management in `agent-orchestrator/src/agent_orchestrator/db/database.py` (tables: projects, agents, batches, actions, tasks, config)
- [x] T007 [P] Create Project model with auto-detection fields in `agent-orchestrator/src/agent_orchestrator/models/project.py`
- [x] T008 [P] Create Agent model with health tracking fields in `agent-orchestrator/src/agent_orchestrator/models/agent.py`
- [x] T009 [P] Create Batch and Action models in `agent-orchestrator/src/agent_orchestrator/models/batch.py`
- [x] T010 [P] Create Task model with state machine in `agent-orchestrator/src/agent_orchestrator/models/task.py`
- [x] T011 Create FastAPI app entry point with CORS, lifespan events, and router registration in `agent-orchestrator/src/agent_orchestrator/main.py`
- [x] T012 [P] Implement health endpoint (GET /api/health) in `agent-orchestrator/src/agent_orchestrator/api/config.py`
- [x] T013 [P] Implement NATS pub/sub service (connect, publish, subscribe, disconnect) in `agent-orchestrator/src/agent_orchestrator/services/nats_service.py`
- [x] T014 Implement screenshot file storage service (save base64 to `~/.vex/data/{projectId}/`, return file path) in `agent-orchestrator/src/agent_orchestrator/services/screenshot_store.py`
- [x] T015 Create AgentAdapter abstract base class with start/stop/send_task/get_status/subscribe_logs in `agent-orchestrator/src/agent_orchestrator/adapters/base.py`
- [x] T016 Implement multi-action recording hook (useActions) that replaces useSelectionState, supports all 12 action types, and maintains chronological order in `chrome-extension/src/content/hooks/useActions.ts`
- [x] T017 [P] Implement mode switching in content script App.tsx — add mode state (select/edit/resize/style/copyStyle/visibility), keyboard shortcuts 1-6, and render mode-specific components in `chrome-extension/src/content/App.tsx`
- [x] T018 Build floating toolbar component with six mode buttons, active highlight, action count badge, and Send button in `chrome-extension/src/content/components/Toolbar.tsx`

**Checkpoint**: Foundation ready — AgentManager runs with health endpoint, Chrome Extension has mode switching and multi-action recording, database schema in place.

---

## Phase 3: User Story 1 — Select and Annotate Elements for Code Changes (Priority: P1) MVP

**Goal**: Developer selects elements, types instructions, sends batch to AgentManager, agent processes it.

**Independent Test**: Load extension on any website → select elements → type instructions → send batch → verify batch appears in AgentManager via GET /api/projects/{id}/batches/latest.

### Implementation for User Story 1

- [x] T019 [US1] Implement project CRUD API endpoints (GET/POST/PATCH/DELETE /api/projects, GET /api/projects/{id}) in `agent-orchestrator/src/agent_orchestrator/api/projects.py`
- [x] T020 [P] [US1] Implement project auto-detection service (framework, dev command, package manager, styling, port from filesystem heuristics) in `agent-orchestrator/src/agent_orchestrator/services/project_detector.py`
- [x] T021 [US1] Implement batch submission endpoint (POST /api/projects/{id}/batches) — parse actions, extract and store screenshots as files, persist batch and actions in `agent-orchestrator/src/agent_orchestrator/api/batches.py`
- [x] T022 [P] [US1] Implement batch retrieval endpoints (GET /api/projects/{id}/batches, GET /api/projects/{id}/batches/{batchId}, GET /api/projects/{id}/batches/latest, DELETE) in `agent-orchestrator/src/agent_orchestrator/api/batches.py`
- [x] T023 [US1] Refactor Select Mode to use the new useActions hook — capture element metadata, screenshot, and instruction as a "select" action type in `chrome-extension/src/content/App.tsx` and `chrome-extension/src/content/components/Overlay.tsx`
- [x] T024 [US1] Update popup to show connection status to AgentManager (replace BridgeStatus with ConnectionStatus pinging /api/health), project selector dropdown (fetches /api/projects), and action list (replacing SelectionList) in `chrome-extension/src/popup/App.tsx` and `chrome-extension/src/popup/components/`
- [x] T025 [US1] Implement batch submission from popup — collect all actions, build batch object with pageUrl/pageTitle/timestamp, POST to /api/projects/{id}/batches, show send status in `chrome-extension/src/popup/components/Controls.tsx`
- [x] T026 [US1] Implement agent registration endpoints (GET/POST/DELETE /api/agents, POST /api/agents/{id}/heartbeat) in `agent-orchestrator/src/agent_orchestrator/api/agents.py`
- [x] T027 [US1] Implement agent lifecycle management service (start, stop, health monitoring, heartbeat timeout detection, auto-restart) in `agent-orchestrator/src/agent_orchestrator/services/agent_manager.py`
- [x] T028 [US1] Implement Claude Code SDK adapter — spawn agent session, feed batch as structured prompt, subscribe to output stream in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T029 [US1] Implement capability-based task routing service — filter agents by capability, prefer Tier 1, round-robin among same-tier agents in `agent-orchestrator/src/agent_orchestrator/services/task_router.py`

**Checkpoint**: Full select-annotate-send-process loop works. Developer can select elements, write instructions, send batch, and an agent receives and processes it.

---

## Phase 4: User Story 2 — Edit the Live DOM and Send Changes as a Batch (Priority: P1)

**Goal**: Developer edits the live DOM (insert, delete, duplicate, move, edit text, wrap) and each mutation is recorded as a structured action.

**Independent Test**: Switch to Edit Mode → perform DOM edits (add element, edit text, delete, duplicate, move) → verify each action appears in the action list → send batch → verify all edit actions present in batch via API.

### Implementation for User Story 2

- [x] T030 [US2] Implement Edit Mode component with DOM mutation handlers — insert via "+" handles, delete via Delete key, duplicate via Ctrl+D, contenteditable text editing, drag-to-reorder in `chrome-extension/src/content/components/EditMode.tsx`
- [x] T031 [US2] Implement DOM operation helpers — insert element at position, remove element (capture outerHTML), clone element, reorder within parent, wrap element in `chrome-extension/src/content/utils/dom-ops.ts`
- [x] T032 [US2] Implement undo stack hook — push DOM mutations onto stack, Ctrl+Z restores previous state, strip contenteditable artifacts in `chrome-extension/src/content/hooks/useUndo.ts`
- [x] T033 [US2] Implement section generation "+" dividers — detect section/main children and top-level blocks, show large "+" between them, clicking opens generation dialog (prompt textarea, style hint dropdown, Generate button) in `chrome-extension/src/content/components/EditMode.tsx`
- [x] T034 [US2] Implement image replacement popup — three options (upload file picker, URL paste, generate prompt), swap src on result, record replaceImage action in `chrome-extension/src/content/components/EditMode.tsx`

**Checkpoint**: Full DOM editing workflow works. Developer can add, edit, delete, duplicate, move, and wrap elements with all mutations recorded.

---

## Phase 5: User Story 3 — Visually Resize Elements with Semantic Deltas (Priority: P2)

**Goal**: Developer drags resize handles on any element, sees live preview, and gets semantic delta descriptions.

**Independent Test**: Switch to Resize Mode → click element → drag resize handle → verify live resize → verify semantic delta (e.g., "made ~50% wider") → send batch with resize action.

### Implementation for User Story 3

- [x] T035 [US3] Implement Resize Mode component — click to show eight resize handles, colored padding (green) and margin (orange) zone visualizations in `chrome-extension/src/content/components/ResizeMode.tsx`
- [x] T036 [US3] Implement drag-to-resize logic — update element.style live during drag, capture before/after computed styles on release in `chrome-extension/src/content/components/ResizeMode.tsx`
- [x] T037 [US3] Implement semantic delta computation — parse before/after values to numbers, compute ratios, generate descriptions ("made ~50% wider", "doubled", "halved"), round to sensible values, show keep/discard for <5% changes in `chrome-extension/src/content/utils/delta.ts`

**Checkpoint**: Resize mode works end-to-end with visual feedback and semantic descriptions.

---

## Phase 6: User Story 4 — Edit Styles with a Visual Style Panel (Priority: P2)

**Goal**: Developer opens a compact style editor panel and modifies CSS properties with live preview, including hover effects.

**Independent Test**: Switch to Style Mode → click element → style panel appears → change font/color/spacing → verify live updates → add hover effect → verify action recorded with before/after and human-readable descriptions.

### Implementation for User Story 4

- [x] T038 [US4] Implement Style Panel component — compact editor with sections for colors (pickers), typography (font family with page font detection, size, weight, line-height, letter-spacing, text-transform, text-align, text-decoration), spacing (padding/margin four-value inputs with link toggle), borders (width, style, color, radius), visibility (display:none, opacity slider, visibility:hidden) in `chrome-extension/src/content/components/StylePanel.tsx`
- [x] T039 [US4] Implement hover effects section — presets (scale, shadow, lift) + custom hover state controls + transition duration/easing, create temporary :hover rules for preview in `chrome-extension/src/content/components/StylePanel.tsx`
- [x] T040 [US4] Implement live style application — apply changes to element.style immediately, capture before/after screenshots on panel close, record styleChange action with property descriptions and hoverChanges in `chrome-extension/src/content/components/StylePanel.tsx`

**Checkpoint**: Style editing works with live preview, hover effects, and detailed action recording.

---

## Phase 7: User Story 5 — Generate New Sections and Images with AI (Priority: P2)

**Goal**: Developer requests AI-generated sections or images via prompts, results appear live in the page via real-time NATS communication.

**Independent Test**: Click section "+" divider → type prompt → verify generation request sent via NATS → receive result → verify generated HTML injected into page.

### Implementation for User Story 5

- [x] T041 [US5] Implement NATS WebSocket client hook — connect to ws://localhost:4223, subscribe to generation result subjects, publish generation requests, handle disconnect/reconnect with exponential backoff in `chrome-extension/src/content/hooks/useNatsClient.ts`
- [x] T042 [US5] Implement task CRUD endpoints (POST /api/tasks, GET /api/tasks/{id}, GET /api/tasks/pending, POST /api/tasks/{id}/result) in `agent-orchestrator/src/agent_orchestrator/api/tasks.py`
- [x] T043 [US5] Wire generation flow end-to-end — extension publishes to vex.generate.request.{projectId} AND posts to /api/tasks, agent subscribes and generates, publishes result to vex.generate.result.{requestId} AND posts to /api/tasks/{id}/result, extension receives via NATS and injects into DOM in `chrome-extension/src/content/components/EditMode.tsx`
- [x] T044 [US5] Implement generation timeout handling — 30-second timer, show "Agent didn't respond" message with retry and cancel options in `chrome-extension/src/content/components/EditMode.tsx`

**Checkpoint**: AI generation round-trip works for both sections and images with real-time delivery.

---

## Phase 8: User Story 6 — Manage Projects and Agents via Desktop App (Priority: P2)

**Goal**: Developer launches the Electron desktop app, manages projects (add, start/stop dev server), and monitors agents.

**Independent Test**: Launch Electron app → add project folder → verify auto-detection → start dev server → verify status → see connected agent.

### Implementation for User Story 6

- [x] T045 [US6] Implement Electron main process — app lifecycle, BrowserWindow creation, IPC handlers in `electron-app/src/main/index.ts`
- [x] T046 [US6] Implement process manager — spawn nats-server binary (port 4222, WS 4223), spawn AgentManager Python process (port 8420), health check loop, graceful shutdown (SIGTERM → 5s → SIGKILL), auto-restart on crash (max 3) in `electron-app/src/main/process-manager.ts`
- [x] T047 [US6] Implement dev server lifecycle endpoints (POST /api/projects/{id}/start, POST /api/projects/{id}/stop) — spawn dev command as child process, monitor stdout for ready URL regex patterns, stream logs via NATS in `agent-orchestrator/src/agent_orchestrator/api/projects.py`
- [x] T048 [US6] Build React renderer — project list page (status indicators, add project button with folder picker), project detail page (dev server logs, agent status, action history, config), settings page (port config) in `electron-app/src/renderer/`
- [x] T049 [US6] Build agent panel component — show connected agents with name, type, tier, capabilities, status, health, live logs in `electron-app/src/renderer/components/AgentPanel.tsx`

**Checkpoint**: Desktop app launches, manages NATS + AgentManager processes, shows projects and agents.

---

## Phase 9: User Story 7 — Connect External Agents (Priority: P3)

**Goal**: External agents (Claude Code plugin, Cursor via MCP, or any agent via REST) can pull batches and post results.

**Independent Test**: Register an external agent via POST /api/agents → submit batch from extension → retrieve batch via GET /api/projects/{id}/batches/latest → post result via POST /api/tasks/{id}/result → verify task status updates.

### Implementation for User Story 7

- [x] T050 [US7] Implement CLI wrapper adapter — construct prompt string from batch, spawn CLI process with configurable command/flags, capture stdout/stderr, stream to NATS, detect completion via exit code in `agent-orchestrator/src/agent_orchestrator/adapters/cli_wrapper.py`
- [x] T051 [US7] Implement MCP server wrapper — expose vex_get_pending_batch, vex_get_task, vex_submit_result, vex_get_project_context, vex_register_agent, vex_heartbeat as MCP tools wrapping the REST API in `agent-orchestrator/src/agent_orchestrator/mcp_server.py`
- [x] T052 [US7] Implement global config endpoints (GET/PATCH /api/config) for port configuration and agent defaults in `agent-orchestrator/src/agent_orchestrator/api/config.py`

**Checkpoint**: All three external integration methods work — agents can pull work and post results.

---

## Phase 10: User Story 8 — Copy Styles Between Elements (Priority: P3)

**Goal**: Developer copies visual styles from one element to another with modifier key support for text-only or box-only copying.

**Independent Test**: Switch to Copy Style mode → click source element → click target → verify target receives source styles → verify Shift copies text only → verify Alt copies box only → send batch with copyStyle action.

### Implementation for User Story 8

- [x] T053 [US8] Implement Copy Style component — click source (highlight), click target (apply styles), Shift = text styles only (font*, color, textAlign, etc.), Alt = box styles only (padding, margin, border, etc.), record copyStyle action with copiedProperties map in `chrome-extension/src/content/components/CopyStyle.tsx`

**Checkpoint**: Style copying works with modifier key variants.

---

## Phase 11: User Story 9 — Visibility Helpers (Priority: P3)

**Goal**: Developer activates a read-only diagnostic overlay showing element outlines, margin/padding visualizations, and grid/flex container badges.

**Independent Test**: Switch to Visibility mode → verify element outlines appear → verify margin/padding zones visualized → verify grid/flex badges shown → verify read-only (no actions recorded).

### Implementation for User Story 9

- [x] T054 [US9] Implement Visibility Helper component — diagnostic overlay with element outlines, color-coded margin (orange) and padding (green) zones for all elements, grid/flex container badges, read-only (no action recording) in `chrome-extension/src/content/components/VisibilityHelper.tsx`

**Checkpoint**: Diagnostic overlay works as a read-only inspection tool.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T055 [P] Add CSS selector robustness — ensure selector.ts handles edge cases (dynamically generated classes, shadow DOM boundaries, SVG elements) in `chrome-extension/src/content/utils/selector.ts`
- [x] T056 [P] Implement NATS disconnect fallback in extension — detect WS disconnect, fall back to REST polling for generation results, auto-reconnect in `chrome-extension/src/content/hooks/useNatsClient.ts`
- [x] T057 [P] Add project auto-match in extension — match current tab URL to project dev server URLs, auto-select project or prompt if ambiguous in `chrome-extension/src/popup/App.tsx`
- [ ] T058 Bundle nats-server binary with Electron app — download platform-specific binary at build time, include in app resources in `electron-app/package.json` and `electron-app/scripts/`
- [x] T059 Implement batch size progress indicator — show upload progress for large batches (10-20MB) in `chrome-extension/src/popup/components/Controls.tsx`
- [x] T060 Code cleanup — remove old bridge server references (localhost:3456), remove unused SelectionList/BridgeStatus components, update all imports in `chrome-extension/src/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — **MVP target**
- **US2 (Phase 4)**: Depends on Foundational + US1 (shares action recording, batch submission)
- **US3 (Phase 5)**: Depends on Foundational only (independent resize mode)
- **US4 (Phase 6)**: Depends on Foundational only (independent style mode)
- **US5 (Phase 7)**: Depends on Foundational + US1 (needs AgentManager endpoints, NATS)
- **US6 (Phase 8)**: Depends on Foundational + US1 (needs AgentManager running)
- **US7 (Phase 9)**: Depends on US1 (needs agent/batch API endpoints)
- **US8 (Phase 10)**: Depends on Foundational only (independent mode)
- **US9 (Phase 11)**: Depends on Foundational only (independent mode)
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Start after Foundational — no other story dependencies — **MVP**
- **US2 (P1)**: Start after US1 (shares batch submission infrastructure)
- **US3 (P2)**: Start after Foundational — independent of other stories
- **US4 (P2)**: Start after Foundational — independent of other stories
- **US5 (P2)**: Start after US1 (needs NATS + task endpoints)
- **US6 (P2)**: Start after US1 (needs AgentManager to be functional)
- **US7 (P3)**: Start after US1 (needs agent + batch API)
- **US8 (P3)**: Start after Foundational — independent
- **US9 (P3)**: Start after Foundational — independent

### Within Each User Story

- Models before services
- Services before API endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T002, T003, T004, T005 can run in parallel
- Foundational: T007-T010 (models) can run in parallel, T012-T013 in parallel, T17-T18 in parallel
- After Foundational: US3, US4, US8, US9 can start in parallel (all independent extension modes)
- After US1: US2, US5, US6, US7 can start (all depend on US1 infrastructure)

---

## Parallel Example: Foundational Phase

```text
# Launch all models in parallel:
Task: "Create Project model in agent-orchestrator/src/agent_orchestrator/models/project.py"
Task: "Create Agent model in agent-orchestrator/src/agent_orchestrator/models/agent.py"
Task: "Create Batch/Action models in agent-orchestrator/src/agent_orchestrator/models/batch.py"
Task: "Create Task model in agent-orchestrator/src/agent_orchestrator/models/task.py"

# Launch Chrome Extension foundation in parallel:
Task: "Implement mode switching in chrome-extension/src/content/App.tsx"
Task: "Build floating toolbar in chrome-extension/src/content/components/Toolbar.tsx"
```

## Parallel Example: Independent Extension Modes (after Foundational)

```text
# These four modes have zero dependencies on each other:
Task: "Implement Resize Mode in chrome-extension/src/content/components/ResizeMode.tsx"
Task: "Implement Style Panel in chrome-extension/src/content/components/StylePanel.tsx"
Task: "Implement Copy Style in chrome-extension/src/content/components/CopyStyle.tsx"
Task: "Implement Visibility Helper in chrome-extension/src/content/components/VisibilityHelper.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — Select and Annotate
4. **STOP and VALIDATE**: Send a batch from the extension, verify it reaches AgentManager and is processed by an agent
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Select/annotate/send/process loop works → **MVP!**
3. Add US2 → DOM editing works → Core editing complete
4. Add US3, US4 in parallel → Resize + Style modes → Visual editing complete
5. Add US5 → AI generation works → Differentiated feature
6. Add US6 → Desktop app → Standalone product
7. Add US7, US8, US9 → External agents, copy style, visibility → Full feature set
8. Polish → Production ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The Chrome Extension already has partial Select Mode — US1 refactors it to use the new multi-action system rather than building from scratch
