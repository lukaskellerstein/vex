# Dev Server Management & Project Onboarding

## Context

The dev server management was originally in the Agent Orchestrator (Python/FastAPI). This caused problems:
- uvicorn `--reload` wiped in-memory process state, orphaning child processes
- Status got stuck at "starting", URL never detected, Open button stayed disabled
- Complex `/proc` scanning and cross-platform hacks needed to recover state

**Decision**: Move dev server management to Electron main process. The AO is a stateless API service — it should not manage OS processes.

## Architecture Decisions

### 1. Electron Owns Dev Server Lifecycle

- **Start**: Electron spawns the process via `child_process.spawn()` with `detached: true` (own process group)
- **Stop**: Electron kills its own child process group (`process.kill(-pid, "SIGTERM")`)
- **Logs**: Stdout/stderr streamed and buffered in-memory (up to 2000 lines)
- **URL detection**: Parse stdout for `http://localhost:XXXX` patterns (strip ANSI codes first)
- **On Electron close**: All spawned dev servers are killed
- **On Electron restart**: Fresh state — everything is idle
- **Port conflict**: If the port is already in use, show error "Port X is in use. Stop the other process first."

No external process detection. No port scanning. No orphan recovery. No cross-platform `lsof`/`ss`/`netstat` hacks.

### 2. AO Has No Process Management

- AO stores project metadata in SQLite (path, name, framework, dev_command, dev_port, status, dev_server_url)
- Electron updates project status in AO via `PATCH /api/projects/:id` when dev server state changes
- AO's `dev_server_manager.py` is deleted — no start/stop/logs endpoints
- `ProjectUpdate` model includes `status` and `dev_server_url` fields for Electron to update

### 3. Target User = Non-Developer

The typical Vex user is a designer, PM, or content person who wants to tweak a UI without touching code or a terminal. They don't know what `npm run dev` means.

- The Start button is the **primary flow**, not optional convenience
- The user journey: Add project → Start → Open browser → Point at what to change → Done
- Developer scenario (running own terminal) is an edge case — agents work on file paths, not ports, so Vex still works regardless

### 4. Agents Don't Care About Ports

Agents operate on the **project path** — they read and write files on disk. The dev server port/URL is only relevant for:
- The "Open" button in the UI (convenience)
- The Chrome extension connecting to the running page

If a developer runs their project in their own terminal on any port, agents still work perfectly.

## Feature: Add Project from GitHub

### Problem

Currently, adding a project requires the user to have already cloned the repo. This presumes technical knowledge (git, terminal). The target user shouldn't need that.

### Solution

Add "Add from GitHub" option alongside the existing "Add from folder":

1. **Add from GitHub** (primary)
   - User pastes a GitHub repo URL (e.g., `https://github.com/user/repo`)
   - Vex clones it to `~/.vex/projects/<repo-name>/`
   - Auto-detects framework, dev command, package manager, styling
   - Runs `npm install` (or yarn/pnpm) automatically
   - Project is ready to Start

2. **Add from folder** (secondary)
   - Existing flow — user selects a local folder
   - For developers who already have the project locally

### UI Flow

```
[Add Project]
  ├── From GitHub URL  →  paste URL  →  cloning...  →  installing...  →  ready
  └── From Local Folder  →  file picker  →  ready
```

### Implementation Notes

- Clone via `git clone <url>` in Electron main process (not AO)
- Store in `~/.vex/projects/` (create dir if not exists)
- Run `npm install` / `yarn install` / `pnpm install` based on detected lock file
- Show progress in UI (cloning → installing → ready)
- Handle errors: invalid URL, clone failure, install failure, disk space

## Files Modified (Dev Server Refactor)

### New

- `electron-app/src/main/dev-server-manager.ts` — spawn/kill/logs/URL detection

### Modified

- `electron-app/src/main/index.ts` — IPC handlers use DevServerManager instead of AO API
- `electron-app/src/main/preload.ts` — no changes needed (IPC interface unchanged)
- `electron-app/src/renderer/pages/ProjectDetail.tsx` — port display, stop tooltip
- `agent-orchestrator/src/agent_orchestrator/api/projects.py` — removed start/stop/logs endpoints
- `agent-orchestrator/src/agent_orchestrator/models/project.py` — added status/dev_server_url to ProjectUpdate
- `agent-orchestrator/src/agent_orchestrator/main.py` — removed dev_server_manager from lifespan

### Deleted

- `agent-orchestrator/src/agent_orchestrator/services/dev_server_manager.py`

## Current Status

- [x] DevServerManager created in Electron main process
- [x] IPC handlers wired to use DevServerManager
- [x] AO dev_server_manager.py deleted, endpoints removed
- [x] ProjectUpdate model updated with status/dev_server_url
- [ ] Strip DevServerManager to bare minimum (remove checkRunning, syncProjectStatuses, killByPort)
- [ ] Test full flow: Start → logs → URL detection → Open → Stop
- [ ] Add from GitHub feature (separate task)
