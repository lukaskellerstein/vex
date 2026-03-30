# Implementation Plan: First Full Run

**Branch**: `002-first-full-run` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-first-full-run/spec.md`

## Summary

Enable the first end-to-end run of Vex by: (1) ensuring the Electron app reliably starts and manages the bundled NATS server binary as a child process, and (2) replacing the stub `ClaudeCodeSDKAdapter` in the agent-orchestrator with a real integration using the Claude Agent SDK (`ClaudeSDKClient`). Together, these allow a developer to make a visual edit in the Chrome extension and receive a real AI-generated code change proposal.

## Technical Context

**Language/Version**: TypeScript 5.x (Electron app), Python 3.11+ (agent-orchestrator)
**Primary Dependencies**: Electron 30, React 18, FastAPI, uvicorn, nats-py 2.9, claude-agent-sdk 0.1.52+
**Storage**: SQLite (`~/.vex/vex.db`), file-based screenshots (`~/.vex/data/`)
**Testing**: Manual via Electron launch + Chrome extension; pytest for agent-orchestrator unit tests
**Target Platform**: Desktop (Linux, macOS, Windows) — local deployment mode
**Project Type**: Desktop app (Electron) + Python backend service
**Performance Goals**: NATS reachable within 5s of launch; agent response within 2 minutes for single-element edits
**Constraints**: Single-user local mode; no TLS/auth on NATS; developer must have Claude API credentials
**Scale/Scope**: Single developer, single project, one agent at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | No new components. NATS management stays in Electron; SDK integration stays in AgentManager. |
| II. Protocol-First, Deployment-Agnostic | PASS | No protocol changes. Using existing REST endpoints and NATS subjects. |
| III. Chrome Extension as Real Browser | PASS | No changes to Chrome extension. |
| IV. Structured Actions, Not Raw DOM | PASS | No changes to action capture. Existing `ActionData` model used as-is. |
| V. Agent-Agnostic Orchestration | PASS | SDK adapter follows the `AgentAdapter` interface. Task routing via capabilities, not hardcoded identity. |
| VI. Developer Edit as Sketch | PASS | Agent receives structured actions + project context; interprets intent. |
| VII. Simplicity and YAGNI | PASS | No speculative features. Minimum viable integration for first run. |

**Architecture Constraints Check:**
- State ownership: AgentManager owns all state — PASS
- Storage: SQLite locally — PASS
- NATS WebSocket: Extension connects via native WS listener (port 4223) — PASS
- Port defaults: 8420 (REST), 4222 (NATS), 4223 (NATS WS) — PASS

**No violations. Gate passed.**

## Project Structure

### Documentation (this feature)

```text
specs/002-first-full-run/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
electron-app/
├── src/
│   ├── main/
│   │   ├── index.ts              # Main process entry + IPC handlers
│   │   ├── process-manager.ts    # NATS + AgentManager child process management
│   │   └── preload.ts            # IPC bridge
│   └── renderer/
│       ├── App.tsx               # Routing
│       ├── components/
│       │   ├── AgentPanel.tsx    # Agent monitoring
│       │   └── StatusBar.tsx     # NATS/AgentManager status display
│       └── pages/
│           ├── ProjectList.tsx
│           ├── ProjectDetail.tsx
│           └── Settings.tsx      # Port configuration

agent-orchestrator/
├── src/agent_orchestrator/
│   ├── main.py                   # FastAPI lifespan (wire NATS connect)
│   ├── adapters/
│   │   ├── base.py               # AgentAdapter ABC
│   │   ├── claude_code_sdk.py    # REPLACE STUB → real SDK integration
│   │   └── cli_wrapper.py        # Tier 2 CLI adapter (unchanged)
│   ├── services/
│   │   ├── agent_manager.py      # Agent lifecycle
│   │   ├── nats_service.py       # NATS pub/sub (already implemented)
│   │   └── task_router.py        # Capability-based routing
│   └── models/
│       ├── agent.py              # Agent, AgentStatus
│       └── task.py               # Task, TaskStatus
```

**Structure Decision**: Existing multi-component structure. No new directories needed. Changes are localized to `process-manager.ts` (hardening) and `claude_code_sdk.py` (rewrite).

## Complexity Tracking

> No violations — table not needed.
