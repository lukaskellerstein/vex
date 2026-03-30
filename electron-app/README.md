# Electron App (Vex Desktop)

Electron + React desktop shell for Vex. Manages the UI and optionally spawns NATS and Agent Orchestrator as child processes.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
cd electron-app
npm install
```

## Run

### Integrated mode (default)

Electron automatically starts NATS and Agent Orchestrator:

```bash
npm run build:start
```

### Standalone mode (for development/debugging)

Run NATS and Agent Orchestrator separately (in their own terminals), then start Electron without spawning them:

```bash
npm run build
npm run start -- --standalone --ao-port 8420 --nats-port 4222
```

CLI arguments:

| Argument | Default | Description |
|----------|---------|-------------|
| `--standalone` | off | Don't spawn NATS or Agent Orchestrator |
| `--ao-port <port>` | 8420 | Agent Orchestrator port to connect to |
| `--nats-port <port>` | 4222 | NATS port for health checks |

In standalone mode, Electron only connects to external services — it won't start or stop them.

## Remote debugging (for AI agents / chrome-devtools MCP)

Electron starts with `--remote-debugging-port=9222` by default. This exposes the Chrome DevTools Protocol, allowing tools like `chrome-devtools-mcp` to inspect, click, and screenshot the UI.

MCP config for connecting:

```json
{
  "chrome-devtools": {
    "type": "stdio",
    "command": "npx",
    "args": ["chrome-devtools-mcp@latest", "--browserUrl=http://localhost:9222"]
  }
}
```

## Development

```bash
npm run dev    # Vite dev server (renderer hot-reload)
npm run build  # Compile TypeScript + Vite build
npm run start  # Launch Electron from dist/
```
