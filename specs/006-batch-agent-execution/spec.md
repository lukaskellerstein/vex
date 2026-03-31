# Feature Specification: Wire Batch Submission to Agent Execution

**Feature Branch**: `006-batch-agent-execution`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Wire batch submission to agent execution + show output in Electron"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Batch Processing (Priority: P1)

A user submits a batch of visual edits from the Chrome extension. The system automatically picks up the batch, spawns one ephemeral agent per action, executes all actions in parallel, and updates the batch status as agents complete. No manual trigger is required — the pipeline fires immediately after batch submission.

**Why this priority**: Without automatic batch processing, the entire pipeline is broken. Batches are stored but never executed. This is the core value proposition: visual edits in the browser result in actual code changes.

**Independent Test**: Submit a batch via the Chrome extension (or directly via `POST /api/projects/{id}/batches`), then observe via the API or AO logs that agents are spawned and the batch transitions from "pending" to "processing" to "completed" (or "failed") without manual intervention.

**Acceptance Scenarios**:

1. **Given** a project exists and a batch of 3 actions is submitted, **When** the batch is saved to the database, **Then** 3 agents are spawned in parallel (one per action), each processing its assigned action.
2. **Given** all agents for a batch complete successfully, **When** the last agent finishes, **Then** the batch status transitions to "completed".
3. **Given** one or more agents fail during execution, **When** processing finishes, **Then** the batch status transitions to "failed" and individual task statuses reflect which succeeded and which failed.
4. **Given** a batch is submitted, **When** the HTTP response returns, **Then** the response is immediate (fire-and-forget) — agents run asynchronously in the background.
5. **Given** a batch contains zero actions, **When** submitted, **Then** it is marked "completed" immediately with no agents spawned.

---

### User Story 2 - Live Agent Status in Electron Project Detail (Priority: P2)

While agents are processing a batch, the user opens the Electron app's Project Detail page and sees a live list of agents for that project with their current status (running, completed, failed). Status updates appear automatically without page refresh.

**Why this priority**: Users need visibility into what's happening after they submit edits. Without this, the system is a black box — the user submits edits and has no idea if anything is happening.

**Independent Test**: Submit a batch, open the Project Detail page in Electron, and verify that agent entries appear with "running" status and transition to "completed" or "failed" as agents finish.

**Acceptance Scenarios**:

1. **Given** a batch is being processed, **When** the user views the Project Detail page, **Then** all agents for the project are listed with their current status and the action they are processing.
2. **Given** agents are running, **When** the user stays on the Project Detail page, **Then** agent statuses update automatically via polling without requiring a manual refresh.
3. **Given** an agent completes or fails, **When** the status updates, **Then** the agent displays a clear visual indicator (badge/icon) distinguishing completed from failed.
4. **Given** multiple batches have been processed for a project, **When** the user views the agent list, **Then** agents are ordered by creation time (most recent first) with a summary header showing counts (e.g., "3 running, 2 completed").

---

### User Story 3 - Agent Step-by-Step Execution Timeline (Priority: P3)

A user clicks on a specific agent in the Project Detail page to see a detailed, chronological timeline of what the agent is doing: each thinking step, tool call, tool result, and completion/error marker is shown with timestamps. Past steps appear dimmed with checkmarks; the current step is highlighted with a spinner.

**Why this priority**: Step-level visibility lets users understand what the AI agent is actually doing with their code, builds trust, and enables debugging when things go wrong.

**Independent Test**: Click on a running or completed agent and verify that a timeline of steps appears showing the agent's execution flow with distinct step types (text, tool use, tool result, error, completion).

**Acceptance Scenarios**:

1. **Given** a user clicks on a running agent, **When** the agent detail view opens, **Then** a timeline of steps is displayed with past steps dimmed/checked and the current step highlighted with a progress indicator.
2. **Given** a user clicks on a completed agent, **When** the agent detail view opens, **Then** the full history of steps is shown with all steps marked as completed.
3. **Given** a user is viewing a running agent's detail, **When** the agent performs a new step, **Then** the timeline updates automatically via polling to show the new step.
4. **Given** an agent encounters an error, **When** the user views the step detail, **Then** the error step is clearly marked with error information visible.

---

### Edge Cases

- What happens when the agent orchestrator restarts while agents are processing a batch? Orphaned batches remain in "processing" status and are identifiable — no silent data loss. Users can resubmit the batch.
- What happens when the Claude SDK adapter fails to start an agent session? The corresponding task is marked "failed" with a clear error message, and remaining actions in the batch continue processing independently.
- What happens when the user submits multiple batches in rapid succession? Each batch is processed independently with its own set of agents — no interference between batch runs.
- What happens when an agent is already stopped but the user requests its steps? The system returns the full step history from the completed session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically begin processing a batch immediately after it is submitted, with no manual trigger required.
- **FR-002**: System MUST spawn one ephemeral agent per action within a batch, executing all actions in parallel.
- **FR-003**: System MUST track each agent's execution as structured steps (text output, tool usage, tool results, errors, completion) with timestamps.
- **FR-004**: System MUST update batch status to reflect aggregate agent outcomes: "completed" if all succeed, "failed" if any fail.
- **FR-005**: System MUST update individual task and agent status independently so partial failures are visible.
- **FR-006**: System MUST provide a way to retrieve agents scoped to a specific project.
- **FR-007**: System MUST provide a way to retrieve structured execution steps for a specific agent.
- **FR-008**: The Electron app MUST display a list of agents per project with live-updating status indicators.
- **FR-009**: The Electron app MUST display a step-by-step execution timeline when a user selects an agent.
- **FR-010**: Agents MUST be ephemeral — started for a specific task and cleaned up (stopped, session released) after completion or failure.
- **FR-011**: The batch submission response MUST return immediately without waiting for agent execution to complete.
- **FR-012**: Each task MUST be linked to the batch that originated it, enabling batch-to-task traceability.

### Key Entities

- **Batch Processor**: Orchestration logic that receives a submitted batch, decomposes it into individual actions, and manages the parallel agent lifecycle for all actions.
- **Ephemeral Agent**: A short-lived agent session that processes exactly one action. Created on demand, executes the task, and is destroyed after completion or failure. Tracks cost and duration.
- **Execution Step**: A discrete unit of agent work — text response, tool invocation, tool result, progress update, or error. Each step has a type, content, timestamp, and status (past/current).
- **Task**: Links an agent to a specific action within a batch. Tracks assignment, execution status, and result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A submitted batch begins agent processing within 2 seconds of submission without manual intervention.
- **SC-002**: All actions in a batch are processed in parallel — total batch processing time is roughly equal to the longest single action, not the sum of all actions.
- **SC-003**: Users can see agent status updates in the Electron app within 5 seconds of an agent state change.
- **SC-004**: Users can view at least 3 distinct execution step types per agent (e.g., thinking, tool call, result) in the agent detail timeline.
- **SC-005**: 100% of batch submissions result in a terminal batch status (completed or failed) — no batches left permanently in "processing" state under normal operation.
- **SC-006**: Agent cleanup occurs automatically after task completion — no orphaned agent sessions consuming resources after all tasks finish.
