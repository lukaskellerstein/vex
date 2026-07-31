---
description: "Step 4: Implement — coding rules, dev environment, project structure"
---

# Step 4: Implement

Write clean code from the start. Follow these rules during implementation:

- Do NOT commit via `git` unless explicitly instructed by the user
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

Plus Vite on 5199, and Chrome on 9333 with `--with-chrome`.

### Starting it — always via `dev-env.py`

**Never invoke `./dev-setup.sh` directly.** It *evicts* rather than coexists: it kills
whatever holds each of its six ports before claiming them, so launching it while an
instance is up silently destroys that session — possibly another agent's.

**Step 1 — check.** Always, before anything else:

```bash
python3 .claude/hooks/dev-env.py status
```

**Step 2a — already running?** Do NOT start, do NOT `--force`. Report what is running
(the command prints ports, PIDs, and whether `dev-env.py` started it) and **ask the user
whether restarting is safe**, calling out that it would kill the running instance. Only
after they confirm, re-run `start --force`.

**Step 2b — nothing running?** Start it yourself, no need to ask:

```bash
python3 .claude/hooks/dev-env.py start
```

This launches `dev-setup.sh --with-chrome` detached (log: `/tmp/vex-logs/dev-setup.log`),
so both 9222 and 9333 come up and either Playwright MCP is usable. On macOS the Electron
window is moved to its own yabai space labelled `vex` as soon as it appears, keeping the
dev app off your current workspace. Without yabai this degrades to a no-op and the window
just opens normally. Add `--no-chrome` to skip Chrome.

**Stopping.** `python3 .claude/hooks/dev-env.py stop` signals the recorded process group.
The `SessionEnd` hook also terminates the Electron app when the session ends.

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
