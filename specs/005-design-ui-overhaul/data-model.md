# Data Model: Electron App UI Overhaul

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30

## Existing Entities (schema changes needed)

### Project (extend existing)

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | existing |
| name | TEXT | existing |
| path | TEXT UNIQUE | existing |
| framework | TEXT | existing |
| dev_command | TEXT | existing |
| dev_port | INTEGER | existing |
| package_manager | TEXT | existing |
| styling_approach | TEXT | existing |
| status | TEXT | existing (idle/starting/running/stopping/error) |
| dev_server_pid | INTEGER | existing |
| dev_server_url | TEXT | existing |
| created_at | TEXT | existing |
| updated_at | TEXT | existing |

No schema changes needed. `last_activity_at` will be computed via query JOIN on batches.

### Batch (extend existing)

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | existing |
| project_id | TEXT FK | existing |
| page_url | TEXT | existing |
| page_title | TEXT | existing |
| action_count | INTEGER | existing |
| status | TEXT | existing (pending/processing/completed/failed) |
| submitted_at | TEXT | existing |
| completed_at | TEXT | existing |
| **duration_ms** | **INTEGER** | **NEW** — elapsed time from submit to complete |
| **cost_usd** | **REAL** | **NEW** — total cost of agent processing |
| **error_message** | **TEXT** | **NEW** — error details if status=failed |
| **agent_id** | **TEXT FK** | **NEW** — agent that processed this batch |

### Agent (extend existing)

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | existing |
| name | TEXT | existing |
| type | TEXT | existing |
| tier | INTEGER | existing |
| capabilities | TEXT (JSON) | existing |
| status | TEXT | existing |
| pid | INTEGER | existing |
| project_id | TEXT FK | existing |
| last_heartbeat | TEXT | existing |
| config | TEXT (JSON) | existing |
| created_at | TEXT | existing |
| **tasks_completed** | **INTEGER DEFAULT 0** | **NEW** — running counter |
| **tasks_failed** | **INTEGER DEFAULT 0** | **NEW** — running counter |
| **total_cost_usd** | **REAL DEFAULT 0** | **NEW** — cumulative cost |

### Task (no changes)

Existing schema is sufficient.

## New Entities

### ActivityEvent

Stores cross-component events for the activity timeline.

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | UUID |
| type | TEXT NOT NULL | batch_submitted, batch_completed, batch_failed, task_started, task_completed, task_failed, agent_started, agent_stopped, agent_error, server_started, server_stopped, server_error |
| project_id | TEXT FK | nullable — some events are project-independent |
| project_name | TEXT | denormalized for fast query |
| agent_id | TEXT FK | nullable |
| agent_name | TEXT | denormalized |
| summary | TEXT NOT NULL | human-readable event description |
| meta | TEXT (JSON) | nullable — batch_id, action_count, cost_usd, etc. |
| created_at | TEXT NOT NULL | ISO 8601 timestamp |

**Indexes**: `idx_activity_created` on `created_at DESC`, `idx_activity_project` on `project_id`, `idx_activity_type` on `type`.

### AgentTrace

Stores the full execution trace for an agent processing a batch.

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | UUID |
| batch_id | TEXT FK UNIQUE | one trace per batch |
| agent_id | TEXT FK | agent that executed |
| agent_name | TEXT | denormalized |
| agent_model | TEXT | e.g., "claude-sonnet-4-6" |
| status | TEXT | running, completed, failed |
| total_duration_ms | INTEGER | |
| total_cost_usd | REAL | |
| total_tokens | INTEGER | |
| created_at | TEXT NOT NULL | |
| completed_at | TEXT | |

### TraceStep

Individual steps within an agent trace.

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PK | UUID |
| trace_id | TEXT FK | references agent_traces |
| sequence_index | INTEGER | ordering |
| type | TEXT NOT NULL | thinking, text, tool_call, tool_result, diff, subagent_spawn, subagent_result, skill_invoke, skill_result, error |
| content | TEXT | main content (text, tool input, diff content) |
| metadata | TEXT (JSON) | type-specific data: tool_name, file_path, line numbers, etc. |
| duration_ms | INTEGER | nullable |
| token_count | INTEGER | nullable |
| created_at | TEXT NOT NULL | |

**Index**: `idx_trace_steps_trace` on `trace_id, sequence_index`.

## Entity Relationships

```text
Project 1──N Batch
Project 1──N Agent (via agent.project_id)
Batch   1──N Action (existing)
Batch   1──1 AgentTrace
AgentTrace 1──N TraceStep
Agent   1──N AgentTrace
Project 1──N ActivityEvent
Agent   1──N ActivityEvent
```

## State Transitions

### Project.status

```text
idle → starting → running → stopping → idle
                → error → idle
```

### Batch.status

```text
pending → processing → completed
                     → failed
```

### Agent.status

```text
registered → starting → running → stopping → stopped
                      → error → starting (restart)
```

### AgentTrace.status

```text
running → completed
        → failed
```
