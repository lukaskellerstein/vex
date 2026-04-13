# Implementation Plan: Subagent Drill-Down in Agent Detail Page

**Branch**: `009-subagent-drilldown` | **Date**: 2026-04-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-subagent-drilldown/spec.md`

## Summary

Add subagent visibility to the agent detail page. A new `subagent_metadata` DB table stores subagent lifecycle data from existing SubagentStart/SubagentStop hooks. A transcript parser service converts Claude SDK JSONL files into TraceStep-compatible arrays on demand. Two new API endpoints serve subagent lists and parsed transcripts. The frontend reuses AgentTrace in "subagent mode" with a new SubagentList chip component and breadcrumb navigation.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5.7+ (frontend)
**Primary Dependencies**: FastAPI, aiosqlite, claude-agent-sdk >=0.1.53, React 18, Electron 30, React Router
**Storage**: SQLite (`~/.vex/vex.db`) + Claude SDK transcript files (JSONL on disk)
**Testing**: pytest + pytest-asyncio (backend), Electron MCP (frontend)
**Target Platform**: Linux/macOS desktop (Electron + Chrome Extension)
**Project Type**: Desktop app with Python backend
**Performance Goals**: Transcript parsing <3s for 500-step files
**Constraints**: No additional runtime dependencies; reuse existing UI components
**Scale/Scope**: Typical subagent count: 1-10 per agent run; transcript files: 10KB-5MB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | Changes span AgentManager (backend) and Electron (frontend). No new components. Communication via REST + existing NATS events. |
| II. Protocol-First | PASS | New REST endpoints follow existing patterns. NATS subjects unchanged. |
| III. Chrome Extension as Real Browser | N/A | No Chrome Extension changes in this feature. |
| IV. Structured Actions | N/A | No visual editing involved. |
| V. Agent-Agnostic Orchestration | PASS | Subagent metadata is agent-type agnostic. Works for any subagent type. |
| VI. Developer Edit as Sketch | N/A | No agent interpretation involved. |
| VII. Simplicity and YAGNI | PASS | Reuses AgentTrace instead of building a new page. On-demand parsing avoids data duplication. Single level of nesting for V1. |
| State Ownership | PASS | AgentManager owns all subagent metadata (new table). |
| Storage | PASS | SQLite for metadata, file-based for transcripts. Follows existing patterns. |

**Post-Phase-1 Re-check**: All gates still pass. No new complexity violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/009-subagent-drilldown/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
agent-orchestrator/
├── src/agent_orchestrator/
│   ├── db/database.py                  # Modified: new subagent_metadata table
│   ├── adapters/claude_code_sdk.py     # Modified: persist subagent data in hooks
│   ├── services/transcript_parser.py   # New: JSONL → TraceStep parser
│   ├── api/agents.py                   # Modified: 2 new endpoints
│   └── models/trace.py                 # Modified: SubagentMetadata model
└── tests/
    └── test_transcript_parser.py       # New: parser unit tests

electron-app/
├── src/main/
│   ├── preload.ts                      # Modified: 2 new IPC methods
│   └── index.ts                        # Modified: 2 new IPC handlers
└── src/renderer/
    ├── electron.d.ts                   # Modified: type declarations
    ├── App.tsx                         # Modified: new route
    ├── pages/AgentTrace.tsx            # Modified: subagent mode
    └── components/project-detail/
        └── SubagentList.tsx            # New: chip row component
```

**Structure Decision**: Follows existing multi-component layout. Backend changes in agent-orchestrator (DB, hooks, API, new service). Frontend changes in electron-app (IPC bridge, routing, page modifications, one new component).

## Complexity Tracking

No constitution violations to justify.
