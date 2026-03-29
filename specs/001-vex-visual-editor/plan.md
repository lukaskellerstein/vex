# Implementation Plan: Vex — Visual Web Development Tool

**Branch**: `001-vex-visual-editor` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-vex-visual-editor/spec.md`

## Summary

Vex is a four-component visual web development tool: Chrome Extension (visual editor in the real browser), AgentManager (Python orchestration service), NATS (real-time message bus), and Electron App (desktop shell). The developer points at elements, makes visual edits (select, annotate, edit DOM, resize, restyle, generate sections/images), and sends structured action batches to an AI agent that implements the changes in source code. The Chrome Extension already has a partial Select Mode implementation; this plan covers completing all six interaction modes, building the AgentManager, integrating NATS, and creating the Electron shell.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Chrome Extension, Electron App), Python 3.11+ (AgentManager)
**Primary Dependencies**: React 18, Vite, GSAP, CodeMirror (Extension); FastAPI, uvicorn, nats-py, SQLite via aiosqlite (AgentManager); Electron 30+, React (Desktop App); nats-server binary (NATS)
**Storage**: SQLite at `~/.vex/vex.db` (local), file storage at `~/.vex/data/{projectId}/` for screenshots
**Testing**: Vitest (Extension), pytest (AgentManager), Playwright (E2E)
**Target Platform**: Chrome 116+ (Extension), macOS/Linux/Windows (Electron), Linux/macOS (AgentManager)
**Project Type**: Desktop app + browser extension + backend service
**Performance Goals**: DOM edits < 200ms, generation round-trip < 30s, batch submission < 5s for 50 actions
**Constraints**: Batch size < 50MB, JPEG screenshots at 0.75 quality, single-user local deployment
**Scale/Scope**: Single developer, single machine, 1-5 concurrent projects

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | Plan maintains exactly four components: Electron, AgentManager, NATS, Chrome Extension. All communication via REST or NATS. |
| II. Protocol-First, Deployment-Agnostic | PASS | REST endpoints and NATS subjects defined identically for local and future k8s. No deployment-specific protocol. |
| III. Chrome Extension as Real Browser | PASS | Manifest V3 extension in real Chrome. No embedded browser. |
| IV. Structured Actions, Not Raw DOM | PASS | All 12 action types are typed and structured with selectors, metadata, and screenshots. No raw DOM dumps. |
| V. Agent-Agnostic Orchestration | PASS | AgentManager routes by capability, not agent identity. Three-tier system supports any agent. |
| VI. Developer Edit as Sketch | PASS | Agent interpretation rules treat edits as intent, not literal specs. Agent analyzes project first. |
| VII. Simplicity and YAGNI | PASS | V1 ships with one native adapter (claude-code-sdk). CLI wrapper and external bridge are minimal. No speculative features. |

**Gate result: PASS — all principles satisfied.**

## Project Structure

### Documentation (this feature)

```text
specs/001-vex-visual-editor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
chrome-extension/              # Chrome Extension (existing, partially built)
├── manifest.json
├── package.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   ├── App.tsx            # Main content script — mode switching
│   │   ├── index.tsx          # Shadow DOM entry point
│   │   ├── components/
│   │   │   ├── Overlay.tsx    # Existing: hover/selection highlights
│   │   │   ├── PopupDialog.tsx # Existing: instruction editor
│   │   │   ├── Toolbar.tsx    # NEW: floating mode toolbar
│   │   │   ├── EditMode.tsx   # NEW: DOM editing UI
│   │   │   ├── ResizeMode.tsx # NEW: resize handles + delta display
│   │   │   ├── StylePanel.tsx # NEW: style editor panel
│   │   │   ├── CopyStyle.tsx  # NEW: source/target style copy
│   │   │   └── VisibilityHelper.tsx # NEW: diagnostic overlay
│   │   ├── hooks/
│   │   │   ├── useSelectionState.ts  # Existing
│   │   │   ├── useHoverHighlight.ts  # Existing
│   │   │   ├── useScreenshot.ts      # Existing
│   │   │   ├── useActions.ts         # NEW: multi-type action recording
│   │   │   ├── useNatsClient.ts      # NEW: NATS WebSocket connection
│   │   │   └── useUndo.ts            # NEW: Ctrl+Z undo stack
│   │   ├── utils/
│   │   │   ├── metadata.ts    # Existing
│   │   │   ├── selector.ts    # Existing
│   │   │   ├── positioning.ts # Existing
│   │   │   ├── delta.ts       # NEW: semantic delta computation
│   │   │   └── dom-ops.ts     # NEW: DOM mutation helpers
│   │   └── styles/
│   │       └── content.css
│   ├── popup/
│   │   ├── App.tsx            # Enhanced: action list, project selector
│   │   └── components/
│   │       ├── BridgeStatus.tsx    # Existing → rename to ConnectionStatus
│   │       ├── SelectionList.tsx   # Existing → rename to ActionList
│   │       └── Controls.tsx       # Existing: enhanced with mode controls
│   └── shared/
│       ├── types.ts           # Enhanced: all 12 action types
│       └── messages.ts        # Enhanced: AgentManager URL, NATS config

agent-orchestrator/            # AgentManager (Python, new)
├── pyproject.toml
├── src/
│   └── agent_orchestrator/
│       ├── __init__.py
│       ├── main.py            # FastAPI app entry point
│       ├── api/
│       │   ├── projects.py    # Project CRUD endpoints
│       │   ├── batches.py     # Batch submission + retrieval
│       │   ├── agents.py      # Agent registration + lifecycle
│       │   ├── tasks.py       # Task CRUD + routing
│       │   └── config.py      # Global config endpoints
│       ├── models/
│       │   ├── project.py     # Project model + auto-detection
│       │   ├── batch.py       # Batch + Action models
│       │   ├── agent.py       # Agent model + health tracking
│       │   └── task.py        # Task model + state machine
│       ├── services/
│       │   ├── agent_manager.py   # Agent lifecycle + health monitoring
│       │   ├── task_router.py     # Capability-based task routing
│       │   ├── nats_service.py    # NATS pub/sub management
│       │   ├── project_detector.py # Framework/tooling auto-detection
│       │   └── screenshot_store.py # File-based screenshot storage
│       ├── adapters/
│       │   ├── base.py            # AgentAdapter interface
│       │   ├── claude_code_sdk.py # V1 native adapter
│       │   └── cli_wrapper.py     # Generic CLI wrapper (Tier 2)
│       └── db/
│           ├── database.py        # SQLite connection + migrations
│           └── migrations/        # Schema versioning
└── tests/
    ├── test_api/
    ├── test_services/
    └── test_adapters/

electron-app/                  # Electron Desktop App (new)
├── package.json
├── src/
│   ├── main/
│   │   ├── index.ts           # Electron main process
│   │   ├── process-manager.ts # Child process lifecycle (NATS, AgentManager, agents)
│   │   └── nats-manager.ts    # Embedded nats-server management
│   └── renderer/
│       ├── App.tsx             # React UI
│       ├── pages/
│       │   ├── ProjectList.tsx
│       │   ├── ProjectDetail.tsx
│       │   └── Settings.tsx
│       └── components/
│           ├── AgentPanel.tsx
│           ├── DevServerLog.tsx
│           └── StatusBar.tsx
└── tests/
```

**Structure Decision**: Multi-component monorepo with three top-level directories matching the four-component architecture (NATS is a binary, not source code). Chrome extension is partially built; agent-orchestrator and electron-app are new.

## Complexity Tracking

> No constitution violations — table not needed.
