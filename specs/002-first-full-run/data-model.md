# Data Model: First Full Run

**Branch**: `002-first-full-run` | **Date**: 2026-03-30

## Existing Entities (No Changes)

The following entities already exist in the SQLite schema and Pydantic models. This feature does not modify their structure.

### Project
- `id` (UUID), `name`, `path`, `framework`, `dev_command`, `dev_port`
- `package_manager`, `styling_approach`, `status` (ProjectStatus enum)
- `dev_server_url`, `created_at`, `updated_at`

### Agent
- `id` (UUID), `name`, `type`, `tier` (1=SDK, 2=CLI, 3=External)
- `capabilities` (JSON list), `status` (AgentStatus enum)
- `pid`, `project_id`, `last_heartbeat`, `config` (JSON), `created_at`
- **Status transitions**: registered → starting → running → stopping → stopped | error

### Task
- `id` (UUID), `project_id`, `agent_id`, `type`, `status` (TaskStatus enum)
- `prompt`, `context` (JSON), `result` (JSON), `error`
- `created_at`, `assigned_at`, `completed_at`
- **Status transitions**: pending → assigned → in_progress → completed | failed

### Batch
- `id` (UUID), `project_id`, `page_url`, `page_title`
- `action_count`, `status`, `created_at`

### Action
- `id` (UUID), `batch_id`, `type` (12 action types), `selector`
- `data` (JSON — type-specific metadata), `screenshot_before`, `screenshot_after`

## New Runtime State (In-Memory Only)

These are not persisted to SQLite. They exist only in process memory during runtime.

### ManagedProcess (Electron — TypeScript)
Already exists in `process-manager.ts`. No schema change needed.
- `name`: string (e.g., "nats-server", "agent-manager")
- `process`: ChildProcess | null
- `restartCount`: number (max 3)

### NATSProcessState (Electron — new tracking)
- `pid`: number | null — OS process ID of spawned nats-server
- `port`: number — configured NATS port (default 4222)
- `wsPort`: number — configured WebSocket port (default 4223)
- `healthy`: boolean — last known health status
- `pidFilePath`: string — path to `~/.vex/nats.pid`

### SDKAgentSession (Agent-Orchestrator — Python, in adapter)
Runtime state for each active Claude Agent SDK session:
- `agent_id`: str (UUID)
- `client`: ClaudeSDKClient instance
- `session_id`: str | None (for resume capability)
- `status`: "idle" | "running" | "completed" | "failed"
- `current_task_id`: str | None
- `project_path`: str

## Entity Relationships

```
Project 1──* Batch 1──* Action
Project 1──* Agent
Agent 1──* Task
Batch 1──* Task (via project_id + prompt referencing batch)
```

No relationship changes for this feature.

## State Machine: Agent Lifecycle (Updated)

```
registered ──start()──→ starting ──SDK client created──→ running
    running ──send_task()──→ running (task in progress)
    running ──task completes──→ running (idle)
    running ──stop()──→ stopping ──SDK client closed──→ stopped
    running ──error──→ error
    error ──restart()──→ starting
```

The key change: `starting` now means "creating a `ClaudeSDKClient` async context" instead of "logging a stub message".
