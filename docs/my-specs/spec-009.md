# Spec 009: Subagent Drill-Down in Agent Detail Page

## Problem

The agent detail page (AgentTrace) shows subagent steps inline as "AGENT Subagent" cards but provides no way to drill down into a subagent's own execution trace. Users can see that a subagent was spawned (and its prompt/result) but not the individual steps it took (tool calls, reads, writes, etc.).

## Goal

Add a "Subagents" section in the agent detail header that lists all subagents. Clicking a subagent navigates to a dedicated subagent trace view showing all steps from that subagent's execution.

## Design

### Data Flow

1. **SubagentStart/Stop hooks** (already exist) persist metadata to new `subagent_metadata` DB table
2. **Transcript files** (JSONL, written by Claude SDK at `agent_transcript_path`) are parsed on-demand when user navigates to subagent view
3. **New API endpoints** serve subagent list and parsed transcript data
4. **Frontend** renders subagent chips in header + reuses AgentTrace in "subagent mode"

### Database

New table `subagent_metadata`:
- `id` (PK), `parent_agent_id` (FK→agents), `subagent_id`, `subagent_type`, `description`, `transcript_path`, `started_at`, `completed_at`

### API Endpoints

- `GET /api/agents/{agent_id}/subagents` — list subagents for an agent
- `GET /api/agents/{agent_id}/subagents/{subagent_id}/transcript` — parsed transcript as steps

### Frontend

- New route: `/project/:id/agent/:agentId/subagent/:subagentId`
- New `SubagentList` component: horizontal row of clickable chips between metrics bar and step list
- `AgentTrace` gains "subagent mode": fetches transcript, shows breadcrumb back to parent, hides follow-up bar
- Live updates: SubagentStop hook events update the subagent list in real-time

### Transcript Format (Claude SDK JSONL)

Each line is JSON with `message.role` (user/assistant) and `message.content` (array of blocks: `text`, `tool_use`, `tool_result`). Parsed into AgentStep-compatible format by a new `transcript_parser.py` service.

## Phases

1. DB table + migration
2. Hook persistence (SubagentStart → INSERT, SubagentStop → UPDATE with transcript_path)
3. Transcript parser service
4. API endpoints
5. Electron IPC bridge
6. Frontend route + SubagentList component + AgentTrace modifications

## Files

| File | Change |
|------|--------|
| `agent-orchestrator/.../db/database.py` | New table + migration |
| `agent-orchestrator/.../adapters/claude_code_sdk.py` | Persist subagent metadata in hooks |
| `agent-orchestrator/.../services/transcript_parser.py` | **New** — JSONL parser |
| `agent-orchestrator/.../api/agents.py` | 2 new endpoints |
| `electron-app/src/main/preload.ts` | 2 new IPC methods |
| `electron-app/src/main/index.ts` | 2 new IPC handlers |
| `electron-app/src/renderer/electron.d.ts` | Type declarations |
| `electron-app/src/renderer/App.tsx` | New route |
| `electron-app/src/renderer/components/project-detail/SubagentList.tsx` | **New** |
| `electron-app/src/renderer/pages/AgentTrace.tsx` | Subagent mode + list rendering |
