# Research: Subagent Drill-Down

## Decision 1: Subagent Metadata Storage

**Decision**: New `subagent_metadata` table in SQLite, persisted from existing SubagentStart/SubagentStop hooks.

**Rationale**: The hooks already fire with all needed data (subagent_id, subagent_type, transcript_path). Currently they only publish to NATS — adding DB persistence is a minimal change in the hook handlers. A dedicated table (vs. storing in `agent_traces`) keeps the schema clean and avoids overloading the trace model which is tied to batch processing.

**Alternatives considered**:
- Storing in `agent_traces` table with a `parent_agent_id` column — rejected because traces are batch-scoped and have fields (batch_id, agent_model, cost) that don't apply to subagents.
- Storing as JSON in the `agents` table `config` field — rejected because it doesn't support querying by subagent or updating individual records.

## Decision 2: Transcript Parsing Strategy

**Decision**: Parse transcript JSONL on-demand when the subagent trace view is opened. Convert to `TraceStep`-compatible format server-side.

**Rationale**: Transcript files are written by the Claude SDK in JSONL format. The existing `agent_logger.py` already writes JSONL with record types (start, config, event, finish). Parsing on-demand avoids duplicating transcript data into the DB and keeps the subagent metadata table lightweight. The parser converts SDK JSONL lines (with `message.role` and `message.content` arrays containing text/tool_use/tool_result blocks) into `TraceStep` objects that the frontend already knows how to render.

**Alternatives considered**:
- Pre-parsing and storing steps in `trace_steps` table on SubagentStop — rejected because it adds write latency to the hook, duplicates data, and the transcript file is the authoritative source.
- Returning raw JSONL to frontend for client-side parsing — rejected because it would duplicate parsing logic and the frontend step model is already well-defined.

## Decision 3: Frontend Approach — Subagent Mode in AgentTrace

**Decision**: Reuse `AgentTrace.tsx` with a "subagent mode" triggered by the presence of a `subagentId` route param. Add a new route `/project/:id/agent/:agentId/subagent/:subagentId`.

**Rationale**: AgentTrace already renders `AgentStep` objects, handles loading states, and has the full step rendering pipeline (1485 lines in `AgentStepItem.tsx`). The step types `subagent_spawn` and `subagent_result` already exist. Subagent mode differences are minimal: fetch from a different endpoint, show breadcrumb, hide follow-up bar. This avoids duplicating 2500+ lines of UI code.

**Alternatives considered**:
- New `SubagentTrace.tsx` page — rejected because 95% of the rendering logic would be copied from AgentTrace.
- Inline expansion of subagent steps within parent trace — rejected because it would make long traces unwieldy and doesn't match the drill-down UX goal.

## Decision 4: Real-Time Updates

**Decision**: Use existing NATS hook events (`vex.agent.{agent_id}.hooks`) which already carry SubagentStart/SubagentStop payloads. Frontend already receives these via `onAgentHook()` — just need to update UI state when they arrive.

**Rationale**: The infrastructure is fully in place. SubagentStart publishes `{hook: "SubagentStart", subagent_id, subagent_type}` and SubagentStop publishes `{hook: "SubagentStop", subagent_id, subagent_type, transcript_path}`. The `hook-steps.ts` utility already converts these to `subagent_spawn`/`subagent_result` step types. The only new work is maintaining a `subagents` state array in AgentTrace and updating it from hook events.

**Alternatives considered**:
- Dedicated NATS subject `vex.agent.{agent_id}.subagents` — rejected because it would duplicate existing hook infrastructure for no benefit.
- Polling the subagent list endpoint — rejected because NATS is already there.

## Decision 5: Nested Subagent Handling

**Decision**: Support at data level (subagent_metadata can reference any parent agent), but limit initial UI to one level of nesting with a clear indicator if deeper nesting exists.

**Rationale**: The spec assumes this. Recursive drill-down is technically possible since the same route pattern works for any depth, but adds testing complexity. V1 focuses on the common case (agent → subagent). If a subagent spawned its own subagents, those would show in its trace view as subagent_spawn steps but wouldn't be clickable yet.

## Decision 6: Subagent Description Field

**Decision**: Extract the subagent description from the SubagentStart hook's `agent_type` field combined with the prompt's first line (truncated). The SDK's SubagentStart hook input provides `agent_id` and `agent_type` but not a description field directly.

**Rationale**: Looking at the hook data, `agent_type` gives us the subagent category (e.g., "general-purpose", "Explore"). For a meaningful description, we can capture it from the parent agent's step that spawned the subagent — the `subagent_spawn` step's metadata already includes `subagent_name`. We'll store this as the description in the DB.

**Alternatives considered**:
- Only showing agent_type — too generic, users need to distinguish between multiple subagents of the same type.
- Parsing the prompt from the transcript — delayed until SubagentStop, too late for the live list.
