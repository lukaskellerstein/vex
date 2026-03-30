# Tasks: Dev Server Management & Project Onboarding

**Input**: Design documents from `/specs/004-dev-server-github-onboarding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Validation via Chrome DevTools MCP and manual inspection per testing rules.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but US1 (dev server) is foundational — US2 (GitHub onboarding) depends on a working start/stop flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this feature modifies existing files in an established codebase. Phase 1 is empty.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Strip DevServerManager to bare minimum and clean up AO remnants. These changes are prerequisites for all user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Strip DevServerManager: remove `checkRunning`, `syncProjectStatuses`, `killByPort`, and all TCP/lsof/netstat logic in `electron-app/src/main/dev-server-manager.ts` — retain only start (spawn + URL detect), stop (kill process group), getLogs (return buffer)
- [x] T002 Simplify startup in `electron-app/src/main/index.ts`: remove status sync logic that calls `syncProjectStatuses` on app ready — replace with a simple loop that PATCHes all projects to status "idle" and dev_server_url null
- [x] T003 Remove `dev_server_pid` usage: ensure no code in `electron-app/src/main/` reads or writes `dev_server_pid` (the field stays in SQLite schema but is always null)
- [x] T004 Verify AO cleanup: confirm `agent-orchestrator/src/agent_orchestrator/services/dev_server_manager.py` is already deleted and no imports reference it in `agent-orchestrator/src/agent_orchestrator/main.py`

**Checkpoint**: DevServerManager is minimal (start/stop/getLogs only). No orphan recovery, no port scanning, no cross-platform hacks. All projects reset to idle on startup.

---

## Phase 3: User Story 1 — Start and Stop a Dev Server (Priority: P1) MVP

**Goal**: Reliable dev server start/stop/logs from Electron with clean process group management and URL detection.

**Independent Test**: Start a project → verify status transitions (idle → starting → running) → verify URL detected and Open button works → Stop → verify process killed and status returns to idle. Close Electron → verify no orphaned processes.

### Implementation for User Story 1

- [x] T005 [US1] Ensure `start` in `electron-app/src/main/dev-server-manager.ts` spawns with `detached: true`, strips ANSI codes from stdout, and detects URL via `https?://localhost:\d+` regex
- [x] T006 [US1] Ensure `stop` in `electron-app/src/main/dev-server-manager.ts` kills the process group via `process.kill(-pid, 'SIGTERM')` and handles the case where the process already exited
- [x] T007 [US1] Ensure log buffer in `electron-app/src/main/dev-server-manager.ts` is capped at 2000 lines (circular buffer eviction)
- [x] T008 [US1] Wire IPC handler `start-dev-server` in `electron-app/src/main/index.ts`: call DevServerManager.start, PATCH project status to "starting", on URL detection PATCH to "running" + dev_server_url, on process exit PATCH to "idle" or "error"
- [x] T009 [US1] Wire IPC handler `stop-dev-server` in `electron-app/src/main/index.ts`: call DevServerManager.stop, PATCH project status to "idle" and dev_server_url to null
- [x] T010 [US1] Wire IPC handler `get-dev-server-logs` in `electron-app/src/main/index.ts`: return DevServerManager.getLogs(projectId)
- [x] T011 [US1] Add `before-quit` handler in `electron-app/src/main/index.ts`: iterate all running dev servers and call DevServerManager.stop for each
- [x] T012 [US1] Update `electron-app/src/renderer/pages/ProjectDetail.tsx`: ensure Start/Stop buttons correctly reflect status, Open button enabled only when dev_server_url is set, stop tooltip shows "Stop dev server"

**Checkpoint**: User Story 1 fully functional. Can start/stop dev servers, see logs, URL auto-detected, Open button works, no orphans on quit.

---

## Phase 4: User Story 2 — Add Project from GitHub URL (Priority: P1)

**Goal**: Non-technical user pastes a GitHub URL, Vex clones it, installs deps, auto-detects framework, project ready to Start.

**Independent Test**: Click Add Project → From GitHub URL → paste a public repo URL → verify progress (cloning → installing → ready) → project appears in list with detected framework → click Start → dev server runs.

### Implementation for User Story 2

- [x] T013 [P] [US2] Create `electron-app/src/main/github-cloner.ts`: export `cloneRepo(url: string, destDir: string): Promise<{path, repoName}>` — validates GitHub URL format, extracts repo name, handles duplicate names (append `-N` suffix), spawns `git clone --progress`, parses stderr for progress percentage, sends progress via IPC `clone-progress` channel
- [x] T014 [P] [US2] Create `electron-app/src/main/dependency-installer.ts`: export `installDependencies(projectPath: string): Promise<{packageManager: string}>` — detects lock file (pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lockb → bun, default → npm), spawns install command, sends progress via IPC `clone-progress` channel (phase: "installing")
- [x] T015 [US2] Add IPC handlers in `electron-app/src/main/index.ts`: `clone-github-repo` (calls cloneRepo), `install-dependencies` (calls installDependencies), send `clone-progress` events to renderer via `webContents.send`
- [x] T016 [US2] Add preload API methods in `electron-app/src/main/preload.ts`: expose `cloneGithubRepo`, `installDependencies`, `onCloneProgress` (listener registration)
- [x] T017 [P] [US2] Create `electron-app/src/renderer/components/AddProjectDialog.tsx`: dialog with two tabs ("From GitHub URL", "From Local Folder"), GitHub tab has URL input + Start button, progress bar showing phase (cloning/installing/detecting/ready/error), error display, Local Folder tab wraps existing folder picker flow
- [x] T018 [US2] Update `electron-app/src/renderer/pages/ProjectList.tsx`: replace existing inline "Add Project" flow with AddProjectDialog component, on successful clone: call `createProject` with the cloned path, refresh project list
- [x] T019 [US2] Implement full onboarding pipeline in AddProjectDialog: on submit → cloneGithubRepo → installDependencies → createProject (POST to AO, which auto-detects framework via project_detector) → navigate to new project detail
- [x] T020 [US2] Add user-friendly error messages: "Could not access this repository" (clone fail), "Installation failed. Make sure Node.js is installed" (install fail), "Not enough disk space" (ENOSPC), "Git is not installed" (git not found)

**Checkpoint**: User Story 2 fully functional. GitHub URL → clone → install → detect → ready. Progress shown in UI. Errors handled gracefully.

---

## Phase 5: User Story 3 — Add Project from Local Folder (Priority: P2)

**Goal**: Existing "Add from folder" flow integrated into the new AddProjectDialog as the secondary tab.

**Independent Test**: Click Add Project → From Local Folder → select directory → project added with auto-detected settings.

### Implementation for User Story 3

- [x] T021 [US3] Ensure "From Local Folder" tab in `electron-app/src/renderer/components/AddProjectDialog.tsx` uses the existing `select-folder` IPC channel and project creation flow from the old ProjectList inline form
- [x] T022 [US3] Remove the old inline "Add Project" UI from `electron-app/src/renderer/pages/ProjectList.tsx` (replaced by AddProjectDialog in T018)

**Checkpoint**: Both onboarding paths work via the same dialog. Local folder path preserves existing behavior.

---

## Phase 6: User Story 4 — View Dev Server Logs (Priority: P2)

**Goal**: Users can view buffered dev server output for troubleshooting.

**Independent Test**: Start a dev server → open logs view → verify output streaming. Stop server → verify last session's logs still visible.

### Implementation for User Story 4

- [x] T023 [US4] Verify log polling in `electron-app/src/renderer/pages/ProjectDetail.tsx`: confirm logs are polled every 1s while status is "starting" or "running", displayed in the terminal output panel, and retained after stop until next start

**Checkpoint**: Logs visible during and after dev server runs. This is largely already implemented — task is verification and minor fixes if needed.

---

## Phase 7: User Story 5 — Port Conflict Handling (Priority: P3)

**Goal**: Clear error when port is already in use.

**Independent Test**: Occupy a port → click Start → verify error message "Port X is in use. Stop the other process first."

### Implementation for User Story 5

- [x] T024 [US5] In `electron-app/src/main/dev-server-manager.ts` `start` method: detect port-in-use from stderr patterns (EADDRINUSE, "port is already in use", "address already in use") and surface as a structured error
- [x] T025 [US5] In `electron-app/src/renderer/pages/ProjectDetail.tsx`: display port conflict error message inline (not a generic "error" — show "Port X is in use. Stop the other process first.") and allow retry

**Checkpoint**: Port conflicts handled with clear, actionable error messages.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup across all stories.

- [x] T026 Ensure `~/.vex/projects/` directory is created automatically if it doesn't exist — add mkdir in `electron-app/src/main/github-cloner.ts` before clone
- [x] T027 Verify git is available in PATH before clone attempt in `electron-app/src/main/github-cloner.ts` — show "Git is not installed on your computer" if not found
- [x] T028 Run quickstart.md validation: full end-to-end test of both onboarding paths and dev server lifecycle

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Empty — nothing to do
- **Phase 2 (Foundational)**: No dependencies — start immediately. **BLOCKS all user stories.**
- **Phase 3 (US1)**: Depends on Phase 2. Dev server start/stop must work before GitHub onboarding can be tested end-to-end.
- **Phase 4 (US2)**: Depends on Phase 2. Can start T013/T014/T017 in parallel with Phase 3 (different files). Full pipeline test (T019) requires US1 working.
- **Phase 5 (US3)**: Depends on T017 (AddProjectDialog). Can run alongside Phase 4.
- **Phase 6 (US4)**: Depends on Phase 2. Mostly verification — can run alongside Phase 3.
- **Phase 7 (US5)**: Depends on Phase 3 (needs working start flow to test port conflicts).
- **Phase 8 (Polish)**: Depends on all stories complete.

### User Story Dependencies

- **US1 (P1)**: Independent after foundational. **MVP target.**
- **US2 (P1)**: T013, T014, T017 can start in parallel with US1 (different files). T019 end-to-end test needs US1 complete.
- **US3 (P2)**: Depends on T017 (AddProjectDialog created in US2).
- **US4 (P2)**: Independent after foundational. Mostly verification.
- **US5 (P3)**: Depends on US1 (needs working start flow).

### Parallel Opportunities

```
Phase 2: T001, T002, T003, T004 — all different files, run in parallel

Phase 3 + Phase 4 partial overlap:
  US1: T005-T012 (dev-server-manager.ts, index.ts, ProjectDetail.tsx)
  US2: T013, T014, T017 can start in parallel (github-cloner.ts, dependency-installer.ts, AddProjectDialog.tsx)

Phase 5 + Phase 6: can run in parallel (different files)
```

---

## Parallel Example: Phase 2 (Foundational)

```bash
# All four tasks target different files — run in parallel:
Task: "Strip DevServerManager in electron-app/src/main/dev-server-manager.ts"
Task: "Simplify startup in electron-app/src/main/index.ts"
Task: "Remove dev_server_pid usage across electron-app/src/main/"
Task: "Verify AO cleanup in agent-orchestrator/"
```

## Parallel Example: User Story 2

```bash
# These three tasks create new files — run in parallel:
Task: "Create github-cloner.ts in electron-app/src/main/"
Task: "Create dependency-installer.ts in electron-app/src/main/"
Task: "Create AddProjectDialog.tsx in electron-app/src/renderer/components/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (strip DevServerManager)
2. Complete Phase 3: User Story 1 (reliable start/stop)
3. **STOP and VALIDATE**: Test start → URL detect → Open → stop → no orphans
4. This alone fixes the critical reliability bugs from the AO-based approach

### Incremental Delivery

1. Phase 2 → Foundation ready (stripped DevServerManager, clean startup)
2. Phase 3 → US1: Dev server start/stop works reliably → **MVP!**
3. Phase 4 → US2: GitHub onboarding (the big new feature)
4. Phase 5 → US3: Local folder path integrated into new dialog
5. Phase 6 → US4: Log viewing verified
6. Phase 7 → US5: Port conflict errors
7. Phase 8 → Polish and validation

---

## Notes

- T002 and T008/T009 both touch `index.ts` — T002 (foundational) must complete before T008/T009
- T017 (AddProjectDialog) and T018 (ProjectList update) both touch the add-project flow — T017 before T018
- AO has no code changes in this feature — only Electron app is modified
- Existing preload.ts IPC interface for start/stop/logs is unchanged; only new channels added for clone
