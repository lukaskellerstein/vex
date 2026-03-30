# Implementation Plan: Dev Server Management & Project Onboarding

**Branch**: `004-dev-server-github-onboarding` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-dev-server-github-onboarding/spec.md`

## Summary

Move dev server lifecycle management from the Agent Orchestrator (Python/FastAPI) to the Electron main process to eliminate orphaned processes and stuck status caused by uvicorn `--reload`. Add "Add from GitHub URL" project onboarding flow that clones repos, auto-detects frameworks, and installs dependencies — all from the Electron main process. The AO remains the persistent store for project metadata; Electron owns all runtime process state.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator)
**Primary Dependencies**: Electron 30, React 18.3, FastAPI 0.115+, child_process (Node.js built-in)
**Storage**: SQLite via aiosqlite (`~/.vex/vex.db`), file-based screenshots (`~/.vex/data/`)
**Testing**: Chrome DevTools MCP (Electron UI), curl (AO endpoints), manual process inspection
**Target Platform**: Linux, macOS desktop (Electron)
**Project Type**: Desktop app + backend API
**Performance Goals**: Dev server URL detected within 30s of spawn; GitHub clone-to-ready under 5 minutes
**Constraints**: No external process scanning (no lsof/netstat), no orphan recovery, clean-slate on restart
**Scale/Scope**: Single user, 1-10 projects typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | **VIOLATION — JUSTIFIED** | Dev server management moves from AO to Electron. AO retains persistent state ownership; Electron manages runtime-only process state. See Complexity Tracking. |
| II. Protocol-First | PASS | Electron updates AO via existing `PATCH /api/projects/:id` — same REST protocol. |
| III. Chrome Extension as Real Browser | PASS | No change to extension. |
| IV. Structured Actions | N/A | Feature doesn't touch action system. |
| V. Agent-Agnostic Orchestration | N/A | Feature doesn't touch agent routing. |
| VI. Developer Edit as Sketch | N/A | Feature doesn't touch edit interpretation. |
| VII. Simplicity and YAGNI | PASS | Deleting dev_server_manager.py from AO (removing complexity). GitHub onboarding uses simple `git clone` + `npm install` — no abstractions. |
| State ownership constraint | **VIOLATION — JUSTIFIED** | AO still owns persistent state (project metadata in SQLite). Electron holds ephemeral runtime state only (PIDs, log buffers). On restart, all state resets to idle. See Complexity Tracking. |

## Project Structure

### Documentation (this feature)

```text
specs/004-dev-server-github-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
electron-app/
├── src/main/
│   ├── index.ts                    # IPC handlers (MODIFY: add GitHub clone + install handlers)
│   ├── dev-server-manager.ts       # MODIFY: strip to bare minimum (remove checkRunning, killByPort, syncProjectStatuses)
│   ├── github-cloner.ts            # NEW: git clone + progress parsing
│   └── dependency-installer.ts     # NEW: npm/yarn/pnpm install + progress parsing
├── src/renderer/
│   ├── pages/
│   │   ├── ProjectList.tsx         # MODIFY: add "From GitHub URL" option to Add Project flow
│   │   └── ProjectDetail.tsx       # MODIFY: port display improvements, stop tooltip
│   └── components/
│       └── AddProjectDialog.tsx    # NEW: dialog with GitHub URL / Local Folder tabs

agent-orchestrator/
├── src/agent_orchestrator/
│   ├── api/projects.py             # Already clean (no start/stop/logs endpoints)
│   ├── models/project.py           # Already has status/dev_server_url in ProjectUpdate
│   └── services/
│       └── project_detector.py     # Existing: auto-detect framework, package manager, etc.
```

**Structure Decision**: Follows existing multi-project structure (electron-app + agent-orchestrator). New files are minimal — two small modules in Electron main for clone/install, one dialog component in renderer. AO changes are deletions only.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Dev server runtime state in Electron (not AO) | uvicorn `--reload` destroys in-memory state, orphaning child processes. AO is a stateless API service — it fundamentally cannot hold PIDs reliably. | Keeping it in AO was the original design and it failed: stuck "starting" status, orphaned processes, required cross-platform `/proc` scanning hacks. |
| Git clone in Electron (not AO) | Clone needs to show real-time progress in the UI. Electron can stream `git clone --progress` stderr directly. Going through AO would add an unnecessary relay hop. | AO relay: adds complexity (SSE or WebSocket for progress), introduces a failure point, and the file ends up on the same machine anyway. |

---

## Implementation Notes (Post-Implementation)

### Deviations from Original Plan

**`start-dev-server` IPC request shape simplified**: The plan called for the renderer to pass `{ projectId, devCommand, projectPath, devPort }`. The implementation takes only `projectId` — the main process fetches full project details from the AO via `GET /api/projects/:id`. This avoids the renderer needing to pass a potentially stale snapshot of project data at start time.

**`get-dev-server-logs` response uses incremental offset polling**: The original plan described a simple `{ logs: string[] }` response. The implementation returns `{ lines, offset, running, url, portError }`. The `offset` parameter enables the renderer to fetch only new lines since the last poll, avoiding growing payloads. `url` and `portError` are piggybacked onto the same poll to avoid additional IPC round-trips.

**Port conflict surfaced via log polling, not start response**: The spec assumed the port conflict error would be returned by the `start-dev-server` IPC call. In practice, port conflicts are detected by parsing stderr lines as they arrive. The error is stored in `DevServer.portError` and surfaced via the `getLogs` response. This is more accurate because port conflicts manifest asynchronously — the process must actually start and attempt to bind before the error appears.

**`cloneRepo` function signature is `(url, win)`**: The plan described `cloneRepo(url, destDir)`. The implementation takes a `BrowserWindow` reference instead of a `destDir`. The destination is computed internally using `~/.vex/projects/<repoName>` with automatic suffix logic. Progress events are sent directly via `win.webContents.send`.

**`installDependencies` function signature is `(projectPath, win)`**: Same pattern — `BrowserWindow` replaces an event-emitter abstraction. If no `package.json` exists in the cloned repo, install is silently skipped and `{ success: true, packageManager: "npm" }` is returned.

**`buildRunCommand` reads `package.json` scripts directly**: Rather than splitting the stored `dev_command` string from the AO, the implementation reads `package.json` and searches for the first matching script key (`dev`, `start`, `serve`). This handles cases where the stored command text does not match the actual script key name.

**URL detection covers `127.0.0.1` and includes a port-number fallback**: In addition to `localhost`, `127.0.0.1` is detected. A secondary heuristic is applied: if a line contains "ready", "listening", or "started" and a standalone port number (1024–65535) appears as a whitespace-separated token, `http://localhost:PORT` is constructed. This handles dev servers that print the port without a full URL.

**`stop` escalates to SIGKILL after 5 seconds**: The stop method sends SIGTERM to the process group and waits for exit, but a 5-second timeout escalates to SIGKILL if the process does not terminate cleanly. Not in the original plan.

**`resetAllProjectStatuses` skips already-idle projects**: The startup reset only patches projects whose status is not already `"idle"`, reducing unnecessary API calls.

**`before-quit` uses `event.preventDefault()` + `app.exit(0)`**: Async cleanup of all dev servers requires blocking the quit event, running `stopAll()`, then re-triggering exit. Standard Electron pattern for async teardown.

**`onCloneProgress` preload returns an unsubscribe function**: The listener registration returns a cleanup closure that removes the IPC listener. `AddProjectDialog` calls this in its `useEffect` teardown to prevent memory leaks.

**`AddProjectDialog` opens on the "From GitHub URL" tab by default**: Consistent with the P1 priority of GitHub onboarding for the target non-technical user.
