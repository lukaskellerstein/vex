# Quickstart: Vex Development

**Branch**: `001-vex-visual-editor` | **Date**: 2026-03-30

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+ and uv
- Chrome browser (116+)
- nats-server binary (v2.10+)

## Repository Structure

```text
vex/
├── chrome-extension/    # Chrome Extension (TypeScript, React, Vite)
├── agent-orchestrator/  # AgentManager (Python, FastAPI)
├── electron-app/        # Electron Desktop Shell (TypeScript)
└── specs/               # Feature specs and plans
```

## Chrome Extension Development

```bash
cd chrome-extension
npm install
npm run dev          # Build with watch mode
```

Load in Chrome: `chrome://extensions` → "Load unpacked" → select `chrome-extension/dist/`

The extension injects a content script on all pages. Click the extension icon to toggle the visual editor.

## AgentManager Development

```bash
cd agent-orchestrator
uv venv && source .venv/bin/activate
uv sync
uvicorn agent_orchestrator.main:app --reload --port 8420
```

API available at `http://localhost:8420`. Health check: `GET /api/health`.

## NATS Server

```bash
nats-server -p 4222 --websocket_port 4223 --websocket_no_tls
```

Or use the nats-server config file:

```text
listen: 0.0.0.0:4222
websocket {
  listen: "0.0.0.0:4223"
  no_tls: true
}
```

## Electron App Development

```bash
cd electron-app
npm install
npm run dev          # Start Electron in dev mode
```

The Electron app manages all child processes (NATS, AgentManager, agents).

## Development Workflow

1. Start NATS server (or use Electron app which starts it automatically)
2. Start AgentManager
3. Load Chrome Extension in dev mode
4. Open a web project in Chrome
5. Use the extension to make visual edits
6. Send batch → AgentManager → Agent → source code changes

## Key Ports

| Service | Port | Protocol |
|---------|------|----------|
| AgentManager REST | 8420 | HTTP |
| NATS | 4222 | NATS |
| NATS WebSocket | 4223 | WS |

## Testing

```bash
# Chrome Extension
cd chrome-extension && npm test

# AgentManager
cd agent-orchestrator && pytest

# E2E (requires all services running)
npx playwright test
```
