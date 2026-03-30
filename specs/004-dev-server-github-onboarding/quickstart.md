# Quickstart: Dev Server Management & Project Onboarding

**Feature**: 004-dev-server-github-onboarding
**Date**: 2026-03-30
**Status**: Implemented and runtime-tested

## Prerequisites

- Node.js 18+ with npm
- Git installed and available in PATH
- Python 3.11+ with `uv`

## Setup

```bash
# Install Electron app dependencies
cd electron-app && npm install

# Install AO dependencies
cd agent-orchestrator && uv sync

# Start the dev environment (starts NATS, AO, Electron)
./dev-setup.sh
```

## Dev Server Management

### How it works

1. Electron main process owns all dev server processes
2. User clicks **Start** on a project → Electron spawns `child_process` with `detached: true`
3. Stdout is parsed for `http://localhost:XXXX` → URL displayed, Open button enabled
4. User clicks **Stop** → process group killed via `process.kill(-pid, 'SIGTERM')`
5. Electron updates project status in AO via `PATCH /api/projects/:id`

### Key files

| File | Purpose |
|------|---------|
| `electron-app/src/main/dev-server-manager.ts` | Spawn/stop/logs/URL detection |
| `electron-app/src/main/index.ts` | IPC handlers for start/stop/logs |
| `electron-app/src/renderer/pages/ProjectDetail.tsx` | UI for dev server controls |

### IPC channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `start-dev-server` | Renderer → Main | Spawn dev server for project (takes `projectId` only) |
| `stop-dev-server` | Renderer → Main | Kill dev server process group (SIGTERM → SIGKILL after 5s) |
| `get-dev-server-logs` | Renderer → Main | Get new log lines since `offset`; also returns `url` and `portError` |

## Add Project from GitHub

### How it works

1. User clicks **Add Project** → dialog with two tabs
2. "From GitHub URL" tab: paste URL → Start
3. Electron runs `git clone --progress <url> ~/.vex/projects/<repo-name>/`
4. Progress parsed from git stderr, shown in UI
5. Lock file detected → appropriate install command run
6. Framework/dev command auto-detected
7. Project registered in AO via `POST /api/projects`

### Key files

| File | Purpose |
|------|---------|
| `electron-app/src/main/github-cloner.ts` | Git clone + progress parsing |
| `electron-app/src/main/dependency-installer.ts` | npm/yarn/pnpm install |
| `electron-app/src/renderer/components/AddProjectDialog.tsx` | Two-tab dialog UI |
| `agent-orchestrator/src/agent_orchestrator/services/project_detector.py` | Framework detection (existing) |

### IPC channels (new)

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `clone-github-repo` | Renderer → Main | Start clone (validates URL, creates `~/.vex/projects/`, runs `git clone`) |
| `clone-progress` | Main → Renderer | Stream clone/install progress events (subscribed via `onCloneProgress`, returns unsubscribe fn) |
| `install-dependencies` | Renderer → Main | Run package manager install (skips silently if no `package.json`) |

## Testing

### Dev Server

```bash
# Start dev environment
./dev-setup.sh

# Via Chrome DevTools MCP: click Start on a project, verify:
# 1. Status goes starting → running
# 2. URL detected and displayed
# 3. Open button works
# 4. Stop kills process cleanly (verify with: ps aux | grep <dev-command>)
```

### GitHub Onboarding

```bash
# Via Chrome DevTools MCP:
# 1. Click Add Project → From GitHub URL
# 2. Paste a public repo URL (e.g., https://github.com/vitejs/vite-plugin-react)
# 3. Verify progress: cloning → installing → ready
# 4. Verify project appears in list with detected framework
# 5. Click Start → verify dev server runs
```
