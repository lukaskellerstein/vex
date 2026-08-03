---
description: "Reference: Technology stack — Electron, Chrome Extension, React, TypeScript, Python/FastAPI, NATS, SQLite, CodeMirror, GSAP"
---

# Reference: Technology Stack

## Project Structure

```text
electron-app/        # Electron desktop app (main process + React renderer)
chrome-extension/    # Chrome Extension (Manifest V3, React + Vite)
agent-orchestrator/  # Python FastAPI backend
```

## Electron App

- Electron: 30.0.0
- React: 18.3.x, React DOM: 18.3.x
- TypeScript: 5.7+
- Bundler: Vite 6.0
- Packaging: electron-builder 25.1
- IPC between main and renderer processes
- Manages child processes (NATS server, agent-orchestrator)

## Chrome Extension

- Manifest V3
- React: 18.3.x
- TypeScript: 5.7+
- Bundler: Vite 6.0 + vite-plugin-web-extension
- CodeMirror 6 (markdown editor)
- GSAP 3.14 (animations)
- NATS WebSocket client: nats.ws 1.30
- Styling: Custom CSS (Catppuccin Mocha color scheme), no CSS framework

## Backend (agent-orchestrator)

- **CRITICAL**: Use `uv` exclusively — NEVER use `pip` directly
- Python: 3.11+
- API Framework: FastAPI >= 0.115 + Uvicorn >= 0.32
- Database: aiosqlite >= 0.20 (SQLite with WAL mode, stored at `~/.vex/vex.db`)
- Messaging: nats-py >= 2.9
- Validation: Pydantic >= 2.10
- AI Agent: Claude Agent SDK >= 0.1.52
- Build System: Hatchling
- Linter: Ruff (Python 3.11 target, 100 char line length)
- Testing: pytest + pytest-asyncio

## Messaging

- NATS Server v2.10+ (bundled binaries in `electron-app/bin/`)
  - TCP: port 4222
  - WebSocket: port 4223 (no TLS in dev)
- Python client: nats-py
- JS client: nats.ws (WebSocket)

## Data Storage

- SQLite: `~/.vex/vex.db` (async via aiosqlite, WAL mode, foreign keys enabled)
- File-based screenshots: `~/.vex/data/{projectId}/`

## Package Managers

- JavaScript: `npm`
- Python: `uv` (never `pip`)
