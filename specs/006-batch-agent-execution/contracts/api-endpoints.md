# API Contracts: Batch Agent Execution

**Feature**: 006-batch-agent-execution
**Date**: 2026-03-30

## New Endpoints

### GET /api/projects/{project_id}/agents

List all agents for a specific project, ordered by creation time (most recent first).

**Response** `200 OK`:

```json
{
  "agents": [
    {
      "id": "abc123",
      "name": "agent-a1b2c3d4-0",
      "type": "claude-code-sdk",
      "status": "running",
      "project_id": "proj-1",
      "tasks_completed": 0,
      "tasks_failed": 0,
      "total_cost_usd": 0.0,
      "created_at": "2026-03-30T12:00:00Z"
    }
  ],
  "summary": {
    "total": 5,
    "running": 2,
    "completed": 2,
    "failed": 1
  }
}
```

### GET /api/projects/{project_id}/batches/{batch_id}/tasks

List all tasks for a specific batch.

**Response** `200 OK`:

```json
{
  "tasks": [
    {
      "id": "task-1",
      "batch_id": "batch-1",
      "agent_id": "abc123",
      "type": "code-edit",
      "status": "completed",
      "prompt": "...",
      "result": "...",
      "error": null,
      "created_at": "2026-03-30T12:00:00Z",
      "completed_at": "2026-03-30T12:01:30Z"
    }
  ]
}
```

### GET /api/agents/{agent_id}/steps

Get structured execution steps for a specific agent.

**Response** `200 OK`:

```json
{
  "agent_id": "abc123",
  "status": "running",
  "steps": [
    {
      "index": 0,
      "type": "text",
      "content": "I'll analyze the project structure first...",
      "timestamp": "2026-03-30T12:00:01Z",
      "status": "past"
    },
    {
      "index": 1,
      "type": "tool_use",
      "content": "Read: src/components/Button.tsx",
      "timestamp": "2026-03-30T12:00:03Z",
      "status": "past"
    },
    {
      "index": 2,
      "type": "tool_use",
      "content": "Edit: src/components/Button.tsx",
      "timestamp": "2026-03-30T12:00:08Z",
      "status": "current"
    }
  ]
}
```

**Response when agent not found or no steps** `200 OK`:

```json
{
  "agent_id": "abc123",
  "status": "unknown",
  "steps": []
}
```

## Modified Endpoints

### POST /api/projects/{project_id}/batches (existing)

**Change**: After successful batch creation, the endpoint fires `asyncio.create_task(batch_processor.process_batch(project_id, batch_id))` to trigger asynchronous processing.

**Response**: Unchanged — still returns `BatchSummary` immediately.

## IPC Handlers (Electron)

| Handler | HTTP Target | Purpose |
|---------|-------------|---------|
| `get-project-agents` | `GET /api/projects/{projectId}/agents` | List agents for project |
| `get-batch-tasks` | `GET /api/projects/{projectId}/batches/{batchId}/tasks` | List tasks for batch |
| `get-agent-steps` | `GET /api/agents/{agentId}/steps` | Get agent execution steps |

## Preload API (Electron)

```typescript
electronAPI.getProjectAgents(projectId: string): Promise<AgentsResponse>
electronAPI.getBatchTasks(projectId: string, batchId: string): Promise<TasksResponse>
electronAPI.getAgentSteps(agentId: string): Promise<StepsResponse>
```
