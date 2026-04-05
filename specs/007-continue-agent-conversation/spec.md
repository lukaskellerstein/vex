# Feature Specification: Continue Conversation with Finished Agent

**Feature Branch**: `007-continue-agent-conversation`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: User description: "Allow users to send follow-up messages to completed/failed agents from both the Electron UI and the Chrome Extension, leveraging Claude Agent SDK session persistence for multi-turn context."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continue Agent from Electron UI (Priority: P1)

A user submits a batch of tasks to an agent. The agent completes (or fails partway through). The user reviews the agent's trace in the Electron app and realizes they need a follow-up — either to fix something the agent broke, refine its output, or continue where it left off. From the agent trace view, the user types a follow-up message and sends it. The same agent resumes with full context of its prior work, streams new steps live, and appends a new trace to the conversation history.

**Why this priority**: This is the core value proposition. Without backend support and at least one UI surface, the feature doesn't exist. The Electron app is the primary interface for reviewing agent work and the natural place to continue a conversation.

**Independent Test**: Can be fully tested by completing an agent run in the Electron app, then sending a follow-up message from the trace view. Delivers immediate value: users can iterate on agent work without losing context.

**Acceptance Scenarios**:

1. **Given** an agent in `completed` state, **When** the user types a follow-up message and clicks Send in the trace view, **Then** the agent transitions to `running`, new steps stream live in the trace view, and the agent has access to its prior conversation context.
2. **Given** an agent in `failed` state, **When** the user sends a follow-up message, **Then** the agent resumes with full prior context and can address the failure.
3. **Given** an agent in `running` state, **When** the user attempts to send a follow-up, **Then** the system prevents the action and informs the user the agent is still active.
4. **Given** an agent that has been continued multiple times, **When** the user views the trace, **Then** all turns are displayed in chronological order with clear separation between each turn, and aggregated metrics (cost, tokens, duration) reflect all turns.

---

### User Story 2 - Continue Agent from Chrome Extension (Priority: P2)

A user is browsing a page where an agent was performing visual edits. The agent completes or fails, and the user sees a notification on the agent's cursor. Without leaving the page, the user clicks a reply button on the cursor, types a follow-up message in a floating input panel, and sends it. The agent resumes with context, and the cursor transitions back to its active/running animation.

**Why this priority**: The Chrome Extension is the secondary interface. Users performing visual edits benefit from in-context follow-up without switching to the Electron app. However, the backend (P1) must exist first.

**Independent Test**: Can be tested by running an agent on a page via the Chrome Extension, waiting for completion, then using the cursor reply button to send a follow-up. Delivers value: seamless in-page iteration on visual edits.

**Acceptance Scenarios**:

1. **Given** an agent that just completed on a page, **When** the cursor shows a completion notification, **Then** a reply/chat button is visible on the cursor badge.
2. **Given** the user clicks the reply button, **When** a floating input panel appears, **Then** it contains a textarea, send button, and dismiss button anchored near the cursor.
3. **Given** the user types a message and clicks Send, **When** the request succeeds, **Then** the agent transitions back to `running`, the cursor resumes its active animation, and new steps stream via the existing messaging channels.
4. **Given** the user dismisses the notification without replying, **When** they dismiss, **Then** the cursor proceeds with its normal fade-out behavior.

---

### User Story 3 - Persistent Agent Status Panel in Chrome Extension (Priority: P3)

A user has multiple agents running or recently completed on a page. They may have missed a cursor notification. A small floating panel in the bottom-right corner shows all agents associated with the current page, their status, and provides a "Continue" button for each completed/failed agent.

**Why this priority**: This is an enhancement over P2 — it ensures users never miss the ability to continue an agent even if the cursor notification was dismissed. Lower priority because the cursor-anchored input (P2) covers the primary use case.

**Independent Test**: Can be tested by completing multiple agents on a page, dismissing cursor notifications, then using the status panel to continue any agent. Delivers value: reliable access to continue functionality regardless of notification state.

**Acceptance Scenarios**:

1. **Given** one or more agents are active or recently completed on a page, **When** the status panel is visible, **Then** it lists each agent with its current status (running/completed/failed).
2. **Given** a completed/failed agent in the status panel, **When** the user clicks "Continue", **Then** the same floating input panel appears for that agent.
3. **Given** all agents on a page are dismissed or no agents exist, **When** no agents are relevant, **Then** the status panel is hidden.

---

### Edge Cases

- What happens when the user sends a continue request but the backend is unreachable? The UI shows an error and allows retry.
- What happens if two clients attempt to continue the same agent simultaneously? The backend rejects the second request since the agent is already running.
- What happens if the session history on disk has been deleted or corrupted? The agent starts a fresh conversation without prior context; the system handles this gracefully rather than crashing.
- What happens when a very long conversation history exists (many continuations)? The trace view remains performant with large numbers of steps across multiple traces.
- What happens if the user sends an empty follow-up message? The system rejects it with a validation error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow sending follow-up messages to agents in terminal states (`completed`, `failed`, `stopped`).
- **FR-002**: System MUST reject continue requests for agents that are currently `running`.
- **FR-003**: System MUST preserve conversation context across continuations by reusing the agent's session identity.
- **FR-004**: System MUST create a new trace record for each continuation turn while preserving all prior traces.
- **FR-005**: System MUST stream continuation steps in real-time via the same messaging channels used for the initial agent run.
- **FR-006**: System MUST transition the agent status from terminal back to `running` when a continuation starts, and back to a terminal state when it finishes.
- **FR-007**: The Electron trace view MUST display a follow-up input when viewing agents in terminal states.
- **FR-008**: The Electron trace view MUST display all turns (traces) in chronological order with visual separation and aggregated metrics.
- **FR-009**: The Chrome Extension MUST show a reply action on agent cursors when agents reach terminal state.
- **FR-010**: The Chrome Extension MUST provide a floating input panel for composing follow-up messages.
- **FR-011**: The Chrome Extension cursor MUST transition back to its active/running state when a continuation begins.
- **FR-012**: System MUST validate that the follow-up message is non-empty before accepting the request.

### Key Entities

- **Agent Session**: The persistent conversation context for an agent, identified by a session ID derived from the agent ID. Persisted to disk, enabling multi-turn conversations across separate invocations.
- **Agent Trace**: A record of one turn of agent work (initial run or continuation). Each continuation creates a new trace. All traces for an agent are retrievable together to form the full conversation history.
- **Continue Request**: A user-initiated message sent to a terminal agent, triggering a new turn in the conversation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send a follow-up message to a completed/failed agent and receive a contextual response within the same time frame as an initial agent run.
- **SC-002**: The continued agent demonstrably references its prior work in its response, proving context persistence across turns.
- **SC-003**: 100% of continuation attempts on terminal agents succeed without requiring the user to re-explain prior context.
- **SC-004**: Users can continue an agent from the Electron trace view in under 10 seconds (type message + send).
- **SC-005**: Users can continue an agent from the Chrome Extension cursor in under 10 seconds without leaving the current page.
- **SC-006**: Full multi-turn conversation history is viewable in the trace view with per-turn and aggregate metrics.
