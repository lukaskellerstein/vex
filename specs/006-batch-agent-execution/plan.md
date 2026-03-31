# Implementation Plan: Wire Batch Submission to Agent Execution

**Branch**: `006-batch-agent-execution` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-batch-agent-execution/spec.md`

## Summary

Wire the existing batch submission pipeline to actual agent execution. When a batch is submitted via `POST /api/projects/{id}/batches`, the system automatically spawns one ephemeral `ClaudeSDKClient` agent per action, runs all agents in parallel via `asyncio.gather`, captures structured execution steps (text, tool_use, tool_result, error, completed), persists them to the existing `agent_traces`/`trace_steps` tables, and updates batch/agent/task status throughout. The Electron app's Project Detail page adds an Agents tab with polling-based live status and a step timeline detail view.

## Technical Context

**Language/Version**: Python 3.11+ (agent-orchestrator), TypeScript 5.7+ (Electron app)
**Primary Dependencies**: FastAPI 0.115+, Claude Agent SDK (claude_agent_sdk), aiosqlite, React 18.3, Lucide React
**Storage**: SQLite (`~/.vex/vex.db`) — existing tables: batches, actions, agents, tasks, agent_traces, trace_steps
**Testing**: pytest + pytest-asyncio (backend), chrome-devtools MCP (Electron UI)
**Target Platform**: Linux/macOS desktop (Electron + local Python backend)
**Project Type**: Desktop app with local backend
**Performance Goals**: Batch processing starts within 2s of submission; parallel agent execution
**Constraints**: Agents are ephemeral (one per action); always use `ClaudeSDKClient` (never `query()`)
**Scale/Scope**: Single user, 1-10 actions per batch typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | Batch processor is internal to AgentManager (Python backend). No new components. Communication via existing REST + NATS. |
| II. Protocol-First, Deployment-Agnostic | PASS | New endpoints follow existing REST patterns. NATS subjects follow existing `vex.task.*` pattern. |
| III. Chrome Extension as Real Browser | PASS | No Chrome Extension changes in this feature. |
| IV. Structured Actions, Not Raw DOM | PASS | Batch processor consumes existing structured actions from DB. |
| V. Agent-Agnostic Orchestration | PASS | Batch processor uses `AgentManagerService` + adapter interface. Not hardcoded to Claude SDK. |
| VI. Developer Edit as Sketch | PASS | Existing system prompt in adapter handles this. |
| VII. Simplicity and YAGNI | PASS | One new service file (batch_processor.py), minimal changes to existing files. No speculative abstractions. |

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-batch-agent-execution/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
agent-orchestrator/src/agent_orchestrator/
├── adapters/
│   ├── base.py                    # AgentAdapter ABC (add steps to interface)
│   └── claude_code_sdk.py         # Add structured step capture to SDKAgentSession
├── api/
│   ├── batches.py                 # Add batch-tasks endpoint, trigger processing
│   └── agents.py                  # Add project-scoped agents, steps endpoints
├── db/
│   └── database.py                # Add batch_id column to tasks table
├── services/
│   ├── agent_manager.py           # Existing (used by batch processor)
│   └── batch_processor.py         # NEW — orchestration: parallel agents per batch
└── main.py                        # Import batch processor

electron-app/src/
├── main/
│   ├── index.ts                   # Add IPC handlers for project agents, batch tasks, agent steps
│   └── preload.ts                 # Expose new IPC methods
└── renderer/
    └── pages/
        └── ProjectDetail.tsx      # Add Agents tab with status list + step timeline
```

**Structure Decision**: Extends existing structure. One new file (`batch_processor.py`), modifications to 7 existing files.

## Complexity Tracking

No violations to justify.
