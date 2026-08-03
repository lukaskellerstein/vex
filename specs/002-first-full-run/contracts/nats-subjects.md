# Contract: NATS Subject Hierarchy

**Branch**: `002-first-full-run` | **Date**: 2026-03-30

## Existing Subjects (No Changes)

These subjects are already defined and used in the codebase. This feature wires them up with real data instead of stubs.

### Agent Status Events

**Subject**: `vex.agent.{agent_id}.status`

**Publisher**: AgentManager (agent_manager.py)

**Subscribers**: Chrome extension, Electron UI

**Payload**:

```json
{
    "agent_id": "string (UUID)",
    "status": "registered | starting | running | stopping | stopped | error",
    "timestamp": "ISO 8601"
}
```

### Task Progress Events (New — to be used by SDK adapter)

**Subject**: `vex.task.{task_id}.progress`

**Publisher**: ClaudeCodeSDKAdapter (during task execution)

**Subscribers**: Chrome extension, Electron UI

**Payload**:

```json
{
    "task_id": "string (UUID)",
    "agent_id": "string (UUID)",
    "type": "text | tool_use | thinking | result",
    "content": "string (log line or summary)",
    "timestamp": "ISO 8601"
}
```

### Task Completion Events

**Subject**: `vex.task.{task_id}.complete`

**Publisher**: ClaudeCodeSDKAdapter (on task finish)

**Subscribers**: Chrome extension, Electron UI

**Payload**:

```json
{
    "task_id": "string (UUID)",
    "agent_id": "string (UUID)",
    "status": "completed | failed",
    "result": "string | null (code changes summary)",
    "error": "string | null",
    "cost_usd": "number | null",
    "duration_ms": "number | null",
    "timestamp": "ISO 8601"
}
```

## Port Configuration

| Service | Default Port | Configurable |
|---------|-------------|-------------|
| NATS core | 4222 | Yes (Settings page) |
| NATS WebSocket | 4223 | Yes (Settings page) |
| AgentManager REST | 8420 | Yes (Settings page) |
