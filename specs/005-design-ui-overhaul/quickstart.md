# Quickstart: 005-design-ui-overhaul

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30

## Prerequisites

- Node.js 18+, npm
- Python 3.11+, uv
- NATS server (bundled in electron-app/bin/)

## Setup

```bash
# 1. Install electron-app deps (includes new deps: react-router-dom, lucide-react)
cd electron-app && npm install

# 2. Install agent-orchestrator deps
cd agent-orchestrator && uv sync

# 3. Start everything
./dev-setup.sh
```

## What Changed

### Electron App (renderer)

- **Routing**: Replaced state-based navigation with React Router v6 (`MemoryRouter`)
- **Layout**: New `AppShell` with collapsible sidebar (replaces top tab bar)
- **Styling**: New CSS custom properties theme (Catppuccin Mocha) — replaces all inline styles
- **New pages**: Activity, AgentTrace
- **Redesigned pages**: Projects (grid/list + search), ProjectDetail (two-column + tabs), Settings (5-tab layout)
- **New components**: Sidebar, BatchCard, BatchList, DevServerLogs, AgentStepList, AgentStepItem, ActivityTimeline, ActivityFilters, ActivityStats, ProjectInfoPanel, FrameworkBadge, StatusIndicator, Tooltip
- **New deps**: `react-router-dom`, `lucide-react`

### Agent Orchestrator (backend)

- **New tables**: `activity_events`, `agent_traces`, `trace_steps`
- **Extended tables**: `batches` (+duration_ms, cost_usd, error_message, agent_id), `agents` (+tasks_completed, tasks_failed, total_cost_usd)
- **New endpoints**: `/api/activity`, `/api/activity/stats`, `/api/batches/:id/trace`, `/api/agents/:id/logs`, `/api/storage/stats`, `/api/storage/screenshots`, `/api/tasks` (extended)
- **Modified endpoints**: Batch and agent list/detail responses include new fields

### Electron App (main process)

- **New IPC handlers**: deleteProject, getProject, getBatches, getBatch, getAgentTrace, getActivity, getActivityStats, getTasks, getStorageStats, clearScreenshots, getAppInfo

## Testing

```bash
# Backend tests
cd agent-orchestrator && uv run pytest

# Manual UI test — verify via chrome-devtools MCP against localhost:9222
./dev-setup.sh
# Then use snapshot/screenshot tools to verify UI
```

## Key Files

| Area | Key Files |
|------|-----------|
| Theme | `electron-app/src/renderer/styles/theme.css` |
| Layout | `electron-app/src/renderer/components/layout/AppShell.tsx`, `Sidebar.tsx`, `StatusBar.tsx` |
| Router | `electron-app/src/renderer/App.tsx` |
| Pages | `electron-app/src/renderer/pages/*.tsx` |
| IPC | `electron-app/src/main/preload.ts`, `electron-app/src/main/index.ts` |
| Backend API | `agent-orchestrator/src/agent_orchestrator/api/*.py` |
| DB Schema | `agent-orchestrator/src/agent_orchestrator/db/database.py` |
