# Tasks: Subagent Drill-Down in Agent Detail Page

**Input**: Design documents from `/specs/009-subagent-drilldown/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup tasks needed — project structure, dependencies, and tooling already exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, Pydantic model, and hook persistence that ALL user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add `subagent_metadata` table to database schema in `agent-orchestrator/src/agent_orchestrator/db/database.py` — fields: id (PK), parent_agent_id (FK → agents.id, indexed), subagent_id, subagent_type, description, transcript_path, started_at, completed_at. Add CASCADE DELETE via foreign key. Add index on subagent_id.
- [x] T002 Add `SubagentMetadata` Pydantic model in `agent-orchestrator/src/agent_orchestrator/models/trace.py` — fields matching the DB table, used by API responses.
- [x] T003 Persist subagent data in SubagentStart hook handler in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — INSERT row with id (uuid), parent_agent_id, subagent_id, subagent_type, started_at. Extract description from hook context if available.
- [x] T004 Persist subagent data in SubagentStop hook handler in `agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py` — UPDATE row matching parent_agent_id + subagent_id, set transcript_path and completed_at.

**Checkpoint**: Subagent metadata is persisted to DB whenever agents spawn subagents. Verify by running an agent and querying the table.

---

## Phase 3: User Story 1 — View Subagent List on Agent Detail Page (Priority: P1) MVP

**Goal**: Users see all subagents listed as clickable chips on the agent detail page.

**Independent Test**: Run an agent that spawns subagents, navigate to agent detail page in Electron, verify subagent chips appear with correct type, description, and status.

### Implementation for User Story 1

- [x] T005 [US1] Add `GET /api/agents/{agent_id}/subagents` endpoint in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — query `subagent_metadata` table filtered by parent_agent_id, return list ordered by started_at ascending. Return 404 if agent not found, empty array if no subagents.
- [x] T006 [US1] Add `getAgentSubagents` IPC method in `electron-app/src/main/preload.ts` — expose `ipcRenderer.invoke("get-agent-subagents", agentId)`.
- [x] T007 [US1] Add `get-agent-subagents` IPC handler in `electron-app/src/main/index.ts` — call `apiGet(\`/api/agents/\${agentId}/subagents\`)` and return result.
- [x] T008 [US1] Add `SubagentMetadata` TypeScript interface and `getAgentSubagents` type declaration in `electron-app/src/renderer/electron.d.ts`.
- [x] T009 [US1] Create `SubagentList` component in `electron-app/src/renderer/components/project-detail/SubagentList.tsx` — horizontal row of clickable chips. Each chip shows subagent type, truncated description, and status indicator (spinner for running, checkmark for completed). Accepts `subagents` array and `onSubagentClick` callback as props.
- [x] T010 [US1] Integrate SubagentList into AgentTrace page in `electron-app/src/renderer/pages/AgentTrace.tsx` — fetch subagents via `getAgentSubagents(agentId)` on mount, render SubagentList between the metrics bar and step list. Hide section when subagent list is empty.

**Checkpoint**: Subagent chips appear on the agent detail page for agents that spawned subagents. Chips show type, description, and completion status. Section is hidden for agents with no subagents.

---

## Phase 4: User Story 2 — Drill Down into Subagent Trace (Priority: P1)

**Goal**: Users click a subagent chip and see its full execution trace in a dedicated view with breadcrumb navigation back to parent.

**Independent Test**: Click a completed subagent chip, verify trace view shows all parsed transcript steps (tool calls, text, etc.) and breadcrumb navigates back to parent agent.

### Implementation for User Story 2

- [x] T011 [P] [US2] Create transcript parser service in `agent-orchestrator/src/agent_orchestrator/services/transcript_parser.py` — read JSONL file, skip `start`/`config` records, map `event` records to TraceStep-compatible dicts (text→text, tool_use→tool_call, tool_result→tool_result, thinking→thinking), map `finish` record to completed step. Skip malformed lines with warning. Return list of step dicts + skipped line count.
- [x] T012 [US2] Add `GET /api/agents/{agent_id}/subagents/{subagent_id}/transcript` endpoint in `agent-orchestrator/src/agent_orchestrator/api/agents.py` — lookup subagent metadata, call transcript parser, return `{subagent: metadata, steps: parsed_steps}`. Return 404 if subagent not found, 422 if transcript file missing/unreadable.
- [x] T013 [US2] Add `getSubagentTranscript` IPC method in `electron-app/src/main/preload.ts` — expose `ipcRenderer.invoke("get-subagent-transcript", agentId, subagentId)`.
- [x] T014 [US2] Add `get-subagent-transcript` IPC handler in `electron-app/src/main/index.ts` — call `apiGet(\`/api/agents/\${agentId}/subagents/\${subagentId}/transcript\`)` and return result.
- [x] T015 [US2] Add `SubagentTranscriptResponse` type and `getSubagentTranscript` type declaration in `electron-app/src/renderer/electron.d.ts`.
- [x] T016 [US2] Add subagent route `/project/:id/agent/:agentId/subagent/:subagentId` in `electron-app/src/renderer/App.tsx` — renders AgentTrace component.
- [x] T017 [US2] Implement subagent mode in `electron-app/src/renderer/pages/AgentTrace.tsx` — detect `subagentId` route param. When present: fetch transcript via `getSubagentTranscript`, display parsed steps using existing step rendering, show breadcrumb with parent agent link, hide follow-up input bar. Handle transcript errors with user-facing message.
- [x] T018 [US2] Wire SubagentList chip click to navigation in `electron-app/src/renderer/pages/AgentTrace.tsx` — `onSubagentClick` navigates to `/project/${projectId}/agent/${agentId}/subagent/${subagent.id}`.

**Checkpoint**: Clicking a subagent chip navigates to a trace view showing all parsed transcript steps. Breadcrumb navigates back. Missing transcripts show an error message. Follow-up bar is hidden.

---

## Phase 5: User Story 3 — Real-Time Subagent Updates (Priority: P2)

**Goal**: Subagent list updates in real-time as subagents are spawned and completed during a running agent.

**Independent Test**: Start an agent that spawns subagents, keep agent detail page open, verify chips appear dynamically and update status on completion without page refresh.

### Implementation for User Story 3

- [x] T019 [US3] Add subagent state management to AgentTrace in `electron-app/src/renderer/pages/AgentTrace.tsx` — maintain `subagents` state array. On `SubagentStart` hook event (received via existing `onAgentHook`), append new subagent entry with running status. On `SubagentStop` hook event, update matching entry with completed status and transcript_path.
- [x] T020 [US3] Update SubagentList component in `electron-app/src/renderer/components/project-detail/SubagentList.tsx` — ensure chips re-render when subagent status changes from running to completed (spinner → checkmark animation).

**Checkpoint**: While viewing a running agent, subagent chips appear in real-time as subagents spawn and update to completed status when they finish.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and cleanup across all stories.

- [x] T021 Handle parent agent deletion cascade for subagent_metadata in `agent-orchestrator/src/agent_orchestrator/db/database.py` — ensure DELETE on agents table cascades to subagent_metadata rows.
- [x] T022 Handle large transcripts gracefully in `agent-orchestrator/src/agent_orchestrator/services/transcript_parser.py` — add a max_steps parameter (default 2000) to prevent unbounded memory usage on very large transcript files.
- [x] T023 Add ruff lint check for new Python files — run `cd agent-orchestrator && uv run ruff check .` and fix any issues in transcript_parser.py and modified files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A — nothing to do
- **Foundational (Phase 2)**: T001 → T002 → T003 → T004 (sequential — each depends on prior)
- **US1 (Phase 3)**: Depends on Phase 2. T005 → T006+T007 (parallel) → T008 → T009 → T010
- **US2 (Phase 4)**: Depends on Phase 2. T011 can run in parallel with US1. T012 depends on T011. T013+T014 (parallel) → T015 → T016 → T017 → T018
- **US3 (Phase 5)**: Depends on US1 (Phase 3) — needs SubagentList component. T019 → T020
- **Polish (Phase 6)**: Depends on all user stories complete. T021, T022, T023 can run in parallel.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — can start immediately after Phase 2
- **US2 (P1)**: Backend (T011-T012) can start in parallel with US1. Frontend (T16-T18) depends on US1's SubagentList and route setup
- **US3 (P2)**: Depends on US1 — extends the SubagentList component with real-time updates

### Within Each User Story

- Backend (API endpoint) before IPC bridge
- IPC bridge before frontend consumption
- Component creation before page integration

### Parallel Opportunities

- T006 + T007 can run in parallel (preload + handler are separate files)
- T011 (transcript parser) can run in parallel with all of US1 (different layer entirely)
- T013 + T014 can run in parallel (preload + handler)
- T021 + T022 + T023 can run in parallel (independent concerns)

---

## Parallel Example: US1 + US2 Backend

```bash
# After Phase 2 completes, launch backend tasks in parallel:
Task: "T005 — GET /subagents endpoint in agents.py"
Task: "T011 — Transcript parser service in transcript_parser.py"
# These touch different files and have no dependency on each other
```

## Parallel Example: IPC Bridge

```bash
# Within each story, preload + handler can be done together:
Task: "T006 — preload.ts method"
Task: "T007 — index.ts handler"
```

---

## Implementation Strategy

### MVP First (US1 + US2 together)

1. Complete Phase 2: Foundational (T001-T004)
2. Complete Phase 3: US1 — subagent list visible (T005-T010)
3. Complete Phase 4: US2 — drill-down works (T011-T018)
4. **STOP and VALIDATE**: Can see subagents and drill into traces
5. This delivers the core value — visibility into subagent execution

### Incremental Delivery

1. Foundation → Subagent data persisted to DB
2. Add US1 → Subagent chips on agent detail page (MVP!)
3. Add US2 → Click to drill into full trace (Core feature complete)
4. Add US3 → Real-time updates during live runs (Polish)
5. Each story adds value without breaking previous stories

---

## Notes

- No test tasks generated (not explicitly requested in spec)
- US1 and US2 are both P1 but US2's frontend depends on US1's components — recommended to implement sequentially
- US2's backend (transcript parser + API) is fully independent and can be built in parallel with US1
- Existing NATS hook infrastructure handles all real-time needs — US3 is purely frontend state management
- Total: 23 tasks across 6 phases
