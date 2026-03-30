# Data Model: Full Run with Extension Fixes

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## Existing Entities (No Schema Changes)

All SQLite tables and Pydantic models remain unchanged. This feature modifies behavior, not data structures.

### Project
- `id`, `name`, `path`, `framework`, `dev_command`, `dev_port`, `package_manager`, `styling_approach`, `status`, `created_at`, `updated_at`

### Agent
- `id`, `name`, `type`, `tier`, `capabilities`, `status`, `pid`, `project_id`, `last_heartbeat`, `config`, `created_at`
- Status transitions: registered → starting → running → stopping → stopped | error

### Task
- `id`, `project_id`, `agent_id`, `type`, `status`, `prompt`, `context`, `result`, `error`, `created_at`, `assigned_at`, `completed_at`
- Status transitions: pending → assigned → in_progress → completed | failed

### Batch / Action
- Batch: `id`, `project_id`, `page_url`, `page_title`, `action_count`, `status`, `created_at`
- Action: `id`, `batch_id`, `type`, `selector`, `data`, `screenshot_before`, `screenshot_after`

## New Runtime State (In-Memory Only)

### NATSProcessState (Electron — process-manager.ts)
- `pid`: number | null
- `port`: number (default 4222)
- `wsPort`: number (default 4223)
- `healthy`: boolean
- `pidFilePath`: string (`~/.vex/nats.pid`)

### SDKAgentSession (Python — claude_code_sdk.py)
- `agent_id`: str
- `client`: ClaudeSDKClient instance
- `session_id`: str | None
- `status`: "idle" | "running" | "completed" | "failed"
- `current_task_id`: str | None
- `project_path`: str

### ActionPanelState (Chrome Extension — Toolbar)
- `expanded`: boolean (chevron toggle state)
- Actions accessed from existing `useActions` hook — no new data structure

### StylePanelDragState (Chrome Extension — StylePanel)
- `isDragging`: boolean
- `dragOffset`: { x: number, y: number }
- `position`: { left: number, top: number } | null (null = auto-positioned)

## Entity Relationships

```
Project 1──* Batch 1──* Action
Project 1──* Agent
Agent 1──* Task
Batch 1──* Task (via project_id + prompt referencing batch)
```

No relationship changes.
