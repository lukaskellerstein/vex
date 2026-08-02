# API Contracts: Subagent Drill-Down

## Endpoints

### GET /api/agents/{agent_id}/subagents

List all subagents for a given parent agent.

**Response**: `200 OK`

```json
[
  {
    "id": "abc123",
    "parent_agent_id": "agent-001",
    "subagent_id": "sdk-sub-001",
    "subagent_type": "Explore",
    "description": "Search for database schema files",
    "transcript_path": "/home/user/.claude/projects/.../session.jsonl",
    "started_at": "2026-04-07T10:00:00Z",
    "completed_at": "2026-04-07T10:00:45Z"
  }
]
```

**Response**: `404 Not Found` — parent agent does not exist.

**Notes**:
- Returns empty array `[]` if agent exists but has no subagents.
- Results ordered by `started_at` ascending.

---

### GET /api/agents/{agent_id}/subagents/{subagent_id}/transcript

Parse and return the transcript for a specific subagent as an array of trace steps.

**Path parameters**:
- `agent_id`: Parent agent ID
- `subagent_id`: The `id` from `subagent_metadata` table (NOT the SDK's internal subagent_id)

**Response**: `200 OK`

```json
{
  "subagent": {
    "id": "abc123",
    "subagent_type": "Explore",
    "description": "Search for database schema files",
    "started_at": "2026-04-07T10:00:00Z",
    "completed_at": "2026-04-07T10:00:45Z"
  },
  "steps": [
    {
      "id": "step-0",
      "sequence_index": 0,
      "type": "text",
      "content": "I'll search for database schema files...",
      "metadata": null,
      "duration_ms": null,
      "token_count": null,
      "created_at": "2026-04-07T10:00:01Z"
    },
    {
      "id": "step-1",
      "sequence_index": 1,
      "type": "tool_call",
      "content": null,
      "metadata": {
        "tool_name": "Glob",
        "tool_input": {"pattern": "**/schema*.py"}
      },
      "duration_ms": null,
      "token_count": null,
      "created_at": "2026-04-07T10:00:02Z"
    },
    {
      "id": "step-2",
      "sequence_index": 2,
      "type": "tool_result",
      "content": "agent-orchestrator/src/agent_orchestrator/db/database.py",
      "metadata": {
        "tool_name": "Glob",
        "is_error": false
      },
      "duration_ms": null,
      "token_count": null,
      "created_at": "2026-04-07T10:00:02Z"
    }
  ]
}
```

**Response**: `404 Not Found` — subagent does not exist.

**Response**: `422 Unprocessable Entity` — transcript file missing or unreadable.

```json
{
  "detail": "Transcript file not found at /path/to/file.jsonl"
}
```

**Notes**:
- Steps are returned in transcript order (sequence_index ascending).
- Malformed JSONL lines are skipped; a warning is included in the response if any lines were skipped.
- `start` and `config` record types from the JSONL are excluded from steps.

## IPC Bridge (Electron)

### Preload Methods

```typescript
// List subagents for an agent
getAgentSubagents(agentId: string): Promise<SubagentMetadata[]>

// Get parsed transcript for a subagent
getSubagentTranscript(agentId: string, subagentId: string): Promise<SubagentTranscriptResponse>
```

### NATS Events (already existing, no changes needed)

| Subject | Event | Payload |
|---------|-------|---------|
| `vex.agent.{agent_id}.hooks` | SubagentStart | `{hook, agent_id, subagent_id, subagent_type, timestamp}` |
| `vex.agent.{agent_id}.hooks` | SubagentStop | `{hook, agent_id, subagent_id, subagent_type, transcript_path, timestamp}` |
