# Data Model: Continue Conversation with Finished Agent

**Branch**: `007-continue-agent-conversation` | **Date**: 2026-04-04

## Entities

### Agent (modified)

Existing entity. No schema changes required. State cycling behavior changes:

| Field | Type | Change |
|-------|------|--------|
| `status` | TEXT | Now cycles: `terminal → running → terminal` on continuation. Valid terminal states for continue: `completed`, `failed`, `stopped`. |
| `tasks_completed` | INTEGER | Incremented on each successful continuation turn |
| `tasks_failed` | INTEGER | Incremented on each failed continuation turn |

**State Transitions (extended)**:

```
created → starting → running → completed/failed/stopped
                                        ↓ (continue)
                                    running → completed/failed/stopped
                                        ↓ (continue again)
                                    running → ...
```

### Agent Trace (unchanged schema)

Existing entity. No schema changes. New behavior: multiple traces per agent (one per turn).

| Field | Type | Notes |
|-------|------|-------|
| `id` | TEXT PK | Unique per turn |
| `batch_id` | TEXT FK | May be NULL for continuation turns (no batch context) |
| `agent_id` | TEXT FK | Same agent_id across all turns |
| `agent_name` | TEXT | Same across turns |
| `agent_model` | TEXT | Same across turns |
| `status` | TEXT | Per-turn status |
| `total_duration_ms` | INTEGER | Per-turn duration |
| `total_cost_usd` | REAL | Per-turn cost |
| `total_tokens` | INTEGER | Per-turn tokens |
| `input_tokens` | INTEGER | Per-turn input tokens |
| `output_tokens` | INTEGER | Per-turn output tokens |
| `created_at` | TEXT | Turn start time |
| `completed_at` | TEXT | Turn end time |

**Ordering**: Traces for an agent ordered by `created_at ASC` to form chronological conversation.

### Task (modified behavior)

Existing entity. New task type for continuation turns.

| Field | Type | Change |
|-------|------|--------|
| `type` | TEXT | New value: `"continue"` (in addition to existing `"code-edit"`) |
| `batch_id` | TEXT FK | NULL for continuation tasks (not part of a batch) |
| `prompt` | TEXT | Contains the follow-up message |

### SDK Agent Session (in-memory, modified)

Runtime dataclass in the adapter. Modified to populate `session_id`.

| Field | Type | Change |
|-------|------|--------|
| `session_id` | `str \| None` | Now set to `"vex-{agent_id}"` during `start()` and `resume()` |

### Continue Request (new)

New Pydantic model for the continue endpoint request body.

| Field | Type | Validation |
|-------|------|------------|
| `message` | `str` | Required, non-empty (min_length=1) |

## Relationships

```
Agent (1) ──── (N) Agent Trace     # One trace per turn (initial + continuations)
Agent (1) ──── (N) Task            # One task per turn
Agent Trace (1) ── (N) Trace Step  # Steps within a single turn
```

## Key Constraints

1. An agent can only be continued if its current status is terminal (`completed`, `failed`, `stopped`)
2. Only one continuation can run at a time per agent (enforced by checking status is not `running`)
3. `batch_id` on continuation traces/tasks is NULL since continuations are not batch-initiated
4. Session identity (`vex-{agent_id}`) must be consistent across all turns for context persistence
