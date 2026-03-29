# Feature Specification: Vex — Visual Web Development Tool

**Feature Branch**: `001-vex-visual-editor`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Vex is a visual web development tool that lets a developer point at elements on their live website, make visual edits, and have an AI coding agent apply those changes to the actual source code."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select and Annotate Elements for Code Changes (Priority: P1)

A developer opens their live website in Chrome with the Vex extension active. They click on a button element, type an instruction like "add a gradient background from indigo to purple," and the extension captures element metadata, a screenshot, and the instruction. They repeat this for several elements, then hit "Send Batch." The AI agent receives the batch, interprets each action, and modifies the actual source files accordingly.

**Why this priority**: This is the core value proposition — visually pointing at elements and describing changes. Without this, Vex has no reason to exist.

**Independent Test**: Can be fully tested by selecting elements, typing instructions, sending a batch, and verifying the agent modifies source files correctly. Delivers the fundamental "point-and-describe" editing value.

**Acceptance Scenarios**:

1. **Given** the extension is active on a live website, **When** the developer clicks an element in Select Mode, **Then** the element is highlighted and element metadata (CSS selector, computed styles, bounding rect, text content) is captured along with a viewport screenshot.
2. **Given** an element is selected, **When** the developer types a text instruction and confirms, **Then** the action (selector + instruction + screenshot) is added to the current action list.
3. **Given** the developer has accumulated multiple actions, **When** they press "Send Batch," **Then** a batch object containing all actions in chronological order, page URL, and project ID is submitted to the AgentManager.
4. **Given** a batch is submitted, **When** the AI agent processes it, **Then** the agent modifies the correct source files in the project directory, using the project's framework and styling conventions.

---

### User Story 2 - Edit the Live DOM and Send Changes as a Batch (Priority: P1)

A developer switches to Edit Mode and directly manipulates the live DOM: adds a new paragraph after a heading, edits button text by double-clicking, deletes an obsolete badge, duplicates a feature card, and reorders navigation links by dragging. Each mutation is recorded as a structured operation. When satisfied, the developer sends the batch and the agent translates these DOM-level edits into idiomatic source code changes.

**Why this priority**: DOM editing (add, delete, duplicate, move, edit text, wrap) is the second essential interaction model. Together with Select Mode, it covers the two primary ways developers communicate visual intent.

**Independent Test**: Can be tested by performing DOM edits in Edit Mode, sending the batch, and verifying each edit is reflected in the source code.

**Acceptance Scenarios**:

1. **Given** Edit Mode is active, **When** the developer clicks a "+" handle at a block element edge, **Then** a tag selector and text input popup appears, and inserting creates a new element at that position with before/after screenshots captured.
2. **Given** Edit Mode is active, **When** the developer double-clicks a text element, **Then** the text becomes editable inline, and on deselect the before/after text content is recorded.
3. **Given** Edit Mode is active, **When** the developer presses Delete on a selected element, **Then** the element is removed from the DOM and the deletion (including the removed HTML) is recorded.
4. **Given** Edit Mode is active, **When** the developer drags an element to reorder it among siblings, **Then** the move is recorded with parent selector, from-index, and to-index.
5. **Given** the developer has performed multiple DOM edits, **When** they send the batch, **Then** the agent applies each edit to the source code in order, producing idiomatic code (not raw HTML paste).

---

### User Story 3 - Visually Resize Elements with Semantic Deltas (Priority: P2)

A developer switches to Resize Mode, clicks a call-to-action button, and drags a handle to make it wider. The extension applies the resize live, captures before/after styles, computes a semantic delta ("made ~50% wider"), and records the action. The agent receives human-readable deltas and translates them into the project's styling system (e.g., changing Tailwind classes or CSS values).

**Why this priority**: Resize is a natural visual editing gesture but less frequently used than select/annotate or DOM editing. It builds on the core batch infrastructure.

**Independent Test**: Can be tested by resizing an element, verifying the semantic delta description is accurate, sending the batch, and confirming the agent updates the correct style values.

**Acceptance Scenarios**:

1. **Given** Resize Mode is active and an element is clicked, **When** the developer drags a resize handle, **Then** the element resizes live and eight resize handles plus padding/margin visualizations are displayed.
2. **Given** a resize is completed, **When** the drag ends, **Then** before/after styles are captured and semantic deltas are computed (e.g., ratio, human-readable description like "made ~50% wider").
3. **Given** a resize results in less than 5% change, **When** the drag ends, **Then** a keep/discard confirmation is shown.

---

### User Story 4 - Edit Styles with a Visual Style Panel (Priority: P2)

A developer switches to Style Mode, clicks a card title, and a compact style editor panel appears. They change the font to Playfair Display, increase the font size, change the color to indigo, and add a hover scale effect. All changes apply live. On deselect, before/after screenshots are captured and the style changes are recorded with human-readable descriptions. The agent uses these to update the source code using the project's styling approach.

**Why this priority**: Style editing covers fine-grained visual tweaks (colors, typography, spacing, borders, hover effects) that complement the broader Select and Edit modes.

**Independent Test**: Can be tested by opening the style panel, making style changes, verifying live preview, and confirming the agent applies changes using the project's styling system.

**Acceptance Scenarios**:

1. **Given** Style Mode is active and an element is clicked, **Then** a compact style editor panel appears with sections for colors, typography, spacing, borders, visibility, and hover effects.
2. **Given** the style panel is open, **When** the developer changes a CSS property (e.g., font family, color), **Then** the change is applied live to the element on the page.
3. **Given** style changes have been made, **When** the developer deselects or closes the panel, **Then** before/after screenshots are captured and each change is recorded with property name, before/after values, and a human-readable description.
4. **Given** the developer adds hover effects (e.g., scale, shadow), **When** the action is recorded, **Then** hover changes include the hover property, value, and transition settings.

---

### User Story 5 - Generate New Sections and Images with AI (Priority: P2)

A developer sees a large "+" divider between page sections, clicks it, and types "a testimonials section with 3 cards, each with a quote, name, and role." The request is sent to an AI agent, which generates HTML. The generated section appears live on the page. Similarly, the developer clicks an image and chooses "Generate" to replace it with an AI-generated image based on a prompt. Both generation types flow through a real-time bidirectional channel so results appear without page reload.

**Why this priority**: AI generation is a differentiating feature but depends on the core batch/agent infrastructure being in place. It adds significant value for rapid prototyping.

**Independent Test**: Can be tested by triggering section generation, verifying the generated HTML appears in the live page, and confirming the round-trip communication completes within the timeout.

**Acceptance Scenarios**:

1. **Given** Edit Mode is active, **When** the developer clicks a section "+" divider, **Then** a dialog with a textarea, style hint dropdown, and Generate button appears.
2. **Given** a generation prompt is submitted, **When** the agent generates HTML, **Then** the result is delivered back to the extension in real-time and injected into the live page.
3. **Given** a generation request is sent, **When** no result arrives within 30 seconds, **Then** the extension shows a timeout message with retry and cancel options.
4. **Given** an image element is clicked in Edit Mode, **When** the developer chooses "Generate" and provides a prompt, **Then** the agent generates an image and the element's source is updated with the result.

---

### User Story 6 - Manage Projects and Agents via Desktop App (Priority: P2)

A developer launches the Vex desktop application and sees a project list. They add a new project by selecting a folder, and the system auto-detects the framework, dev server command, package manager, and styling approach. They start the dev server from the app, see status indicators, and view connected agents with their capabilities and health. The developer can start, stop, and restart agents, and view live logs.

**Why this priority**: The desktop app is the management shell — developers need it to configure projects and monitor agents, but it's not the primary editing interface (the Chrome extension is).

**Independent Test**: Can be tested by launching the app, adding a project folder, verifying auto-detection, starting the dev server, and confirming agent status display.

**Acceptance Scenarios**:

1. **Given** the app is launched, **When** the developer adds a project folder, **Then** the system auto-detects framework, dev server command, package manager, styling approach, and port.
2. **Given** a project is configured, **When** the developer clicks "Start," **Then** the dev server starts, the ready URL is detected, and the project status shows "running."
3. **Given** agents are connected, **When** the developer views the agent panel, **Then** each agent's name, type, capabilities, status, and health are displayed.
4. **Given** the dev server is running, **When** the developer opens the Chrome extension on the dev server URL, **Then** the extension auto-detects the project.

---

### User Story 7 - Connect External Agents (Priority: P3)

A developer who already uses their own Claude Code session, Cursor, or another AI tool wants to connect it to Vex without Vex managing the agent process. They install a plugin, add an MCP server, or paste REST instructions into their agent. The external agent can then pull pending batches from Vex, process them, and report results back.

**Why this priority**: External agent integration expands Vex's ecosystem but is an advanced use case. The core experience works with the built-in managed agent.

**Independent Test**: Can be tested by connecting an external agent via one of the three methods, submitting a batch from the extension, and verifying the external agent can retrieve and process it.

**Acceptance Scenarios**:

1. **Given** a developer has an external agent running, **When** they register it with Vex (via plugin, MCP, or REST), **Then** the agent appears in the Vex agent panel with its capabilities.
2. **Given** an external agent is registered, **When** a batch is submitted from the extension, **Then** the agent can retrieve the batch via the appropriate interface (plugin command, MCP tool, or REST endpoint).
3. **Given** an external agent has processed a batch, **When** it posts the result back, **Then** the task status updates in the Vex UI.

---

### User Story 8 - Copy Styles Between Elements (Priority: P3)

A developer activates the Copy Style tool, clicks a source element (e.g., a well-styled card title), then clicks a target element (e.g., a sidebar title). The target inherits the source's visual styles. The developer can use modifier keys to copy only text styles or only box styles. The action is recorded and sent to the agent.

**Why this priority**: Style copying is a convenience feature that speeds up visual consistency work but is not essential for the core editing flow.

**Independent Test**: Can be tested by copying styles between two elements and verifying the property map is correctly recorded and applied by the agent.

**Acceptance Scenarios**:

1. **Given** Copy Style tool is active, **When** the developer clicks a source then a target element, **Then** the target receives the source's visual styles and the copied property map is recorded.
2. **Given** the developer holds Shift while clicking the target, **Then** only text-related styles are copied.
3. **Given** the developer holds Alt while clicking the target, **Then** only box-related styles (spacing, borders) are copied.

---

### Edge Cases

- What happens when a CSS selector generated at action time goes stale due to SPA re-renders? Screenshots serve as ground truth for the agent.
- What happens when the developer makes conflicting actions on the same element (e.g., resize then delete)? Actions are processed sequentially in chronological order; the agent applies them in order and handles conflicts.
- What happens when the Chrome extension cannot connect to the desktop app or message bus? The extension shows connection status and error messages; generation features degrade gracefully to REST polling.
- What happens when the dev server port conflicts with other running services? Ports are configurable via the desktop app settings.
- What happens when content is inside an iframe? Content inside iframes is not selectable; this is a known limitation.
- What happens when the developer makes a very small resize (under 5%)? A keep/discard confirmation is shown to avoid accidental changes.
- What happens when the AI agent crashes mid-task? The system detects the crash via heartbeat timeout, marks the task as failed, and notifies the developer who can retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a browser-based visual editor that lets developers select elements on any live website and annotate them with text instructions.
- **FR-002**: The system MUST capture element metadata (CSS selector, computed styles, bounding rect, text content, attributes) and viewport screenshots for each interaction.
- **FR-003**: The system MUST support DOM editing operations: insert, edit text, delete, duplicate, move, and wrap elements, with structured recording of each operation.
- **FR-004**: The system MUST provide visual element resizing with live preview, before/after style capture, and human-readable semantic delta descriptions.
- **FR-005**: The system MUST provide a visual style editor panel for modifying colors, typography, spacing, borders, visibility, and hover effects with live preview.
- **FR-006**: The system MUST support AI-powered generation of new page sections and images from text prompts, with results delivered in real-time and injected into the live page.
- **FR-007**: The system MUST collect all recorded actions into a chronologically ordered batch and submit it to the AI agent for source code implementation.
- **FR-008**: The AI agent MUST interpret visual editing actions and translate them into idiomatic source code changes that match the project's framework and styling conventions.
- **FR-009**: The system MUST provide a desktop application that manages projects, dev servers, and AI agents with status monitoring and live logs.
- **FR-010**: The system MUST auto-detect project framework, dev server command, package manager, styling approach, and port when a project folder is added.
- **FR-011**: The system MUST support real-time bidirectional communication between the browser extension and AI agents for generation requests and results.
- **FR-012**: The system MUST provide agent lifecycle management: start, stop, restart, health monitoring via heartbeats, and automatic crash recovery.
- **FR-013**: The system MUST support three tiers of agent integration: native managed agents, CLI-wrapped agents, and externally managed agents that pull work via plugin, MCP, or REST.
- **FR-014**: The system MUST route tasks to agents based on matching capabilities, with preference for higher-tier (more integrated) agents.
- **FR-015**: The system MUST support undo (Ctrl+Z) for DOM mutations in the browser extension.
- **FR-016**: The system MUST display a floating toolbar in the browser with mode switching (Select, Edit, Resize, Style, Copy Style, Visibility), action count, and a Send button.
- **FR-017**: The system MUST provide a browser extension popup showing connection status, project selector, action list, and batch controls.
- **FR-018**: The system MUST support image replacement via file upload, URL, or AI-generated prompt.
- **FR-019**: The system MUST generate robust CSS selectors using ID-first, then tag.class uniqueness check, then ancestor path with nth-of-type.
- **FR-020**: The system MUST be framework-agnostic — working with any web framework that renders to a browser, with framework awareness residing entirely in the AI agent.

### Key Entities

- **Project**: A web development project with a folder path, auto-detected framework and styling approach, dev server configuration, and status. Each project has associated batches and agents.
- **Action**: A single visual editing operation (select, insert, editText, delete, duplicate, move, wrap, resize, styleChange, replaceImage, generateSection, copyStyle) with element metadata, screenshots, and semantic descriptions.
- **Batch**: A chronologically ordered collection of actions captured during an editing session, scoped to a project and page URL, submitted as a unit to the AI agent.
- **Agent**: An AI coding agent (managed or external) with a name, type, integration tier, capabilities, health status, and project assignment. Agents receive batches and translate visual intent into source code changes.
- **Task**: A generation request (section or image) with a prompt, context, status lifecycle (pending, assigned, in-progress, completed, failed), and result.
- **Generation Request/Result**: A real-time message pair for AI-generated content — the request contains a prompt and page context; the result contains generated HTML or an image reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can select an element, type an instruction, and send a batch that results in correct source code changes within 2 minutes of total interaction time.
- **SC-002**: All six interaction modes (Select, Edit, Resize, Style, Copy Style, Visibility) are accessible within one click or keyboard shortcut from any mode.
- **SC-003**: DOM editing operations (insert, delete, duplicate, move, edit text) take effect live in the browser within 200ms of the user action.
- **SC-004**: AI-generated sections and images appear in the live page within 30 seconds of prompt submission.
- **SC-005**: Project auto-detection correctly identifies framework, dev server command, and styling approach for at least 90% of standard web project configurations.
- **SC-006**: The system remains responsive and functional with batches containing up to 50 actions with before/after screenshots.
- **SC-007**: Agent health issues (crashes, disconnections) are detected and surfaced to the developer within 60 seconds.
- **SC-008**: An external agent can be connected to Vex (via plugin, MCP, or REST) and process its first batch within 5 minutes of setup.
- **SC-009**: The browser extension works on any website regardless of the web framework used to build it.
- **SC-010**: The desktop application launches all required background services and reaches a "ready" state within 15 seconds on standard hardware.

## Assumptions

- The developer uses Google Chrome as their browser (Chrome extension, Manifest V3).
- The developer's projects have standard web project structures with recognizable configuration files (package.json, framework config files, lock files).
- The AI agent has filesystem access to the project directory (for local deployment mode).
- Network ports for the management service (default 8420), message bus (default 4222), and WebSocket listener (default 4223) are available or configurable.
- The initial release ships with one built-in managed AI agent; additional agent adapters are added incrementally.
- Content inside iframes is out of scope and not selectable.
- The tool operates in single-user mode for the local desktop deployment.
- Screenshots are captured as JPEG at 0.75 quality, resulting in 50-200KB per screenshot, with batch sizes up to 50MB.
- The developer manages their own dev server startup if not using the desktop app's built-in dev server management.

## Scope Boundaries

**In scope:**
- Chrome extension with all six interaction modes
- Desktop application with project management and agent orchestration
- Management service with REST endpoints for projects, batches, agents, and tasks
- Real-time message bus for bidirectional communication
- AI agent integration with three tiers (native, CLI wrapper, external)
- Local single-user desktop deployment

**Out of scope:**
- Multi-user/team collaboration features
- Cloud/Kubernetes deployment (future project, same protocol)
- Browser extensions for Firefox, Safari, or other browsers
- Mobile/responsive design preview tools
- Version control integration (git commits, PRs)
- AI agent training or model fine-tuning
- Code review or approval workflows
