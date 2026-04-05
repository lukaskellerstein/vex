# Research: Continue Conversation with Finished Agent

**Branch**: `007-continue-agent-conversation` | **Date**: 2026-04-04

## R1: Claude Agent SDK Session Persistence

**Decision**: Use `session_id` parameter on `ClaudeSDKClient.query()` with format `vex-{agent_id}`.

**Rationale**:
- The SDK (v0.1.53+) natively persists sessions to `~/.claude/projects/<cwd>/<session_id>.jsonl`
- A new `ClaudeSDKClient` instance with the same `cwd` + `session_id` automatically loads prior conversation history
- `SDKAgentSession` already has a `session_id` field (line 96 of `claude_code_sdk.py`) — it's defined but never populated
- No need to maintain long-lived clients; session files on disk provide persistence

**Alternatives Considered**:
- Keep-alive client: Would require maintaining long-lived SDK client instances in memory. More complex, no benefit since SDK persists to disk.
- Custom conversation storage: Would require serializing/deserializing conversation history ourselves. Redundant with SDK's built-in persistence.

## R2: Streaming Loop Refactoring Strategy

**Decision**: Extract the message streaming loop (lines 269-605 of `claude_code_sdk.py`) into a shared `_stream_response(session, task_id)` method.

**Rationale**:
- `send_task()` and `resume()` both need identical streaming logic
- The streaming loop is ~340 lines handling SystemMessage, AssistantMessage, UserMessage, TaskProgressMessage, and ResultMessage
- Completion/error handling (lines 607-726) also shared
- Extracting avoids duplication and keeps both code paths in sync

**Alternatives Considered**:
- Duplicate the loop in `resume()`: Violates DRY, risks divergence over time. Rejected.
- Make `send_task()` accept a mode parameter: Conflates two distinct operations. The setup differs (new client vs. existing client), but streaming is identical. Extraction is cleaner.

## R3: Agent State Cycling for Continuation

**Decision**: Reuse the same `agent_id` and cycle status `terminal → running → terminal`. Same NATS subjects, existing subscriptions pick up new steps.

**Rationale**:
- Agent's NATS subjects use `agent_id`: `vex.agent.{agentId}.step`, `vex.agent.{agentId}.status`
- Existing NATS subscriptions in Electron and Chrome Extension will automatically receive new steps
- No need for new NATS subjects or subscription management
- DB agent row reused; `tasks_completed`/`tasks_failed` counters accumulate across turns

**Alternatives Considered**:
- New agent per continuation: Would break context (different NATS subjects, no session continuity in UI). Rejected.
- Nested agent model: Over-engineered for single-user local app. Rejected.

## R4: Multi-Trace Storage Strategy

**Decision**: One `agent_traces` row per turn (initial + each continuation). API returns all traces for an agent ordered by `created_at ASC`.

**Rationale**:
- Current schema already supports multiple traces per agent (FK `agent_id` on `agent_traces`)
- Each trace has independent metrics (cost, tokens, duration) — natural fit for per-turn tracking
- UI concatenates steps across traces with visual separators between turns
- Aggregated metrics computed client-side by summing across traces

**Alternatives Considered**:
- Append steps to existing trace: Would lose per-turn metrics and make it hard to distinguish turns. Rejected.
- Separate conversation table: Over-engineering. The existing trace model is sufficient. Rejected.

## R5: Chrome Extension Continue UX

**Decision**: Cursor-anchored floating input panel triggered by a reply button on the completion notification badge.

**Rationale**:
- Natural UX: user sees where agent worked and can reply in context
- Follows existing cursor/badge pattern in `AgentCursors.tsx`
- `completedAgentIdsRef` prevents resurrection currently — needs modification to allow re-activation when user explicitly continues
- Direct HTTP `fetch()` to AO (same pattern as existing extension HTTP calls, e.g., cursor polling at `localhost:8420`)

**Alternatives Considered**:
- Redirect to Electron app: Breaks workflow, forces context switch. Rejected.
- Browser notification with reply: Non-standard, limited input capabilities. Rejected.

## R6: Electron Trace View Multi-Turn Display

**Decision**: Modify `get_agent_trace()` to return all traces. UI concatenates steps with turn separators and shows aggregated + per-turn metrics.

**Rationale**:
- Current `fetchPersistedTrace()` calls `getAgentTraceByAgent(agentId)` which returns a single trace
- Need to change API to return array of traces and update UI to display all turns
- Status change effect (lines 269-283) already handles agent status transitions — can be extended for continuation
- NATS re-subscription works automatically since same `agentId` → same subjects

**Alternatives Considered**:
- Separate page per turn: Fragmenting. Users need to see full conversation history. Rejected.

## R7: Race Condition Prevention

**Decision**: Backend validates agent is in terminal state before accepting continue request. Returns 409 Conflict if agent is `running`.

**Rationale**:
- Simple state check before spawning continuation
- `_agent_manager.start_agent()` already handles status transition to `running`
- Second concurrent request will find agent in `running` state and be rejected
- No need for distributed locks in single-user local deployment

**Alternatives Considered**:
- Optimistic locking with version field: Over-engineering for local single-user app. Rejected.
