# Implementation Plan: Full Run with Extension Fixes

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-full-run-with-extension-fixes/spec.md`

## Summary

Three workstreams: (1) Harden NATS child process management in the Electron app with port-conflict detection, orphan cleanup, and health checking. (2) Replace the stub `ClaudeCodeSDKAdapter` in the agent-orchestrator with a real `ClaudeSDKClient` integration. (3) Fix Chrome extension UI: add screenshot display in select-mode dialog, add hover borders in resize mode, make the style editor draggable with selection borders and integrated copy-style, and relocate the action list from the popup to the on-page toolbar.

## Technical Context

**Language/Version**: TypeScript 5.x (Electron app, Chrome extension), Python 3.11+ (agent-orchestrator)
**Primary Dependencies**: Electron 30, React 18, FastAPI, uvicorn, nats-py 2.9, claude-agent-sdk 0.1.52+, GSAP (animations), CodeMirror (editor)
**Storage**: SQLite (`~/.vex/vex.db`), file-based screenshots (`~/.vex/data/`)
**Testing**: Manual via Electron launch + Chrome extension; pytest for agent-orchestrator
**Target Platform**: Desktop (Linux, macOS, Windows) — local deployment mode; Chrome 116+ (extension)
**Project Type**: Desktop app (Electron) + Python backend + Chrome extension
**Performance Goals**: NATS reachable within 5s; hover borders <100ms; screenshot display <1s; agent response <2min
**Constraints**: Single-user local mode; no TLS/auth on NATS; shadow DOM isolation for extension
**Scale/Scope**: Single developer, single project, one agent at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | No new components. Changes within Electron, AgentManager, and Chrome Extension. |
| II. Protocol-First, Deployment-Agnostic | PASS | No protocol changes. Using existing REST + NATS subjects. |
| III. Chrome Extension as Real Browser | PASS | All extension changes run in real Chrome via Manifest V3 content script + shadow DOM. |
| IV. Structured Actions, Not Raw DOM | PASS | No changes to action capture format. Existing typed `ActionData` model used. |
| V. Agent-Agnostic Orchestration | PASS | SDK adapter follows `AgentAdapter` interface. Routing via capabilities. |
| VI. Developer Edit as Sketch | PASS | Agent receives structured actions + project context; interprets intent. |
| VII. Simplicity and YAGNI | PASS | All changes address concrete current requirements. No speculative features. |

**Architecture Constraints Check:**
- State ownership: AgentManager owns all state — PASS
- NATS WebSocket: Extension connects via native WS listener (port 4223) — PASS
- Port defaults: 8420, 4222, 4223 — PASS
- Tech stack: TS 5.x + React 18 for extension, Python for AgentManager — PASS

**No violations. Gate passed.**

## Project Structure

### Documentation (this feature)

```text
specs/003-full-run-with-extension-fixes/
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
│   │   ├── index.ts              # IPC handlers (add NATS status)
│   │   ├── process-manager.ts    # NATS management hardening
│   │   └── preload.ts            # IPC bridge (add NATS status)
│   └── renderer/
│       └── components/
│           ├── AgentPanel.tsx     # Task result display
│           └── StatusBar.tsx      # NATS status display

agent-orchestrator/
├── src/agent_orchestrator/
│   ├── main.py                   # Wire NATS connect in lifespan
│   ├── adapters/
│   │   └── claude_code_sdk.py    # REWRITE: stub → real SDK
│   └── api/
│       └── config.py             # Real NATS status in health endpoint

chrome-extension/
├── src/
│   ├── content/
│   │   ├── App.tsx               # Mode management (remove copyStyle mode)
│   │   ├── components/
│   │   │   ├── PopupDialog.tsx   # Add screenshot thumbnail display
│   │   │   ├── ResizeMode.tsx    # Add hover highlighting
│   │   │   ├── StylePanel.tsx    # Add draggable, selection border, copy-style button
│   │   │   ├── CopyStyle.tsx     # Refactor for style-panel integration
│   │   │   └── Toolbar.tsx       # Add expand chevron + action panel
│   │   └── styles/content.css    # New styles for hover, drag, action panel
│   └── popup/
│       └── components/
│           └── ActionList.tsx     # Remove (relocated to toolbar)
```

**Structure Decision**: Existing multi-component structure. No new directories. Changes localized to specific files in each component.

## Complexity Tracking

> No violations — table not needed.
