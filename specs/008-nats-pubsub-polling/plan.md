# Implementation Plan: Replace HTTP Polling with NATS Pub/Sub

**Branch**: `008-nats-pubsub-polling` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-nats-pubsub-polling/spec.md`

## Summary

Replace 7+ `setInterval` polling loops (200ms–10s) across the Electron app and Chrome extension with NATS pub/sub event-driven invalidation. The backend publishes state-change events after DB commits; the Electron main process subscribes via NATS WebSocket and forwards to the renderer via IPC; React components listen for events and re-fetch data on demand. This eliminates unnecessary HTTP requests, React re-renders, and CPU usage at idle.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.7+ (Electron + Chrome Extension)
**Primary Dependencies**: FastAPI, nats-py (backend); Electron 30, React 18, nats.ws (frontend)
**Storage**: SQLite via aiosqlite (WAL mode) at `~/.vex/vex.db`
**Testing**: pytest + pytest-asyncio (backend); MCP chrome-devtools (Electron/Extension UI)
**Target Platform**: Linux/macOS/Windows desktop (Electron) + Chrome 116+ (Extension)
**Project Type**: Desktop app + browser extension + Python API backend
**Performance Goals**: UI updates within 1 second of backend state change; zero polling at idle
**Constraints**: NATS max payload 8MB; WebSocket transport only (no TLS in dev)
**Scale/Scope**: Single-user local deployment; ~15 files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | Uses existing NATS bus between AgentManager and Electron/Extension. No new components. |
| II. Protocol-First, Deployment-Agnostic | PASS | New NATS subjects follow existing naming convention. Same subjects in local and k8s. |
| III. Chrome Extension as Real Browser | PASS | Extension continues using nats.ws WebSocket — no embedded browser changes. |
| IV. Structured Actions, Not Raw DOM | N/A | No visual editing changes. |
| V. Agent-Agnostic Orchestration | N/A | No agent routing changes. |
| VI. Developer Edit as Sketch | N/A | No edit interpretation changes. |
| VII. Simplicity and YAGNI | PASS | Replaces polling with events using existing infrastructure. No new abstractions beyond what's needed. |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/008-nats-pubsub-polling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
agent-orchestrator/src/agent_orchestrator/
├── api/
│   ├── projects.py        # Add publish calls for project CRUD
│   ├── agents.py          # Add publish calls for agent register/deregister
│   └── batches.py         # Add publish call for batch submission
├── services/
│   └── batch_processor.py # Add activity event publishes
└── adapters/
    └── claude_code_sdk.py # Slow log polling sleep

electron-app/src/
├── main/
│   ├── index.ts           # Add 6 IPC handlers (3 subscribe + 3 unsubscribe)
│   └── preload.ts         # Add 9 API methods (3 subscribe + 3 unsubscribe + 3 on*)
└── renderer/
    ├── electron.d.ts      # Add 9 type declarations
    ├── App.tsx             # Add global NATS subscriptions
    ├── pages/
    │   ├── Projects.tsx       # Replace poll → event listener
    │   ├── ProjectDetail.tsx  # Replace 2 polls → event listeners
    │   └── Activity.tsx       # Replace poll → event listener
    └── components/project-detail/
        ├── BatchList.tsx      # Replace poll → event listener
        └── DevServerLogs.tsx  # Slow 1s → 3s

chrome-extension/src/content/components/
└── AgentCursors.tsx       # Replace HTTP poll → NATS subscription
```

**Structure Decision**: All changes are within existing files and directories. No new modules or structural changes needed.
