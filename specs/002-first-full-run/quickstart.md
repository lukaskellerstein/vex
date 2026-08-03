# Quickstart: First Full Run

**Branch**: `002-first-full-run` | **Date**: 2026-03-30

## Prerequisites

1. **NATS server binary** installed and on PATH:

   ```bash
   # Linux
   curl -L https://github.com/nats-io/nats-server/releases/latest/download/nats-server-v2.10.25-linux-amd64.tar.gz -o nats.tar.gz
   tar xzf nats.tar.gz
   sudo mv nats-server-v2.10.25-linux-amd64/nats-server /usr/local/bin/
   ```

2. **Claude API credentials** configured:
   - `ANTHROPIC_API_KEY` environment variable set, OR
   - Claude Code authenticated via `claude login`

3. **Python 3.11+** with `uv` installed

4. **Node.js 18+** with `npm`

## Setup

### Agent Orchestrator

```bash
cd agent-orchestrator
uv venv && source .venv/bin/activate
uv sync
```

### Electron App

```bash
cd electron-app
npm install
npm run build
```

## Run

```bash
cd electron-app
npm run start
```

This will:
1. Start NATS server on port 4222 (WS on 4223)
2. Start agent-orchestrator on port 8420
3. Open the Vex desktop window

## Verify

1. **NATS running**: `nats-server --help` should work; port 4222 should be listening
2. **AgentManager running**: `curl http://localhost:8420/api/health` should return healthy
3. **Chrome extension**: Load the extension, navigate to a test project's dev server, make a visual edit, submit batch

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "NATS could not be started" | Install `nats-server` binary and ensure it's on PATH |
| Port 4222 already in use | Kill existing process: `lsof -i :4222` then `kill <pid>` |
| Agent task returns error | Check `ANTHROPIC_API_KEY` is set; verify with `echo $ANTHROPIC_API_KEY` |
| AgentManager not starting | Check Python venv: `cd agent-orchestrator && source .venv/bin/activate && uv sync` |
