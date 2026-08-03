# Tasks: Electron App UI Overhaul

**Input**: Design documents from `/specs/005-design-ui-overhaul/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story. US1-US3 are P1 (core), US4-US6 are P2 (secondary).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths included

## Path Conventions

- **Frontend**: `electron-app/src/renderer/`, `electron-app/src/main/`
- **Backend**: `agent-orchestrator/src/agent_orchestrator/`

---

## Phase 1: Setup

**Purpose**: Install new dependencies and create shared infrastructure files

- [x] T001 Add react-router-dom and lucide-react dependencies in electron-app/package.json
- [x] T002 Create Catppuccin Mocha CSS theme file with custom properties in electron-app/src/renderer/styles/theme.css
- [x] T003 Import theme.css in electron-app/src/renderer/main.tsx

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend schema changes, new API routers, and IPC bridge extensions that all user stories depend on

### Backend: Schema & Models

- [x] T004 Extend batches table with duration_ms, cost_usd, error_message, agent_id columns in agent-orchestrator/src/agent_orchestrator/db/database.py
- [x] T005 [P] Create activity_events table in agent-orchestrator/src/agent_orchestrator/db/database.py
- [x] T006 [P] Create agent_traces and trace_steps tables in agent-orchestrator/src/agent_orchestrator/db/database.py
- [x] T007 [P] Extend agents table with tasks_completed, tasks_failed, total_cost_usd columns in agent-orchestrator/src/agent_orchestrator/db/database.py
- [x] T008 Update BatchSummary model to include duration_ms, cost_usd, error_message, agent_id in agent-orchestrator/src/agent_orchestrator/models/batch.py
- [x] T009 [P] Update Agent model to include tasks_completed, tasks_failed, total_cost_usd in agent-orchestrator/src/agent_orchestrator/models/agent.py
- [x] T010 [P] Create ActivityEvent model in agent-orchestrator/src/agent_orchestrator/models/activity.py
- [x] T011 [P] Create AgentTrace and TraceStep models in agent-orchestrator/src/agent_orchestrator/models/trace.py

### Backend: API Endpoints

- [x] T012 Create activity endpoints (GET /api/activity, GET /api/activity/stats) in agent-orchestrator/src/agent_orchestrator/api/activity.py
- [x] T013 [P] Create storage endpoints (GET /api/storage/stats, DELETE /api/storage/screenshots) in agent-orchestrator/src/agent_orchestrator/api/storage.py
- [x] T014 [P] Add agent trace endpoint (GET /api/batches/{batch_id}/trace) in agent-orchestrator/src/agent_orchestrator/api/batches.py
- [x] T015 [P] Add agent logs endpoint implementation (GET /api/agents/{agent_id}/logs) in agent-orchestrator/src/agent_orchestrator/api/agents.py
- [x] T016 [P] Extend GET /api/tasks to list all tasks with project_id and status filters in agent-orchestrator/src/agent_orchestrator/api/tasks.py
- [x] T017 Update batch list/detail responses to include new fields in agent-orchestrator/src/agent_orchestrator/api/batches.py
- [x] T018 Update agent list/detail responses to include new fields in agent-orchestrator/src/agent_orchestrator/api/agents.py
- [x] T019 Register new routers (activity, storage) in agent-orchestrator/src/agent_orchestrator/main.py

### Electron Main: IPC Bridge

- [x] T020 Add new IPC methods to preload.ts: deleteProject, getProject, getBatches, getBatch, getAgentTrace, getActivity, getActivityStats, getTasks, getStorageStats, clearScreenshots, getAppInfo in electron-app/src/main/preload.ts
- [x] T021 Add new IPC handlers in main process for all new methods in electron-app/src/main/index.ts
- [x] T022 Add apiDelete helper function in electron-app/src/main/index.ts

### Frontend: Shared UI Components

- [x] T023 [P] Create Tooltip component in electron-app/src/renderer/components/ui/Tooltip.tsx
- [x] T024 [P] Create StatusIndicator component (pulsing dot + label) in electron-app/src/renderer/components/projects/StatusIndicator.tsx
- [x] T025 [P] Create FrameworkBadge component (color-coded framework label) in electron-app/src/renderer/components/projects/FrameworkBadge.tsx

**Checkpoint**: Backend ready, IPC bridge extended, shared components available. User story work can begin.

---

## Phase 3: User Story 1 — Sidebar Navigation & Layout Shell (Priority: P1) 🎯 MVP

**Goal**: Replace top tab bar with collapsible sidebar, set up React Router, redesign status bar

**Independent Test**: Launch app → sidebar visible with 3 nav items → clicking navigates between pages → collapse/expand works → status bar shows NATS status and version

### Implementation for User Story 1

- [x] T026 [US1] Create Sidebar component with collapsible nav (Projects, Activity, Settings) using Lucide icons in electron-app/src/renderer/components/layout/Sidebar.tsx
- [x] T027 [US1] Create AppShell layout component (Sidebar + Outlet + StatusBar) in electron-app/src/renderer/components/layout/AppShell.tsx
- [x] T028 [US1] Rewrite StatusBar to match design (left: project + server status, center: agent task, right: connection + version) in electron-app/src/renderer/components/layout/StatusBar.tsx
- [x] T029 [US1] Rewrite App.tsx with MemoryRouter, route definitions (/, /project/:id, /project/:id/trace/:traceId, /activity, /settings), and AppShell wrapper in electron-app/src/renderer/App.tsx
- [x] T030 [US1] Create placeholder page components for Activity and AgentTrace (minimal content) so routes resolve in electron-app/src/renderer/pages/Activity.tsx and electron-app/src/renderer/pages/AgentTrace.tsx

**Checkpoint**: App launches with sidebar navigation. All routes render placeholder or existing content. Status bar shows real-time data.

---

## Phase 4: User Story 2 — Browse and Manage Projects (Priority: P1)

**Goal**: Redesign project list as grid/list cards with search, view toggle, empty state, quick actions

**Independent Test**: View project list → cards show name/framework/status/path → search filters in real time → grid/list toggle works → empty state appears when no projects → hover reveals quick actions

### Implementation for User Story 2

- [x] T031 [P] [US2] Create ProjectCard component (name, framework badge, status, path, last activity, hover quick actions) in electron-app/src/renderer/components/projects/ProjectCard.tsx
- [x] T032 [P] [US2] Create ProjectListHeader component (search input, view toggle, Add Project button) in electron-app/src/renderer/components/projects/ProjectListHeader.tsx
- [x] T033 [P] [US2] Create ProjectEmptyState component (illustration placeholder, CTA button) in electron-app/src/renderer/components/projects/ProjectEmptyState.tsx
- [x] T034 [US2] Rewrite Projects page with grid/list view, search filtering, empty state, and React Router navigation to project detail in electron-app/src/renderer/pages/Projects.tsx
- [x] T035 [US2] Restyle AddProjectDialog to match Catppuccin Mocha theme in electron-app/src/renderer/components/AddProjectDialog.tsx

**Checkpoint**: Project list displays as themed cards. Search, view toggle, and add project all work. Empty state appears correctly.

---

## Phase 5: User Story 3 — Project Detail with Batches & Dev Server Logs (Priority: P1)

**Goal**: Two-column project detail page with metadata panel, batch list tab, dev server logs tab

**Independent Test**: Click project card → detail page shows header with name/framework/play-stop → left panel shows metadata → Batches tab lists batches with expand → Dev Server Logs tab shows streaming logs with filters

### Implementation for User Story 3

- [x] T036 [P] [US3] Create ProjectInfoPanel component (project identity, dev server info, stats) in electron-app/src/renderer/components/project-detail/ProjectInfoPanel.tsx
- [x] T037 [P] [US3] Create BatchCard component (expandable: status, ID, page, actions, duration, cost, agent trace link) in electron-app/src/renderer/components/project-detail/BatchCard.tsx
- [x] T038 [P] [US3] Create BatchList component (search, status filters, batch cards) in electron-app/src/renderer/components/project-detail/BatchList.tsx
- [x] T039 [P] [US3] Create DevServerLogs component (terminal-like viewer, level filter, search, auto-scroll, color-coded) in electron-app/src/renderer/components/project-detail/DevServerLogs.tsx
- [x] T040 [US3] Rewrite ProjectDetail page with header, two-column layout, tab bar (Batches/Dev Server Logs), and data fetching via IPC in electron-app/src/renderer/pages/ProjectDetail.tsx

**Checkpoint**: Project detail fully functional with real data from backend. Batches expandable. Logs streaming with filters.

---

## Phase 6: User Story 4 — Agent Execution Trace (Priority: P2)

**Goal**: Step-by-step agent trace timeline accessible from batch cards

**Independent Test**: From batch card, click "View agent trace" → trace page shows agent name/model/status/metrics → step timeline renders each type distinctly → long text collapsible

### Implementation for User Story 4

- [x] T041 [P] [US4] Create AgentStepItem component (renders per step type: thinking, tool_call, diff, error, etc.) in electron-app/src/renderer/components/project-detail/AgentStepItem.tsx
- [x] T042 [P] [US4] Create AgentStepList component (vertical timeline of steps with auto-scroll) in electron-app/src/renderer/components/project-detail/AgentStepList.tsx
- [x] T043 [US4] Implement AgentTrace page (header with metrics, breadcrumb, step list, data fetching) in electron-app/src/renderer/pages/AgentTrace.tsx

**Checkpoint**: Agent traces viewable from batch cards. All step types render correctly.

---

## Phase 7: User Story 5 — Activity Feed (Priority: P2)

**Goal**: Cross-project activity timeline with filtering and aggregate stats

**Independent Test**: Navigate to Activity → timeline shows events grouped by time → filters by project/type/search work → stats bar shows aggregates

### Implementation for User Story 5

- [x] T044 [P] [US5] Create ActivityEntry component (timeline node, project pill, summary, meta tags) in electron-app/src/renderer/components/activity/ActivityEntry.tsx
- [x] T045 [P] [US5] Create ActivityTimeline component (time-grouped vertical timeline) in electron-app/src/renderer/components/activity/ActivityTimeline.tsx
- [x] T046 [P] [US5] Create ActivityFilters component (project dropdown, type dropdown, search, clear) in electron-app/src/renderer/components/activity/ActivityFilters.tsx
- [x] T047 [P] [US5] Create ActivityStats component (horizontal stats bar with metrics) in electron-app/src/renderer/components/activity/ActivityStats.tsx
- [x] T048 [US5] Implement Activity page (header, stats bar, filters, timeline, data fetching) in electron-app/src/renderer/pages/Activity.tsx

**Checkpoint**: Activity page shows real events. Filtering and stats work.

---

## Phase 8: User Story 6 — Application Settings (Priority: P2)

**Goal**: Expand settings to 5-tab layout: General, Ports, Agent Config, Storage, About

**Independent Test**: Navigate to Settings → 5 tabs visible → each tab shows correct content → changes persist on save → About shows version info

### Implementation for User Story 6

- [x] T049 [P] [US6] Create SettingsLayout component (left tab bar + right content area) in electron-app/src/renderer/components/settings/SettingsLayout.tsx
- [x] T050 [P] [US6] Create GeneralSettings component (theme toggle, startup behavior) in electron-app/src/renderer/components/settings/GeneralSettings.tsx
- [x] T051 [P] [US6] Create PortsSettings component (port inputs, conflict check) in electron-app/src/renderer/components/settings/PortsSettings.tsx
- [x] T052 [P] [US6] Create AgentSettings component (API key, concurrency, restart behavior) in electron-app/src/renderer/components/settings/AgentSettings.tsx
- [x] T053 [P] [US6] Create StorageSettings component (paths, usage bar, cleanup actions) in electron-app/src/renderer/components/settings/StorageSettings.tsx
- [x] T054 [P] [US6] Create AboutSettings component (version, build info, resource links) in electron-app/src/renderer/components/settings/AboutSettings.tsx
- [x] T055 [US6] Rewrite Settings page to use SettingsLayout with all 5 tab components in electron-app/src/renderer/pages/Settings.tsx

**Checkpoint**: All settings tabs functional with real config from backend.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements across all pages

- [x] T056 Add CSS animations: sidebar collapse/expand, card hover lift, staggered card entry, pulsing status dots in electron-app/src/renderer/styles/theme.css
- [x] T057 [P] Add empty states for batch list, activity feed, and agent traces in respective components
- [x] T058 [P] Add error/disconnected states for all backend-dependent components (status bar, project list, batch list, activity)
- [x] T059 Remove old AgentPanel component in electron-app/src/renderer/components/AgentPanel.tsx
- [x] T060 Remove old ProjectList.tsx (replaced by Projects.tsx) in electron-app/src/renderer/pages/ProjectList.tsx
- [x] T061 Clean up unused inline style constants and old imports across all modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (npm install for new deps)
- **Phase 3 (US1 Sidebar)**: Depends on Phase 2 (needs theme.css, shared components)
- **Phase 4 (US2 Projects)**: Depends on Phase 3 (needs AppShell/router to render pages)
- **Phase 5 (US3 Detail)**: Depends on Phase 4 (navigates from project cards)
- **Phase 6 (US4 Trace)**: Depends on Phase 5 (navigates from batch cards)
- **Phase 7 (US5 Activity)**: Depends on Phase 3 (needs sidebar/router — independent of US2-4)
- **Phase 8 (US6 Settings)**: Depends on Phase 3 (needs sidebar/router — independent of US2-5)
- **Phase 9 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Sidebar)**: Foundational only — must be first (provides layout shell)
- **US2 (Projects)**: Depends on US1 (needs router/layout)
- **US3 (Detail)**: Depends on US2 (navigates from project list)
- **US4 (Trace)**: Depends on US3 (navigates from batch card)
- **US5 (Activity)**: Depends on US1 only — can parallel with US2/US3/US4
- **US6 (Settings)**: Depends on US1 only — can parallel with US2/US3/US4

### Parallel Opportunities Within Phases

**Phase 2**: T005-T007 parallel (different DB tables), T008-T011 parallel (different model files), T012-T016 parallel (different API files), T023-T025 parallel (different component files)

**Phase 4**: T031-T033 parallel (different project components)

**Phase 5**: T036-T039 parallel (different detail components)

**Phase 7**: T044-T047 parallel (different activity components)

**Phase 8**: T049-T054 parallel (all 6 settings components)

---

## Parallel Example: Phase 2 Foundational

```text
# Backend models (all different files):
Task T008: "Update BatchSummary model in models/batch.py"
Task T009: "Update Agent model in models/agent.py"
Task T010: "Create ActivityEvent model in models/activity.py"
Task T011: "Create AgentTrace model in models/trace.py"

# Backend endpoints (all different files):
Task T012: "Create activity endpoints in api/activity.py"
Task T013: "Create storage endpoints in api/storage.py"
Task T014: "Add trace endpoint in api/batches.py"
Task T015: "Add agent logs endpoint in api/agents.py"
```

## Parallel Example: Phase 8 Settings

```text
# All settings components (different files, no dependencies):
Task T049: "Create SettingsLayout in components/settings/SettingsLayout.tsx"
Task T050: "Create GeneralSettings in components/settings/GeneralSettings.tsx"
Task T051: "Create PortsSettings in components/settings/PortsSettings.tsx"
Task T052: "Create AgentSettings in components/settings/AgentSettings.tsx"
Task T053: "Create StorageSettings in components/settings/StorageSettings.tsx"
Task T054: "Create AboutSettings in components/settings/AboutSettings.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T025)
3. Complete Phase 3: US1 Sidebar (T026-T030)
4. **VALIDATE**: App launches with sidebar, routes work
5. Complete Phase 4: US2 Projects (T031-T035)
6. **VALIDATE**: Project list functional
7. Complete Phase 5: US3 Detail (T036-T040)
8. **VALIDATE**: Full project → detail → logs flow works
9. **MVP COMPLETE** — core project management workflow functional

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. US1 Sidebar → Navigation works
3. US2 Projects → Project list redesigned
4. US3 Detail → Full project flow
5. US4 Trace → Agent transparency (can parallel with US5/US6)
6. US5 Activity → Cross-project monitoring
7. US6 Settings → Full configuration
8. Polish → Animations, empty states, error handling

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story
- Backend schema changes (T004-T007) touch the same file — must be done sequentially or combined
- The design reference at `/home/lukas/Projects/Github/0mg.ai/ai-server/designs/11/src/src/` should be consulted for exact visual details during implementation
- All styling uses CSS custom properties from theme.css — no inline styles
- No Tailwind, no GSAP — CSS transitions/keyframes only
