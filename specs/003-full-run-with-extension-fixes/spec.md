# Feature Specification: Full Run with Extension Fixes

**Feature Branch**: `003-full-run-with-extension-fixes`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description from spec-002.md: NATS startup, Claude Agent SDK integration, Chrome extension UI fixes

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Launches Vex and NATS Starts Automatically (Priority: P1)

A developer opens the Vex Electron application. NATS starts automatically as a managed child process without any manual intervention. The developer sees a healthy system status and can proceed to use the Chrome extension for visual editing.

**Why this priority**: NATS is the communication backbone. Without it running reliably, no real-time events flow between components and no end-to-end workflow is possible.

**Independent Test**: Launch the Electron app and verify NATS is reachable on port 4222 within 5 seconds, and the status bar shows a connected state.

**Acceptance Scenarios**:

1. **Given** the Electron app is not running, **When** the developer launches it, **Then** NATS starts automatically and is reachable on port 4222 within 5 seconds.
2. **Given** the Electron app is running with NATS active, **When** the developer quits the app, **Then** NATS is gracefully terminated and the port is released.
3. **Given** the NATS binary is not installed, **When** the developer launches the app, **Then** a clear error message is displayed with installation instructions.
4. **Given** port 4222 is already in use, **When** the developer launches the app, **Then** the app detects the conflict and notifies the developer with guidance.

---

### User Story 2 - Agent Orchestrator Runs Real Claude Agent SDK Agents (Priority: P1)

When the developer submits a batch of visual edits, the AgentManager dispatches the work to a real Claude Agent SDK agent instead of the current stub. The agent processes the task and returns real code change proposals. The developer sees meaningful output rather than placeholder log messages.

**Why this priority**: The stub adapter is non-functional — it logs messages but produces no code changes. Real SDK integration is required for Vex to deliver its core value: turning visual edits into source code changes.

**Independent Test**: Submit a task to the agent-orchestrator and verify it invokes a real Claude Agent SDK process, streams progress, and returns a meaningful code change response.

**Acceptance Scenarios**:

1. **Given** the AgentManager is running and connected to NATS, **When** a task is submitted to the SDK adapter, **Then** it starts a real Claude Agent SDK session, sends the task prompt, and returns the agent's code change response.
2. **Given** an agent task is in progress, **When** the developer requests status, **Then** the system returns the real status (running, completed, failed) rather than a hardcoded stub.
3. **Given** an agent task is in progress, **When** the developer subscribes to logs, **Then** the system streams real agent output (tool usage, text responses, progress).
4. **Given** the Claude Agent SDK is unavailable or authentication fails, **When** a task is submitted, **Then** the system returns a clear error with guidance on how to configure credentials.

---

### User Story 3 - Screenshot Visible in Select Mode Dialog (Priority: P2)

When the developer selects an element in "select" mode, the popup dialog appears with an instruction editor. The dialog should display a screenshot thumbnail of the selected element so the developer can visually confirm they are annotating the correct element.

**Why this priority**: Screenshots provide visual confirmation of element selection. Without them, the developer relies solely on CSS selectors, which can be ambiguous for similar elements.

**Independent Test**: Activate select mode in the Chrome extension, click an element, and verify the popup dialog shows a screenshot thumbnail of the selected element.

**Acceptance Scenarios**:

1. **Given** the extension is in select mode, **When** the developer clicks an element, **Then** the popup dialog displays a screenshot thumbnail showing the selected element with a visual indicator (border/badge).
2. **Given** the popup dialog is open with a screenshot, **When** the developer views the thumbnail, **Then** the screenshot clearly identifies which element is selected (highlighted region, numbered badge).
3. **Given** the page has not finished loading images, **When** the developer clicks an element, **Then** the screenshot captures the current visual state and the dialog does not block while waiting for the capture.

---

### User Story 4 - Resize Mode Shows Visual Borders Around Elements (Priority: P2)

When the developer activates "resize" mode, hovering over elements should show a clear visual border/highlight so they know which element they are about to select for resizing. Currently, no hover feedback is visible.

**Why this priority**: Without hover feedback, the developer cannot tell which element will be selected for resizing, making the mode confusing and error-prone.

**Independent Test**: Activate resize mode, hover over elements, and verify each element gets a visible border on hover.

**Acceptance Scenarios**:

1. **Given** the extension is in resize mode, **When** the developer hovers over an element, **Then** a visible border/highlight appears around the element to indicate it is targetable.
2. **Given** the developer is hovering over an element in resize mode, **When** they move to a different element, **Then** the border moves to the new element and the previous element's border is removed.
3. **Given** an element is selected for resizing (resize handles visible), **When** the developer hovers over other elements, **Then** hover highlighting is suppressed to avoid visual confusion.

---

### User Story 5 - Style Editor Improvements (Priority: P2)

The style editor panel needs three improvements: (a) it should be draggable so the developer can reposition it to avoid obscuring the element being styled, (b) the selected element should show a visible selection border while the style editor is open, and (c) the "copy style" functionality should be accessible as a button within the style editor rather than as a separate mode.

**Why this priority**: These are usability improvements that reduce friction in the styling workflow. Draggability prevents the panel from blocking the view; selection borders confirm context; and consolidating copy-style reduces mode switching.

**Independent Test**: Activate style mode, click an element, verify the style editor appears with a drag handle, the selected element has a visible border, and a "Copy Style" button is present. Drag the panel, use copy style from it.

**Acceptance Scenarios**:

1. **Given** the style editor is open, **When** the developer drags the panel header, **Then** the panel moves to follow the drag and stays at the new position.
2. **Given** the style editor is open, **When** the developer looks at the selected element, **Then** a visible selection border is displayed around it (similar to select mode).
3. **Given** the style editor is open, **When** the developer clicks "Copy Style", **Then** the copy-style workflow begins (pick source, pick target) without switching to a separate mode.
4. **Given** the copy-style mode has been consolidated into the style editor, **When** the developer looks at the mode toolbar, **Then** the standalone "copy style" mode button is no longer present.

---

### User Story 6 - Action List Relocated to Page Toolbar (Priority: P3)

The list of recorded actions should be moved from the extension popup dialog to the on-page floating toolbar (the "flowtable"). The toolbar should have an expandable chevron that, when clicked, opens a larger panel showing all recorded actions with their details.

**Why this priority**: Moving the action list to the on-page toolbar keeps the developer in context — they don't need to switch between the page and the extension popup to review their actions. This is an ergonomic improvement.

**Independent Test**: Record several actions in the extension, then click the expand chevron on the on-page toolbar to verify the action list is displayed with all recorded items.

**Acceptance Scenarios**:

1. **Given** the on-page toolbar is visible, **When** the developer looks at it, **Then** an expandable chevron icon is visible next to the mode buttons.
2. **Given** actions have been recorded, **When** the developer clicks the chevron, **Then** a panel expands below/beside the toolbar showing all recorded actions with their type, selector, and instruction.
3. **Given** the action panel is expanded, **When** the developer clicks the chevron again, **Then** the panel collapses back to the compact toolbar view.
4. **Given** actions are displayed in the expanded panel, **When** the developer interacts with an action (e.g., edit instruction, remove), **Then** the changes are reflected immediately.
5. **Given** the action list has been moved to the on-page toolbar, **When** the developer opens the extension popup, **Then** the popup no longer shows the action list (it has been removed from there).

---

### User Story 7 - End-to-End First Full Run (Priority: P3)

A developer opens Vex, navigates to their live site with the Chrome extension, makes a visual edit (e.g., resizing a button), and submits the batch. The edit flows through the system and a real Claude Agent SDK agent proposes a code change. The developer sees the result.

**Why this priority**: This is the integration validation that confirms all components work together. It depends on US1 and US2 being complete.

**Independent Test**: Perform a single visual edit in the Chrome extension and verify a real code change proposal appears in the Vex UI.

**Acceptance Scenarios**:

1. **Given** the Electron app is running (NATS active, AgentManager running), **When** the developer submits a visual edit batch from the Chrome extension, **Then** the edit reaches the AgentManager, is dispatched to a Claude Agent SDK agent, and the response is delivered back.
2. **Given** a batch has been processed, **When** the developer views the results, **Then** they see proposed code changes rather than stub output.

---

### Edge Cases

- What happens when NATS crashes mid-session? The system should detect the failure and notify the developer, with automatic restart.
- What happens when the Claude Agent SDK agent times out? The system should enforce a timeout and report the failure with actionable guidance.
- What happens when the developer drags the style editor off-screen? The panel should be constrained to remain within the viewport.
- What happens when the developer expands the action panel on the toolbar when no actions are recorded? An empty state message should be shown.
- What happens when the developer resizes their browser window while the style editor is open? The panel should reposition to stay visible.
- What happens when the screenshot capture fails (e.g., Chrome permission issue)? The popup dialog should still open without the screenshot, showing a placeholder.

## Requirements *(mandatory)*

### Functional Requirements

**NATS & Electron:**
- **FR-001**: The Electron app MUST start the NATS server as a managed child process during application startup.
- **FR-002**: The Electron app MUST detect port conflicts and missing NATS binary, displaying actionable error messages.
- **FR-003**: The Electron app MUST gracefully terminate NATS on shutdown and clean up orphaned processes on startup.
- **FR-004**: The Electron app MUST monitor NATS health and restart it on crash (max 3 attempts).

**Agent SDK Integration:**
- **FR-005**: The agent-orchestrator MUST replace the stub Claude Code SDK adapter with a real Claude Agent SDK integration.
- **FR-006**: The agent-orchestrator MUST stream real-time agent output (text, tool usage, progress) to subscribers via the message bus.
- **FR-007**: The agent-orchestrator MUST handle SDK errors (authentication, timeouts, unavailability) with clear, actionable messages.
- **FR-008**: The agent-orchestrator MUST track real agent status (starting, running, completed, failed) instead of stub values.

**Chrome Extension — Select Mode:**
- **FR-009**: The popup dialog in select mode MUST display a screenshot thumbnail of the selected element.

**Chrome Extension — Resize Mode:**
- **FR-010**: Resize mode MUST show a visible hover border around elements when the developer hovers over them.

**Chrome Extension — Style Editor:**
- **FR-011**: The style editor panel MUST be draggable by its header area.
- **FR-012**: The style editor MUST show a visible selection border around the currently styled element.
- **FR-013**: The style editor MUST include a "Copy Style" button that initiates the copy-style workflow.
- **FR-014**: The standalone "copy style" mode MUST be removed from the mode toolbar after consolidation into the style editor.

**Chrome Extension — Action List:**
- **FR-015**: The on-page toolbar MUST include an expandable chevron that reveals a panel of recorded actions.
- **FR-016**: The action panel MUST display action type, element selector, and instruction for each recorded action.
- **FR-017**: The action panel MUST support inline editing and removal of actions.
- **FR-018**: The action list MUST be removed from the extension popup dialog.

### Key Entities

- **NATS Process**: Managed child process with attributes: process ID, port, health status, restart count.
- **Agent Session**: A real Claude Agent SDK session with attributes: session ID, status, current task, output stream.
- **Action**: A recorded visual edit with attributes: type, CSS selector, instruction, screenshot, metadata.
- **Action Panel**: An expandable UI component on the on-page toolbar that displays the list of recorded actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: NATS is reachable within 5 seconds of Electron app launch in 99% of startups.
- **SC-002**: Agent tasks produce real code change proposals (not stub output) for 100% of valid submissions.
- **SC-003**: The screenshot thumbnail appears in the select-mode dialog within 1 second of element selection in 95% of cases.
- **SC-004**: Hover borders in resize mode appear within 100 milliseconds of mouse entering an element.
- **SC-005**: The style editor can be dragged to any position within the viewport without losing functionality.
- **SC-006**: A developer can complete an end-to-end visual edit cycle (select, edit, submit, receive code change) within 2 minutes for a single element.
- **SC-007**: 90% of developers can discover and use the expanded action panel on the toolbar without instruction.

## Assumptions

- The NATS server binary is available as a standalone executable and the developer installs it on PATH before first use.
- The developer has valid Claude API credentials configured on their machine.
- The Chrome extension is already installed and functional for basic mode switching and element interaction.
- The existing popup dialog in select mode already captures screenshots but does not display them — the infrastructure for capture exists.
- The on-page toolbar (flowtable) already supports mode buttons and is draggable — adding an expand chevron extends the existing component.
- The style editor panel already has a header with a close button — adding drag behavior extends the existing header interaction.

## Scope

### In Scope

- NATS child process management hardening (port conflict, orphan cleanup, health check)
- Replacing the stub SDK adapter with real Claude Agent SDK integration
- Screenshot display in select-mode popup dialog
- Hover highlighting in resize mode
- Style editor: draggability, selection border, copy-style button integration
- Action list relocation from popup to on-page toolbar
- Removal of standalone copy-style mode
- End-to-end flow validation

### Out of Scope

- K8s deployment variant
- New visual editing modes or action types
- Chrome extension installation/onboarding flow
- Multi-agent orchestration
- NATS authentication/TLS configuration
- NATS binary bundling into Electron app resources (deferred — PATH install for now)
- Mobile/responsive layout for extension panels
