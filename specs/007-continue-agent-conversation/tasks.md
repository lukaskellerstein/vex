# Tasks: Continue Conversation with Finished Agent

**Input**: Design documents from `/specs/007-continue-agent-conversation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project scaffolding needed — all target files already exist. Skip.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend infrastructure shared by all user stories. The `resume()` adapter method, `continue_agent()` orchestration, API endpoint, and multi-trace retrieval are prerequisites for any UI surface.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add `ContinueRequest` model with `message: str` (min_length=1) in `agent-orchestrator/src/agent_orchestrator/models/agent.py`
- [x] T002 Add abstract `resume()` method to `AgentAdapter` base class in `agent-orchestrator/src/agent_orchestrator/adapters/base.py` — signature: `async def resume(agent_id: str, project_id: str, project_path: str, message: str, session_id: str) -> None`
- [x] T003 Set `session.session_id = f"vex-{agent_id}"` in `start()` method (~line 160) and pass `session_id` to `client.query()` in `send_task()` (~line 250) in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`
- [x] T004 Extract the message streaming loop (lines ~269-726) from `send_task()` into a shared `_stream_response(session, task_id)` method in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — both `send_task()` and `resume()` will call it
- [x] T005 Implement `resume()` on `ClaudeCodeSDKAdapter` in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — reconstruct `ClaudeAgentOptions` from profile (same as `start()`), create new `ClaudeSDKClient` + `SDKAgentSession` with given `session_id`, enter context, call `query(message, session_id=session_id)`, stream via `_stream_response()`
- [x] T006 Add `continue_agent(agent_id: str, message: str)` function in `agent-orchestrator/src/agent_orchestrator/services/batch_processor.py` — look up agent→project from DB, derive `session_id = f"vex-{agent_id}"`, create task row (type=`"continue"`, prompt=message), call `_agent_manager.start_agent()`, call `adapter.resume()`, call `_persist_trace()`, finally call `_agent_manager.stop_agent()`
- [x] T007 Add `POST /api/agents/{agent_id}/continue` endpoint in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — validate agent exists, reject if status is `running` (409), accept if terminal (`completed`/`failed`/`stopped`), spawn `asyncio.create_task(continue_agent(...))`, return `{"status": "resuming", "agent_id": agent_id}`
- [x] T008 Modify `get_agent_trace()` in `agent-orchestrator/src/agent_orchestrator/api/agents.py` to return all traces for the agent ordered by `created_at ASC` — response shape changes to `{"agent_id": ..., "traces": [...]}`; each trace includes its steps and associated task prompt

**Checkpoint**: Backend fully supports continue + multi-trace. Verify with curl:
```
POST /api/agents/{id}/continue → 200 for terminal, 409 for running
GET /api/agents/{id}/trace → returns traces array
```

---

## Phase 3: User Story 1 — Continue Agent from Electron UI (Priority: P1) MVP

**Goal**: Users can send follow-up messages to completed/failed agents from the Electron trace view, with full multi-turn conversation display.

**Independent Test**: Complete an agent run, send a follow-up from the trace view, verify agent resumes with context and all turns display with aggregated metrics.

### Implementation for User Story 1

- [x] T009 [P] [US1] Add `continueAgent` IPC method in `electron-app/src/main/preload.ts` — `continueAgent: (agentId: string, message: string) => ipcRenderer.invoke("continue-agent", agentId, message)`
- [x] T010 [P] [US1] Add `continueAgent` type declaration in `electron-app/src/renderer/electron.d.ts` — `continueAgent: (agentId: string, message: string) => Promise<any>`
- [x] T011 [US1] Add `continue-agent` IPC handler in `electron-app/src/main/index.ts` — `ipcMain.handle("continue-agent", async (_event, agentId, message) => apiPost(\`/api/agents/${agentId}/continue\`, { message }))`
- [x] T012 [US1] Update `fetchPersistedTrace()` in `electron-app/src/renderer/pages/AgentTrace.tsx` to handle new multi-trace response shape `{ agent_id, traces: [...] }` — concatenate steps across traces with turn separators, compute aggregated metrics (sum cost, tokens, duration across traces)
- [x] T013 [US1] Add follow-up input bar UI to `electron-app/src/renderer/pages/AgentTrace.tsx` — fixed-bottom textarea + Send button, visible when `displayStatus` is terminal (`completed`/`failed`/`stopped`), Catppuccin Mocha themed, disabled while sending
- [x] T014 [US1] Implement `handleContinue()` in `electron-app/src/renderer/pages/AgentTrace.tsx` — calls `window.electronAPI.continueAgent(agentId, message)`, clears input, resets to live mode (`setTrace(null)`, `setLiveSteps([])`, `setAgentStatus("running")`), re-subscribes to NATS (existing subscription logic works since same agentId)
- [x] T015 [US1] Add visual turn separators in the trace step list in `electron-app/src/renderer/pages/AgentTrace.tsx` — when rendering multi-trace data, insert a separator element between turns showing turn number and per-turn metrics

**Checkpoint**: Electron UI fully supports continue conversations. Test: complete agent → type follow-up → agent resumes → all turns visible.

---

## Phase 4: User Story 2 — Continue Agent from Chrome Extension (Priority: P2)

**Goal**: Users can send follow-up messages to agents directly from the cursor completion notification on the page, without switching to Electron.

**Independent Test**: Complete an agent on a page, click reply on cursor, send follow-up, verify cursor transitions back to running and agent resumes.

### Implementation for User Story 2

- [x] T016 [US2] Modify completion notification in `chrome-extension/src/content/components/AgentCursors.tsx` — when agent completes/fails, show a notification badge on the cursor with status icon, agent name, and a reply/chat button (instead of immediately starting fade-out)
- [x] T017 [US2] Add floating input panel component in `chrome-extension/src/content/components/AgentCursors.tsx` — textarea + Send button + dismiss button, anchored near cursor position, Catppuccin Mocha themed, appears when reply button is clicked
- [x] T018 [US2] Implement continue HTTP call in `chrome-extension/src/content/components/AgentCursors.tsx` — on Send: `fetch(\`http://localhost:8420/api/agents/${agentId}/continue\`, { method: "POST", body: JSON.stringify({ message }) })`, handle success/error
- [x] T019 [US2] Update `completedAgentIdsRef` resurrection logic in `chrome-extension/src/content/components/AgentCursors.tsx` — when user sends a continue message, remove `agentId` from `completedAgentIdsRef` so the agent can transition back to "running" state with animated cursor
- [x] T020 [US2] Handle dismiss without reply in `chrome-extension/src/content/components/AgentCursors.tsx` — clicking dismiss button proceeds with normal fade-out (existing behavior), closing the floating panel without sending

**Checkpoint**: Chrome Extension supports cursor-anchored continue. Test: agent completes → reply button on cursor → type and send → cursor resumes running animation.

---

## Phase 5: User Story 3 — Persistent Agent Status Panel (Priority: P3)

**Goal**: A floating panel in the bottom-right corner shows all agents on the page with their status, providing "Continue" access even if cursor notifications were dismissed.

**Independent Test**: Complete multiple agents, dismiss cursor notifications, use status panel to continue any agent.

### Implementation for User Story 3

- [x] T021 [US3] Create `AgentStatusPanel` component in `chrome-extension/src/content/components/AgentStatusPanel.tsx` — small floating panel (bottom-right), lists agents with status (running/completed/failed), "Continue" button per terminal agent, auto-hides when no relevant agents exist
- [x] T022 [US3] Integrate `AgentStatusPanel` with `AgentCursors` state in `chrome-extension/src/content/components/AgentCursors.tsx` — pass current agents list and status to the panel, share the continue/input panel logic from US2
- [x] T023 [US3] Add CSS styles for `AgentStatusPanel` in `chrome-extension/src/content/styles/content.css` — floating panel positioning, agent list styling, status badges, Catppuccin Mocha colors, smooth show/hide transitions

**Checkpoint**: Status panel provides fallback continue access. Test: dismiss cursor notifications → use panel to continue any completed agent.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and cross-story refinements.

- [x] T024 [P] Add error handling for unreachable backend in both Electron input bar (`electron-app/src/renderer/pages/AgentTrace.tsx`) and Chrome Extension input panel (`chrome-extension/src/content/components/AgentCursors.tsx`) — show error message, allow retry
- [x] T025 [P] Handle corrupted/missing SDK session files gracefully in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` `resume()` — if session file doesn't exist, agent starts fresh conversation without crashing
- [x] T026 Run quickstart.md validation — execute all verification steps from `specs/007-continue-agent-conversation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately. T001-T002 parallel, then T003→T004→T005 sequential (refactor before resume), T006 after T005, T007-T008 after T006.
- **US1 (Phase 3)**: Depends on Phase 2 completion. T009-T010 parallel, T011 after T009, T012-T015 sequential.
- **US2 (Phase 4)**: Depends on Phase 2 completion. Can run parallel with US1. T016→T017→T018→T019→T020 sequential.
- **US3 (Phase 5)**: Depends on Phase 4 (reuses US2's continue/input panel logic). T021→T022→T023 sequential.
- **Polish (Phase 6)**: Depends on all user stories. T024-T025 parallel.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — fully independent MVP
- **US2 (P2)**: Depends only on Foundational — independent of US1
- **US3 (P3)**: Depends on US2 (shares continue input panel logic)

### Within Phase 2 (Foundational)

```
T001 ─┐
T002 ─┤ (parallel: different files)
      ↓
T003 → T004 → T005 (sequential: same file, refactor then implement)
              ↓
           T006 (depends on adapter resume)
              ↓
        T007 ─┐
        T008 ─┘ (parallel: different functions in same file, but independent)
```

### Parallel Opportunities

- T001 + T002: Different files (models vs adapter base)
- T009 + T010: Different files (preload.ts vs electron.d.ts)
- T024 + T025: Different components (Electron UI vs adapter)
- US1 + US2: Can run in parallel after Phase 2 (different codebases)

---

## Parallel Example: User Story 1

```
# Launch IPC bridge tasks in parallel:
Task T009: "Add continueAgent IPC method in preload.ts"
Task T010: "Add continueAgent type declaration in electron.d.ts"

# Then sequential UI work:
Task T011: "Add continue-agent IPC handler in index.ts"
Task T012: "Update fetchPersistedTrace for multi-trace"
Task T013: "Add follow-up input bar UI"
Task T014: "Implement handleContinue()"
Task T015: "Add visual turn separators"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T008)
2. Complete Phase 3: User Story 1 (T009-T015)
3. **STOP and VALIDATE**: Test continue from Electron trace view
4. Deploy/demo if ready — full backend + primary UI surface

### Incremental Delivery

1. Foundational → Backend ready
2. Add US1 → Test independently → Deploy (MVP!)
3. Add US2 → Test independently → Deploy (Chrome Extension cursor continue)
4. Add US3 → Test independently → Deploy (Status panel fallback)
5. Polish → Edge cases and error handling

---

## Notes

- No DB schema changes required — existing tables support multi-trace per agent
- Breaking change on `GET /agents/{id}/trace` response shape — coordinate T008 (backend) with T012 (Electron UI)
- `session_id` field already exists on `SDKAgentSession` (line 96) but is unused — T003 populates it
- Chrome Extension calls AO directly via `fetch()` — no IPC bridge needed (unlike Electron)
- `completedAgentIdsRef` in AgentCursors.tsx prevents resurrection — T019 must modify this for continue flow
