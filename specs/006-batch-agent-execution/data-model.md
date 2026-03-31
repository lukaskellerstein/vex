# Data Model: Wire Batch Submission to Agent Execution

**Feature**: 006-batch-agent-execution
**Date**: 2026-03-30

## Entity Changes

### Modified: `tasks` table

**Change**: Add `batch_id` column to link tasks to their originating batch.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| batch_id | TEXT | FK → batches(id) ON DELETE SET NULL, NULLABLE | Links task to originating batch. NULL for non-batch tasks. |

**Migration**: `ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL` with try/except guard for existing databases.

### Modified: `SDKAgentSession` (in-memory dataclass)

**Change**: Add `steps` field for structured execution step tracking.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| steps | list[dict] | [] | Structured steps captured during send_task(). Each dict has: type, content, timestamp, status |

### Existing (unchanged): `agent_traces` table

Already has all needed columns: id, batch_id (UNIQUE), agent_id, agent_name, agent_model, status, total_duration_ms, total_cost_usd, total_tokens, created_at, completed_at.

### Existing (unchanged): `trace_steps` table

Already has all needed columns: id, trace_id (FK → agent_traces), sequence_index, type, content, metadata (JSON), duration_ms, token_count, created_at.

## Step Type Mapping

| SDK Message Type | Step Type | Content | Status Logic |
|-----------------|-----------|---------|--------------|
| AssistantMessage → TextBlock | "text" | block.text (truncated to 2000 chars) | Previous step → "past", this → "current" |
| AssistantMessage → ToolUseBlock | "tool_use" | block.name + block.input summary | Previous step → "past", this → "current" |
| TaskProgressMessage | "progress" | progress description | "current" |
| ResultMessage (success) | "completed" | result summary + cost/duration | All steps → "past" |
| Exception | "error" | error message (classified) | All steps → "past" |

## State Transitions

### Batch Status

```
pending → processing → completed (all agents succeed)
                     → failed (any agent fails)
```

### Agent Status (in DB)

```
created → running → completed (task succeeds)
                  → failed (task errors)
                  → stopped (cleanup after completed/failed)
```

### Task Status

```
pending → in_progress → completed (agent finishes successfully)
                      → failed (agent errors)
```

## Relationships

```
batches 1──N actions        (existing)
batches 1──N tasks          (NEW via batch_id column)
batches 1──1 agent_traces   (existing, via batch_id UNIQUE)
agents  1──N tasks          (existing, via agent_id)
agent_traces 1──N trace_steps (existing, via trace_id)
```

## Data Flow

1. Batch submitted → `batches` row created (status: "pending")
2. Batch processor starts → batch status → "processing"
3. Per action: `agents` row created → `tasks` row created (with batch_id + agent_id)
4. Agent runs → `SDKAgentSession.steps` populated in real-time
5. Agent completes → `agent_traces` row + `trace_steps` rows persisted
6. Agent cleanup → agent status → "stopped", task status → "completed"/"failed"
7. All agents done → batch status → "completed"/"failed"
