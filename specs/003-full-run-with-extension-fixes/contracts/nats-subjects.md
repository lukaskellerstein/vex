# Contract: NATS Subject Hierarchy

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## Subjects

### Agent Status (existing)

- **Subject**: `vex.agent.{agent_id}.status`
- **Payload**: `{ agent_id, status, timestamp }`

### Task Progress (new)

- **Subject**: `vex.task.{task_id}.progress`
- **Payload**: `{ task_id, agent_id, type: "text|tool_use|thinking|result", content, timestamp }`

### Task Completion (new)

- **Subject**: `vex.task.{task_id}.complete`
- **Payload**: `{ task_id, agent_id, status: "completed|failed", result, error, cost_usd, duration_ms, timestamp }`

## Ports

| Service | Default | Configurable |
|---------|---------|-------------|
| NATS core | 4222 | Yes |
| NATS WebSocket | 4223 | Yes |
| AgentManager REST | 8420 | Yes |
