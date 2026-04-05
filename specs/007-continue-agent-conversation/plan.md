# Implementation Plan: Continue Conversation with Finished Agent

**Branch**: `007-continue-agent-conversation` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-continue-agent-conversation/spec.md`

## Summary

Enable multi-turn agent conversations by leveraging the Claude Agent SDK's native session persistence. Users can send follow-up messages to completed/failed agents from the Electron trace view and Chrome Extension cursor UI. The backend adds a `resume()` adapter method and `/api/agents/{id}/continue` endpoint; the trace API returns all traces for an agent ordered chronologically. Each continuation creates a new trace while reusing the agent's session identity for context persistence.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.7+ (Electron & Chrome Extension)
**Primary Dependencies**: FastAPI, Claude Agent SDK (ClaudeSDKClient), React 18.3, nats.ws, NATS 2.10+
**Storage**: SQLite via aiosqlite (`~/.vex/vex.db`, WAL mode)
**Testing**: pytest + pytest-asyncio (backend), chrome-devtools MCP (UI)
**Target Platform**: Linux/macOS desktop (Electron), Chrome 116+ (extension)
**Project Type**: Desktop app + Chrome Extension + Python API backend
**Performance Goals**: Continuation should start streaming within the same latency as initial agent runs
**Constraints**: Session files persisted by SDK at `~/.claude/projects/<cwd>/<session_id>.jsonl`; agent must be in terminal state before continuation
**Scale/Scope**: Single-user local deployment; multi-turn conversation depth limited by SDK context window

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | No new components. Changes span existing AgentManager (AO), Electron App, Chrome Extension. NATS subjects reused. |
| II. Protocol-First, Deployment-Agnostic | PASS | New REST endpoint + same NATS subjects. No protocol divergence between deployment modes. |
| III. Chrome Extension as Real Browser | PASS | Extension remains standard MV3. Continue action uses existing HTTP + NATS patterns. |
| IV. Structured Actions, Not Raw DOM | N/A | Feature does not involve visual edits or DOM capture. |
| V. Agent-Agnostic Orchestration | PASS | `resume()` added as abstract method on `AgentAdapter` base. Not Claude-specific in the orchestration layer. |
| VI. Developer Edit as Sketch | N/A | Feature does not involve agent interpretation of edits. |
| VII. Simplicity and YAGNI | PASS | Minimal additions: one endpoint, one adapter method, UI input bar, cursor reply button. No speculative abstractions. |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-continue-agent-conversation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-continue.md  # Continue endpoint contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
agent-orchestrator/
├── src/agent_orchestrator/
│   ├── adapters/
│   │   ├── base.py                    # Add abstract resume()
│   │   └── claude_code_sdk.py         # Implement resume(), set session_id, refactor streaming
│   ├── services/
│   │   └── batch_processor.py         # Add continue_agent()
│   ├── api/
│   │   └── agents.py                  # Add POST /continue endpoint, multi-trace retrieval
│   └── models/
│       └── agent.py                   # Add ContinueRequest model

electron-app/
├── src/
│   ├── main/
│   │   ├── index.ts                   # Add continue-agent IPC handler
│   │   └── preload.ts                 # Add continueAgent() method
│   └── renderer/
│       ├── pages/
│       │   └── AgentTrace.tsx          # Follow-up input bar, multi-trace display
│       └── electron.d.ts              # Type declaration

chrome-extension/
└── src/content/components/
    ├── AgentCursors.tsx                # Completion notification + reply input
    └── AgentStatusPanel.tsx            # New: floating agent status panel (P3)
```

**Structure Decision**: Follows existing project layout. All changes modify existing files except `AgentStatusPanel.tsx` (new P3 component in Chrome Extension).

## Complexity Tracking

> No violations to justify — all gates pass.
