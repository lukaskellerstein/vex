# Quickstart: Full Run with Extension Fixes

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## Prerequisites

1. **NATS server binary** on PATH:
   ```bash
   curl -L https://github.com/nats-io/nats-server/releases/latest/download/nats-server-v2.10.25-linux-amd64.tar.gz -o nats.tar.gz
   tar xzf nats.tar.gz && sudo mv nats-server-*/nats-server /usr/local/bin/
   ```

2. **Claude API credentials**: `ANTHROPIC_API_KEY` env var or `claude login`

3. **Python 3.11+** with `uv`

4. **Node.js 18+** with `npm`

5. **Chrome** with Vex extension loaded from `chrome-extension/`

## Setup

```bash
# Agent Orchestrator
cd agent-orchestrator && uv venv && source .venv/bin/activate && uv sync

# Electron App
cd electron-app && npm install && npm run build

# Chrome Extension
cd chrome-extension && npm install && npm run build
```

## Run

```bash
cd electron-app && npm run start
```

This starts: NATS (port 4222/4223), AgentManager (port 8420), Electron window.

## Verify Each User Story

### US1: NATS Starts
- StatusBar shows NATS connected (green dot)
- `curl` or `nc -z localhost 4222` succeeds

### US2: Real SDK Agent
- Add a project via the UI
- Submit a task — verify real agent output (not "stub" messages)

### US3: Screenshot in Select Dialog
- Enable extension on a page → select mode → click an element
- Popup dialog shows a screenshot thumbnail with element highlighted

### US4: Resize Hover Borders
- Switch to resize mode → hover over elements
- Each hovered element gets a visible border

### US5: Style Editor Improvements
- Switch to style mode → click an element
- Style editor panel appears with drag handle, selection border on element
- Drag the panel by its header
- Click "Copy Style" button in the panel

### US6: Action Panel on Toolbar
- Record some actions → click the chevron on the on-page toolbar
- Panel expands showing all recorded actions
- Popup dialog no longer shows the action list

### US7: End-to-End
- Full cycle: select element → add instruction → submit batch → see real code changes

## Troubleshooting

| Problem | Solution |
|---------|----------|
| NATS not starting | Install `nats-server`: check `which nats-server` |
| Port 4222 in use | `lsof -i :4222` then `kill <pid>` |
| Agent errors | Check `ANTHROPIC_API_KEY` is set |
| Extension not working | Reload extension in `chrome://extensions` |
| Style editor off-screen | Resize browser window — panel repositions to viewport |
