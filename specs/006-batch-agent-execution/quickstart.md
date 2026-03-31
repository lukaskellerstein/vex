# Quickstart: Wire Batch Submission to Agent Execution

**Feature**: 006-batch-agent-execution
**Date**: 2026-03-30

## Prerequisites

- Python 3.11+ with `uv` installed
- Node.js 18+ with `npm`
- Claude Agent SDK (`claude-agent-sdk >= 0.1.52`)
- ANTHROPIC_API_KEY set in environment (or `claude login` completed)

## Setup

```bash
# Install dependencies
cd agent-orchestrator && uv sync
cd electron-app && npm install

# Start dev environment
./dev-setup.sh
```

## Verify It Works

### 1. Submit a batch (simulating Chrome Extension)

```bash
# Create a project first
curl -s -X POST http://localhost:8420/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "test-project", "path": "/path/to/your/web/project"}' | jq .

# Submit a batch with 2 actions
curl -s -X POST http://localhost:8420/api/projects/{PROJECT_ID}/batches \
  -H "Content-Type: application/json" \
  -d '{
    "page_url": "http://localhost:3000",
    "page_title": "Test Page",
    "actions": [
      {
        "type": "editText",
        "selector": "h1.title",
        "data": {"newText": "Welcome to Vex"},
        "instruction": "Change the main heading"
      },
      {
        "type": "styleChange",
        "selector": ".hero-section",
        "data": {"backgroundColor": "#1e1e2e"},
        "instruction": "Make the hero section dark"
      }
    ]
  }' | jq .
```

### 2. Check agent processing

```bash
# Watch AO logs for agent activity
tail -f /tmp/vex-logs/ao.log

# Check agents for the project
curl -s http://localhost:8420/api/projects/{PROJECT_ID}/agents | jq .

# Check steps for a specific agent
curl -s http://localhost:8420/api/agents/{AGENT_ID}/steps | jq .
```

### 3. Verify in Electron

1. Open the Electron app
2. Navigate to the project's detail page
3. Click the "Agents" tab
4. Observe agents appearing with "running" status
5. Click an agent to see the step-by-step timeline
6. Wait for completion — status should transition to "completed"

## Key Files

| File | What to look at |
|------|----------------|
| `agent-orchestrator/.../services/batch_processor.py` | Core orchestration logic |
| `agent-orchestrator/.../adapters/claude_code_sdk.py` | Step capture in SDKAgentSession |
| `agent-orchestrator/.../api/batches.py` | Trigger point (asyncio.create_task) |
| `agent-orchestrator/.../api/agents.py` | New endpoints (project agents, steps) |
| `electron-app/.../pages/ProjectDetail.tsx` | Agents tab + step timeline UI |
