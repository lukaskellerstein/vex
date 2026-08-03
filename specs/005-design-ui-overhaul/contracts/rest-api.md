# REST API Contract: New/Modified Backend Endpoints

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30

## New Endpoints

### Activity

#### `GET /api/activity`

Query activity event timeline.

**Query Parameters**:
- `project_id` (optional): Filter by project
- `type` (optional): Filter by event type (batch_submitted, batch_completed, etc.)
- `since` (optional): ISO 8601 timestamp — return events after this time
- `limit` (optional, default 100): Max events to return

**Response**: `ActivityEvent[]` sorted by `created_at DESC`

#### `GET /api/activity/stats`

Aggregate activity statistics.

**Query Parameters**:
- `since` (optional): ISO 8601 timestamp — compute stats from this time

**Response**:

```json
{
  "completed_batches": 12,
  "failed_batches": 2,
  "total_actions": 47,
  "active_agents": 2,
  "total_cost_usd": 0.32
}
```

### Agent Traces

#### `GET /api/batches/{batch_id}/trace`

Get the agent execution trace for a batch.

**Response**: `AgentTrace` with nested `steps[]` sorted by `sequence_index ASC`

**404**: If no trace exists for this batch.

### Agent Logs

#### `GET /api/agents/{agent_id}/logs`

Get runtime log entries for an agent.

**Query Parameters**:
- `limit` (optional, default 200): Max log lines
- `offset` (optional, default 0): Pagination offset

**Response**: `LogEntry[]`

```json
[
  {
    "timestamp": "2026-03-30T14:22:01Z",
    "level": "info",
    "message": "Agent started processing batch abc123"
  }
]
```

### Storage

#### `GET /api/storage/stats`

Get storage usage statistics.

**Response**:

```json
{
  "database_bytes": 1048576,
  "screenshots_bytes": 52428800,
  "total_bytes": 53477376
}
```

#### `DELETE /api/storage/screenshots`

Clear all screenshot files.

**Response**: `{"deleted": 42}`

### Tasks (extension)

#### `GET /api/tasks`

List all tasks (not just pending).

**Query Parameters**:
- `project_id` (optional): Filter by project
- `status` (optional): Filter by status
- `limit` (optional, default 100)

**Response**: `Task[]` sorted by `created_at DESC`

## Modified Endpoints

### `GET /api/projects/{id}/batches`

**Change**: Response now includes `duration_ms`, `cost_usd`, `error_message`, and `agent_id` fields on each batch summary.

### `GET /api/agents`

**Change**: Response now includes `tasks_completed`, `tasks_failed`, and `total_cost_usd` fields on each agent.

### `GET /api/agents/{agent_id}`

**Change**: Same additional fields as list endpoint.
