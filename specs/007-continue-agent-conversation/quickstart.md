# Quickstart: Continue Conversation with Finished Agent

**Branch**: `007-continue-agent-conversation` | **Date**: 2026-04-04

## Prerequisites

- Dev environment running via `./dev-setup.sh`
- At least one project registered in Vex
- A completed or failed agent run (submit a batch and wait for completion)

## Verify Backend

```bash
# Health check
curl http://localhost:8420/api/health

# List agents to find one in terminal state
curl http://localhost:8420/api/agents | jq '.[] | {id, status, name}'

# Continue a finished agent
curl -X POST http://localhost:8420/api/agents/{AGENT_ID}/continue \
  -H "Content-Type: application/json" \
  -d '{"message": "Fix the issue you introduced"}'

# Verify multi-trace response
curl http://localhost:8420/api/agents/{AGENT_ID}/trace | jq '.traces | length'
```

## Test from Electron UI

1. Open the Electron app
2. Navigate to a project with completed agent runs
3. Click on a completed/failed agent's trace
4. Scroll to the bottom — a follow-up input bar should appear
5. Type a message and click Send
6. Observe: agent status changes to "running", new steps stream live
7. When complete, all turns should be visible with separators

## Test from Chrome Extension

1. Open a page with a registered project
2. Submit a batch via the extension
3. Wait for agent to complete — cursor shows completion badge with reply button
4. Click the reply button — floating input panel appears
5. Type a follow-up message and send
6. Observe: cursor transitions back to running state, new steps stream

## Key Files

| Component | File | What Changed |
|-----------|------|-------------|
| Adapter | `agent-orchestrator/.../adapters/claude_code_sdk.py` | `session_id`, `resume()`, refactored streaming |
| Adapter Base | `agent-orchestrator/.../adapters/base.py` | Abstract `resume()` |
| Orchestration | `agent-orchestrator/.../services/batch_processor.py` | `continue_agent()` |
| API | `agent-orchestrator/.../api/agents.py` | `POST /continue`, multi-trace |
| Models | `agent-orchestrator/.../models/agent.py` | `ContinueRequest` |
| Electron IPC | `electron-app/src/main/index.ts`, `preload.ts` | `continue-agent` handler |
| Electron UI | `electron-app/src/renderer/pages/AgentTrace.tsx` | Input bar, multi-trace |
| Extension | `chrome-extension/.../AgentCursors.tsx` | Reply button, input panel |
| Extension | `chrome-extension/.../AgentStatusPanel.tsx` | New status panel (P3) |
