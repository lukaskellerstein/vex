# API Contract: Continue Agent Conversation

**Branch**: `007-continue-agent-conversation` | **Date**: 2026-04-04

## POST /api/agents/{agent_id}/continue

Continue a conversation with a finished agent by sending a follow-up message.

### Request

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | ID of the agent to continue |

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `message` | string | Yes | Non-empty (min 1 char) | Follow-up message to send to the agent |

**Example**:

```json
POST /api/agents/abc-123/continue
{
  "message": "Fix the CSS alignment issue you introduced in the header component"
}
```

### Responses

#### 200 OK — Continuation started

Agent has been accepted for continuation. Steps will stream via NATS on existing subjects.

```json
{
  "status": "resuming",
  "agent_id": "abc-123"
}
```

#### 404 Not Found — Agent does not exist

```json
{
  "detail": "Agent abc-123 not found"
}
```

#### 409 Conflict — Agent is currently running

```json
{
  "detail": "Agent abc-123 is currently running"
}
```

#### 422 Unprocessable Entity — Invalid request

```json
{
  "detail": [
    {
      "loc": ["body", "message"],
      "msg": "String should have at least 1 character",
      "type": "string_too_short"
    }
  ]
}
```

### Side Effects

1. Agent status transitions: `terminal → running`
2. New task row created with type `"continue"`
3. New trace row created for this turn
4. NATS events emitted on existing subjects:
   - `vex.agent.{agent_id}.status` — status changes
   - `vex.agent.{agent_id}.step` — execution steps
   - `vex.task.{task_id}.progress` — task progress

---

## GET /api/agents/{agent_id}/trace (modified)

Returns **all** traces for the agent ordered chronologically, enabling multi-turn history display.

### Current Behavior (before this feature)

Returns a single trace object.

### New Behavior

Returns an array of traces (one per turn: initial run + each continuation).

**Response** (JSON):

```json
{
  "agent_id": "abc-123",
  "traces": [
    {
      "id": "trace-001",
      "batch_id": "batch-xyz",
      "agent_id": "abc-123",
      "agent_name": "Agent 1",
      "agent_model": "claude-sonnet-4-5-20250514",
      "prompt": "Original task prompt...",
      "status": "completed",
      "total_duration_ms": 45000,
      "total_cost_usd": 0.12,
      "total_tokens": 8500,
      "input_tokens": 6000,
      "output_tokens": 2500,
      "steps": [ ... ],
      "created_at": "2026-04-04T10:00:00Z",
      "completed_at": "2026-04-04T10:00:45Z"
    },
    {
      "id": "trace-002",
      "batch_id": null,
      "agent_id": "abc-123",
      "agent_name": "Agent 1",
      "agent_model": "claude-sonnet-4-5-20250514",
      "prompt": "Fix the CSS alignment issue...",
      "status": "completed",
      "total_duration_ms": 30000,
      "total_cost_usd": 0.08,
      "total_tokens": 6200,
      "input_tokens": 4500,
      "output_tokens": 1700,
      "steps": [ ... ],
      "created_at": "2026-04-04T10:05:00Z",
      "completed_at": "2026-04-04T10:05:30Z"
    }
  ]
}
```

### Breaking Change

The response shape changes from a single trace object to `{ agent_id, traces: [...] }`. The Electron app's `fetchPersistedTrace()` and `getAgentTraceByAgent()` IPC handler must be updated to handle the new format.

---

## IPC Contract: Electron App

### `continueAgent(agentId: string, message: string) → Promise<{ status: string, agent_id: string }>`

New IPC method exposed via `window.electronAPI.continueAgent()`.

**Electron main process**: Calls `POST /api/agents/{agentId}/continue` with `{ message }`.

**Preload bridge**:

```typescript
continueAgent: (agentId: string, message: string) =>
  ipcRenderer.invoke("continue-agent", agentId, message)
```
