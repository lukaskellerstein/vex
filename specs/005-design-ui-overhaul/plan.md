# Implementation Plan: Electron App UI Overhaul

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-design-ui-overhaul/spec.md`

## Summary

Overhaul the Vex Electron app UI to match the design reference from `designs/11`. This involves replacing the current top-tab navigation with a collapsible sidebar, adding 3 new pages (Activity, AgentTrace, and expanded Settings), redesigning existing pages (Projects grid/list, ProjectDetail two-column layout), implementing a Catppuccin Mocha dark theme via CSS custom properties, and extending the backend with activity events, agent traces, and storage stats endpoints.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator)
**Primary Dependencies**: React 18.3, React Router v6 (new), Lucide React (new), FastAPI 0.115+, aiosqlite
**Storage**: SQLite (`~/.vex/vex.db`) — add 3 new tables (activity_events, agent_traces, trace_steps), extend 2 tables (batches, agents)
**Testing**: Chrome DevTools MCP for UI, pytest for backend
**Target Platform**: Linux/macOS/Windows desktop (Electron 30)
**Project Type**: Desktop app (Electron + Python backend)
**Performance Goals**: All pages render <1s, dev server log streaming at 1s polling
**Constraints**: No Tailwind, no GSAP — use CSS custom properties and CSS animations only
**Scale/Scope**: 6 pages, ~25 new/redesigned components, 6 new API endpoints, 3 new DB tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Four-Component Architecture | PASS | Changes only touch Electron App (renderer + main) and AgentManager (backend). No cross-boundary imports. |
| II. Protocol-First | PASS | New REST endpoints follow existing patterns. No protocol divergence. |
| III. Chrome Extension as Real Browser | N/A | This feature doesn't touch the Chrome Extension. |
| IV. Structured Actions | N/A | No changes to action capture. |
| V. Agent-Agnostic Orchestration | PASS | Agent UI displays all agent types equally. No hardcoded agent identities. |
| VI. Developer Edit as Sketch | N/A | No changes to agent interpretation. |
| VII. Simplicity and YAGNI | PASS | No Tailwind, no GSAP, no state management library. CSS custom properties for theming. React Router only because nested routes require it. Lucide only because design uses it extensively. |

**Post-Phase 1 Re-check**: All principles still pass. New DB tables are in AgentManager (state owner per Architecture Constraints). New endpoints follow REST patterns.

## Project Structure

### Documentation (this feature)

```text
specs/005-design-ui-overhaul/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity schemas
├── quickstart.md        # Phase 1: setup instructions
├── contracts/
│   ├── ipc-api.md       # Phase 1: IPC method contracts
│   └── rest-api.md      # Phase 1: REST endpoint contracts
└── tasks.md             # Phase 2 output (not yet created)
```

### Source Code (repository root)

```text
electron-app/
├── src/
│   ├── main/
│   │   ├── index.ts              # IPC handlers (extend with new handlers)
│   │   └── preload.ts            # IPC bridge (extend with new methods)
│   └── renderer/
│       ├── App.tsx               # Router setup (rewrite: MemoryRouter)
│       ├── main.tsx              # Entry point (no changes)
│       ├── styles/
│       │   └── theme.css         # NEW: Catppuccin Mocha CSS custom properties
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx   # NEW: sidebar + outlet + status bar
│       │   │   ├── Sidebar.tsx    # NEW: collapsible nav
│       │   │   └── StatusBar.tsx  # REWRITE: match design
│       │   ├── projects/
│       │   │   ├── ProjectCard.tsx        # NEW
│       │   │   ├── ProjectListHeader.tsx  # NEW
│       │   │   ├── ProjectEmptyState.tsx  # NEW
│       │   │   ├── StatusIndicator.tsx    # NEW
│       │   │   └── FrameworkBadge.tsx     # NEW
│       │   ├── project-detail/
│       │   │   ├── ProjectInfoPanel.tsx   # NEW
│       │   │   ├── BatchList.tsx          # NEW
│       │   │   ├── BatchCard.tsx          # NEW
│       │   │   ├── DevServerLogs.tsx      # NEW
│       │   │   ├── AgentStepList.tsx      # NEW
│       │   │   └── AgentStepItem.tsx      # NEW
│       │   ├── activity/
│       │   │   ├── ActivityTimeline.tsx    # NEW
│       │   │   ├── ActivityFilters.tsx     # NEW
│       │   │   ├── ActivityStats.tsx       # NEW
│       │   │   └── ActivityEntry.tsx       # NEW
│       │   ├── settings/
│       │   │   ├── SettingsLayout.tsx      # NEW
│       │   │   ├── GeneralSettings.tsx     # NEW
│       │   │   ├── PortsSettings.tsx       # NEW (replaces current Settings.tsx)
│       │   │   ├── StorageSettings.tsx     # NEW
│       │   │   ├── AgentSettings.tsx       # NEW
│       │   │   └── AboutSettings.tsx       # NEW
│       │   ├── ui/
│       │   │   └── Tooltip.tsx            # NEW
│       │   ├── AddProjectDialog.tsx       # RESTYLE
│       │   └── AgentPanel.tsx             # REMOVE (replaced by Agents page components)
│       └── pages/
│           ├── Projects.tsx               # REWRITE (was ProjectList.tsx)
│           ├── ProjectDetail.tsx          # REWRITE
│           ├── AgentTrace.tsx             # NEW
│           ├── Activity.tsx               # NEW
│           └── Settings.tsx               # REWRITE
└── package.json                           # Add react-router-dom, lucide-react

agent-orchestrator/
├── src/agent_orchestrator/
│   ├── db/
│   │   └── database.py           # Extend schema: 3 new tables, 2 altered tables
│   ├── api/
│   │   ├── activity.py           # NEW: activity endpoints
│   │   ├── storage.py            # NEW: storage stats endpoints
│   │   ├── batches.py            # EXTEND: trace endpoint, enriched response
│   │   └── agents.py             # EXTEND: logs endpoint, enriched response
│   ├── models/
│   │   ├── activity.py           # NEW: ActivityEvent model
│   │   ├── trace.py              # NEW: AgentTrace, TraceStep models
│   │   ├── batch.py              # EXTEND: new fields
│   │   └── agent.py              # EXTEND: new fields
│   └── main.py                   # Register new routers
└── tests/                        # Tests for new endpoints
```

**Structure Decision**: Web application pattern (frontend + backend). Extends existing structure — no new top-level directories. Frontend adds `styles/`, `components/layout/`, `components/projects/`, `components/project-detail/`, `components/activity/`, `components/settings/`, `components/ui/` subdirectories. Backend adds `api/activity.py`, `api/storage.py`, `models/activity.py`, `models/trace.py`.

## Complexity Tracking

No constitution violations. All new complexity is justified by concrete design requirements.
