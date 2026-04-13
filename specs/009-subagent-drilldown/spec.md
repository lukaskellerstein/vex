# Feature Specification: Subagent Drill-Down in Agent Detail Page

**Feature Branch**: `009-subagent-drilldown`  
**Created**: 2026-04-07  
**Status**: Draft  
**Input**: User description: "Add subagent list and drill-down trace view to the agent detail page. Users should be able to see all subagents spawned by an agent, click into any subagent, and view its full execution trace (tool calls, reads, writes, etc.) in a dedicated view."

## User Scenarios & Testing

### User Story 1 - View Subagent List on Agent Detail Page (Priority: P1)

A user is reviewing an agent's execution on the agent detail page. They see a "Subagents" section in the header area that lists all subagents spawned during that agent's run. Each subagent is displayed as a clickable chip showing its type, description, and status (running/completed).

**Why this priority**: This is the foundation — without seeing subagents listed, users cannot discover or navigate to them. It also provides immediate value by surfacing subagent metadata that was previously hidden.

**Independent Test**: Can be fully tested by running an agent that spawns subagents, navigating to the agent detail page, and verifying the subagent chips appear with correct metadata.

**Acceptance Scenarios**:

1. **Given** an agent that spawned 3 subagents, **When** the user navigates to the agent detail page, **Then** they see 3 clickable subagent chips in the header area showing type, description, and completion status for each.
2. **Given** an agent that spawned no subagents, **When** the user navigates to the agent detail page, **Then** the subagents section is not displayed.
3. **Given** an agent with a currently running subagent, **When** the user views the agent detail page, **Then** the running subagent chip shows an active/in-progress indicator.

---

### User Story 2 - Drill Down into Subagent Trace (Priority: P1)

A user clicks on a subagent chip from the agent detail page and is navigated to a dedicated subagent trace view. This view shows the subagent's full execution trace — all individual steps (tool calls, file reads/writes, text responses) displayed in the same format as the parent agent's trace. A breadcrumb at the top allows navigation back to the parent agent.

**Why this priority**: This is the core value proposition — being able to inspect what a subagent actually did. Without this, the subagent list is just metadata with no actionable insight.

**Independent Test**: Can be tested by clicking a subagent chip and verifying the trace view loads with correct steps parsed from the subagent's transcript file.

**Acceptance Scenarios**:

1. **Given** a completed subagent with a transcript file, **When** the user clicks its chip, **Then** they are navigated to a subagent trace view showing all execution steps in chronological order.
2. **Given** a subagent trace view is open, **When** the user clicks the breadcrumb link to the parent agent, **Then** they are navigated back to the parent agent's detail page.
3. **Given** a subagent trace view, **When** the user views a tool call step, **Then** they see the tool name, input, and result in the same format as parent agent tool calls.
4. **Given** a subagent whose transcript file is missing or corrupted, **When** the user clicks its chip, **Then** they see a clear error message indicating the transcript is unavailable.

---

### User Story 3 - Real-Time Subagent Updates (Priority: P2)

While viewing an agent that is still running, the user sees subagents appear in the list in real-time as they are spawned. When a subagent completes, its chip updates to reflect the completed status without requiring a page refresh.

**Why this priority**: Enhances the live monitoring experience but is not essential for the core drill-down functionality. The list and trace views work fine with completed agents.

**Independent Test**: Can be tested by starting an agent that spawns subagents, keeping the agent detail page open, and verifying chips appear and update status dynamically.

**Acceptance Scenarios**:

1. **Given** a running agent and the user is on its detail page, **When** a new subagent is spawned, **Then** a new chip appears in the subagents section without page refresh.
2. **Given** a running subagent chip is visible, **When** the subagent completes, **Then** the chip updates to show completed status without page refresh.

---

### Edge Cases

- What happens when a subagent's transcript file is very large (thousands of steps)? The view should handle pagination or lazy loading to remain responsive.
- What happens when the parent agent is deleted? Subagent metadata and transcripts should be cleaned up accordingly.
- What happens when a subagent spawns its own nested subagents? The system should support viewing nested subagent traces (navigating deeper) or clearly indicate nesting depth.
- What happens when the transcript file format is unexpected or contains malformed entries? The parser should skip malformed entries and display what it can, with a warning.

## Requirements

### Functional Requirements

- **FR-001**: System MUST persist subagent metadata (type, description, start time, completion time, transcript location) when a subagent starts and completes.
- **FR-002**: System MUST provide a way to retrieve the list of all subagents for a given parent agent.
- **FR-003**: System MUST parse subagent transcript files (JSONL format) into a structured step format compatible with the existing agent trace display.
- **FR-004**: System MUST provide a way to retrieve the parsed transcript (execution steps) for a specific subagent.
- **FR-005**: Users MUST be able to see all subagents listed on the parent agent's detail page.
- **FR-006**: Users MUST be able to click a subagent to navigate to a dedicated trace view showing all execution steps.
- **FR-007**: Users MUST be able to navigate back from a subagent trace view to the parent agent's detail page via a breadcrumb.
- **FR-008**: The subagent trace view MUST NOT show the follow-up/input bar (subagents cannot be interacted with directly).
- **FR-009**: System MUST handle missing or corrupted transcript files gracefully, displaying an appropriate error message.
- **FR-010**: System MUST update the subagent list in real-time when new subagents are spawned or existing ones complete (for running agents).

### Key Entities

- **Subagent Metadata**: Represents a subagent spawned by a parent agent. Key attributes: parent agent reference, subagent identifier, type (e.g., "general-purpose", "Explore"), description, transcript file location, start time, completion time.
- **Transcript Step**: A single execution step parsed from a subagent's transcript file. Represents either a tool call (with name, input, result), a text response, or a user message. Compatible with existing agent step display format.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can navigate from an agent detail page to any subagent's full trace in 2 clicks or fewer.
- **SC-002**: Subagent trace view loads and displays all steps within 3 seconds for transcripts containing up to 500 steps.
- **SC-003**: 100% of subagents spawned during an agent run are captured and visible in the subagent list.
- **SC-004**: Real-time subagent status updates appear within 2 seconds of the underlying event occurring.
- **SC-005**: Users can understand what a subagent did (tools used, files accessed, decisions made) without needing to inspect raw transcript files.

## Assumptions

- Subagent transcript files are written in JSONL format by the Claude SDK, with each line containing a JSON object with `message.role` and `message.content` fields.
- The existing SubagentStart and SubagentStop hook events are already implemented and firing correctly.
- The existing agent trace display components can be reused or adapted for subagent trace rendering with minimal changes.
- Nested subagents (subagents of subagents) will be supported at the data level but the initial implementation may limit UI navigation to one level of nesting.
