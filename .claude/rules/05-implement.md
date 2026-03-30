---
description: "Step 4: Implement — coding rules, dev environment, project structure"
---

# Step 4: Implement

Write clean code from the start. Follow these rules during implementation:

- Do NOT commit via `git` unless explicitly instructed by the user
- Do NOT start the dev environment — the user runs `./dev-setup.sh` manually
- When creating diagrams or graphs, use `mermaid`
- Write clean code from the start — don't plan to "clean it up later"
- Refactor continuously — improve code structure immediately when you see issues
- Remove dead code — delete unused functions, variables, imports, and commented code
- After writing code: review comments, clean up imports, check for side effects

## Development Environment

The project runs via `./dev-setup.sh` at the project root, which starts all three components:

1. **NATS server** — TCP port 4222, WebSocket port 4223 (bundled binaries in `electron-app/bin/`)
2. **Agent Orchestrator** — FastAPI on port 8420 (`agent-orchestrator/`)
3. **Electron app** — standalone mode with remote debugging on port 9222 (`electron-app/`)

Do NOT run `./dev-setup.sh` yourself. If the dev environment is not running, tell the user:
> "The dev environment is not running. Please start it with: `./dev-setup.sh`"

## Electron App (`electron-app/`)

- Main process + React renderer, bundled with Vite
- Manages child processes (NATS, agent-orchestrator) in production mode
- IPC between main and renderer via `preload.ts`
- Install deps: `cd electron-app && npm install`
- Build: `cd electron-app && npm run build`

## Chrome Extension (`chrome-extension/`)

- Manifest V3, React + Vite (`vite-plugin-web-extension`)
- Connects to NATS via WebSocket (port 4223)
- Build: `cd chrome-extension && npm run build`
- Dev: `cd chrome-extension && npm run dev`

## Agent Orchestrator (`agent-orchestrator/`)

- Python FastAPI backend, uses `uv` exclusively (never `pip`)
- SQLite database at `~/.vex/vex.db` (async via aiosqlite, WAL mode)
- Install deps: `cd agent-orchestrator && uv sync`
- Run standalone: `cd agent-orchestrator && uv run uvicorn agent_orchestrator.main:app --reload --port 8420`
- Lint: `cd agent-orchestrator && uv run ruff check .`
- Test: `cd agent-orchestrator && uv run pytest`
