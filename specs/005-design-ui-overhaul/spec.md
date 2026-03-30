# Feature Specification: Electron App UI Overhaul Following Design System

**Feature Branch**: `005-design-ui-overhaul`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Follow design (for electron-app) and pages in this project /home/lukas/Projects/Github/0mg.ai/ai-server/designs/11/src, and apply them in our project (use our functionality)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Between App Sections via Sidebar (Priority: P1)

A user opens the Vex desktop app and sees a collapsible sidebar on the left with navigation items: Projects, Activity, and Settings. Clicking each item navigates to the corresponding page. The sidebar can be collapsed to icon-only mode and expanded back. The active page is visually highlighted with a left violet border. A status bar at the bottom shows real-time NATS connection status, active project name, current agent task, and app version.

**Why this priority**: The sidebar and layout shell are the foundational structure that all other pages render within. Without this, no other UI work can be demonstrated or tested.

**Independent Test**: Can be tested by launching the app and verifying sidebar navigation works across all routes, collapse/expand toggles, and status bar updates.

**Acceptance Scenarios**:

1. **Given** the app is launched, **When** the user sees the main window, **Then** a sidebar with Projects, Activity, and Settings navigation items is visible on the left, and the Projects page is shown by default.
2. **Given** the sidebar is expanded, **When** the user clicks the collapse button, **Then** the sidebar collapses to icon-only mode with tooltips on hover.
3. **Given** the user is on any page, **When** they click a different navigation item, **Then** the main content area transitions to the selected page and the active item is highlighted.
4. **Given** the app is running, **When** a project has an active dev server, **Then** the status bar shows the project name, server status (pulsing green dot), and current agent task.

---

### User Story 2 - Browse and Manage Projects (Priority: P1)

A user navigates to the Projects page and sees their registered projects displayed as cards in a grid or list view. Each card shows the project name, framework badge, path, dev server status, and last activity. The user can search/filter projects, toggle between grid and list views, and add new projects. When no projects exist, an empty state with a clear call-to-action is shown.

**Why this priority**: Projects are the core entity of Vex. The project list is the landing page and the primary entry point for all workflows.

**Independent Test**: Can be tested by viewing the project list with existing projects, searching/filtering, toggling views, and verifying the empty state appears when no projects exist.

**Acceptance Scenarios**:

1. **Given** the user has registered projects, **When** they view the Projects page, **Then** project cards are displayed in a grid layout showing name, framework, status, path, and last activity.
2. **Given** the project list is visible, **When** the user types in the search bar, **Then** projects are filtered by name, framework, or path in real time.
3. **Given** the project list is visible, **When** the user toggles between grid and list view, **Then** the layout switches accordingly.
4. **Given** no projects are registered, **When** the user views the Projects page, **Then** an empty state with an illustration and "Add Project" button is shown.
5. **Given** a project card is visible, **When** the user hovers over it, **Then** quick action buttons (play/stop, delete) appear.

---

### User Story 3 - View Project Detail with Batches and Dev Server Logs (Priority: P1)

A user clicks on a project card to open the project detail page. The page shows a header with the project name, framework badge, and server controls. A left panel displays project metadata (path, framework, styling, package manager, dev server info, stats). The right panel has tabs for "Batches" and "Dev Server Logs". Batches show a searchable, filterable list of batch execution records. Dev Server Logs show a terminal-like log viewer with level filtering, search highlighting, and auto-scroll.

**Why this priority**: Project detail is where users spend most of their time managing individual projects, monitoring batches, and reading logs.

**Independent Test**: Can be tested by clicking into a project, verifying metadata display, toggling tabs, filtering batches, and reading dev server logs.

**Acceptance Scenarios**:

1. **Given** the user clicks a project card, **When** the detail page loads, **Then** the header shows project name, framework badge, and a play/stop button for the dev server.
2. **Given** the project detail is open, **When** the user views the left panel, **Then** project identity (name, path, framework, styling, package manager) and dev server info (URL, port, command, PID, uptime) are displayed.
3. **Given** the Batches tab is active, **When** the user searches or filters by status, **Then** the batch list updates to show matching results with batch ID, page path, action count, duration, cost, and timestamp.
4. **Given** a batch card is visible, **When** the user clicks to expand it, **Then** individual actions within the batch are shown, and a "View agent trace" link is available if applicable.
5. **Given** the Dev Server Logs tab is active, **When** logs are streaming, **Then** color-coded log lines appear with timestamps, level filtering works, and auto-scroll keeps the view at the latest entry.

---

### User Story 4 - View Agent Execution Trace (Priority: P2)

A user clicks "View agent trace" from a batch card to see a detailed step-by-step timeline of the agent's execution. The trace page shows the agent name, model, status, duration, cost, and token usage in a header. The body displays a vertical timeline of steps: thinking, text output, tool calls with results, diffs with syntax highlighting, subagent spawns, skill invocations, and errors.

**Why this priority**: Agent traces provide critical debugging and transparency into what the AI agent did. Important for trust and troubleshooting, but secondary to core project management.

**Independent Test**: Can be tested by navigating to a trace from a batch, verifying the step timeline renders all step types correctly, and checking that collapsible sections work.

**Acceptance Scenarios**:

1. **Given** a batch has an agent trace, **When** the user clicks "View agent trace", **Then** the trace page loads showing agent name, model badge, status, duration, cost, and token count.
2. **Given** the trace page is loaded, **When** steps are displayed, **Then** each step type renders distinctly: thinking (brain icon, italic), tool calls (wrench icon, purple), diffs (red/green lines), errors (red box).
3. **Given** a step contains long text, **When** displayed, **Then** it is collapsible with a "Show more/less" toggle.

---

### User Story 5 - Monitor Activity Feed (Priority: P2)

A user navigates to the Activity page to see a chronological timeline of all events across projects and agents. Events are grouped by time period (Just now, Earlier today, Yesterday, Older). The user can filter by project, event type, and text search. A stats bar shows aggregate metrics: completed batches, failed batches, total actions, active agents, and total cost.

**Why this priority**: Activity provides cross-project observability. Valuable for power users managing multiple projects, but not essential for basic project workflows.

**Independent Test**: Can be tested by viewing the activity page, verifying events appear in chronological groups, filtering works, and stats update accordingly.

**Acceptance Scenarios**:

1. **Given** the user navigates to Activity, **When** the page loads, **Then** a timeline of events is displayed grouped by time period with a stats bar at the top.
2. **Given** the activity feed is visible, **When** the user filters by project or event type, **Then** the timeline updates to show only matching events.
3. **Given** events exist, **When** the user views an event entry, **Then** it shows the project name, agent (if applicable), timestamp, event summary, and metadata (batch ID, action count, cost).

---

### User Story 6 - Configure Application Settings (Priority: P2)

A user navigates to Settings and sees a tabbed layout with sections: General, Ports & Networking, Agent Configuration, Storage, and About. Each section allows configuration of relevant parameters. Changes are saved with visual confirmation. The About section shows app version, build info, and links to resources.

**Why this priority**: Settings are necessary for customization but users interact with them infrequently. The current Settings page already exists but needs to be expanded to match the full design.

**Independent Test**: Can be tested by navigating to each settings tab, modifying values, saving, and verifying persistence.

**Acceptance Scenarios**:

1. **Given** the user opens Settings, **When** the page loads, **Then** a left tab bar shows General, Ports & Networking, Agent Configuration, Storage, and About sections.
2. **Given** the Ports tab is active, **When** the user changes a port value and saves, **Then** the configuration is persisted and a "Saved" confirmation appears.
3. **Given** the Storage tab is active, **When** the user views it, **Then** a visual storage usage bar shows database, screenshots, logs, and free space.
4. **Given** the About tab is active, **When** the user views it, **Then** app version, Electron version, platform info, and resource links are displayed.

---

### Edge Cases

- What happens when the backend (Agent Orchestrator) is unreachable? Status bar and data-dependent components show clear disconnected/error states.
- What happens when a project's dev server crashes mid-session? The status indicator transitions to error state and logs show the failure reason.
- What happens when the sidebar is collapsed and the user navigates? Navigation still works via icon clicks with tooltips showing the page name.
- What happens when the batch list is empty for a project? An empty state message is shown in the batch tab.
- What happens when an agent trace has hundreds of steps? The step list remains performant through virtualization or lazy rendering.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a collapsible sidebar with navigation items for Projects, Activity, and Settings, with the active page highlighted via a left violet border.
- **FR-002**: System MUST display a persistent status bar showing NATS connection status, active project name, current agent task, and app version.
- **FR-003**: System MUST display projects as cards in a grid layout with name, framework badge (color-coded), dev server status (pulsing indicator), path, and last activity timestamp.
- **FR-004**: System MUST support toggling between grid and list view for the project list.
- **FR-005**: System MUST support real-time search/filtering of projects by name, framework, or path.
- **FR-006**: System MUST show a project detail page with a two-column layout: metadata panel (left) and tabbed content area (right).
- **FR-007**: System MUST display batch execution records with status, batch ID, page path, action count, duration, cost, timestamp, and expandable action details.
- **FR-008**: System MUST display dev server logs in a terminal-like viewer with log level filtering, text search with highlighting, auto-scroll toggle, and color-coded entries.
- **FR-009**: System MUST display agent execution traces as a step-by-step vertical timeline with distinct rendering per step type (thinking, text, tool_call, tool_result, diff, subagent_spawn, skill_invoke, error).
- **FR-010**: System MUST display an activity timeline grouped by time period (Just now, Earlier today, Yesterday, Older) with filtering by project, event type, and text search.
- **FR-011**: System MUST display activity aggregate statistics: completed batches, failed batches, total actions, active agents, and total cost.
- **FR-012**: System MUST provide settings pages for General (theme, startup behavior), Ports & Networking, Agent Configuration (API key, concurrency, restart behavior), Storage (paths, usage visualization, cleanup), and About (version info, resource links).
- **FR-013**: System MUST show empty states with illustrations and call-to-action buttons when project lists, batch lists, or activity feeds contain no items.
- **FR-014**: System MUST apply the Catppuccin Mocha dark theme with electric violet (#7C3AED) primary accent, consistent across all pages.
- **FR-015**: System MUST apply smooth animations for sidebar collapse/expand, page transitions, card entry stagger, and interactive element state changes.
- **FR-016**: System MUST fetch and display real data from existing backend APIs via the IPC bridge, not mock data.

### Key Entities

- **Project**: Name, path, framework, styling, package manager, dev server state (status, URL, port, PID, uptime), batch count, last activity.
- **Batch**: ID, project reference, status, page URL, action count, duration, cost, individual actions (type, target, before/after), error message, associated agent trace reference.
- **Agent**: Name, type, tier (model), status, capabilities, assigned projects, heartbeat, uptime, completed/failed task counts, health history, current task.
- **Agent Trace**: ID, batch reference, agent name and model, status, total duration, cost, tokens, ordered execution steps.
- **Activity Event**: Type (batch/task/agent/server event), timestamp, project name, agent name, summary text, metadata (batch ID, action count, cost).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate between all app sections (Projects, Activity, Settings) within 1 click from any page via the sidebar.
- **SC-002**: Users can find a specific project from a list of 20+ projects within 5 seconds using search.
- **SC-003**: Users can view a project's batch history and dev server logs without leaving the project detail page.
- **SC-004**: Users can trace the full execution of an agent from batch card to individual steps, understanding what the agent did at each point.
- **SC-005**: Users can monitor cross-project activity from a single view, filtering to relevant events within 2 interactions.
- **SC-006**: All pages load and render within 1 second of navigation.
- **SC-007**: The UI visually matches the design reference with consistent colors, typography, spacing, and animations across all pages.
- **SC-008**: The app gracefully handles disconnected/error states for all backend-dependent components without crashing or showing blank screens.

## Assumptions

- The existing IPC bridge and backend APIs (Agent Orchestrator) provide most necessary data endpoints. New endpoints may need to be added for activity events and agent traces.
- The Catppuccin Mocha theme will replace the current inline style approach with a structured CSS/styling system.
- The current simple state-based routing will be replaced with a proper routing approach to support nested routes (e.g., project detail -> agent trace).
- The design reference uses shadcn/ui and Tailwind CSS; the Vex implementation will adapt the visual design to match the look without necessarily adopting those exact dependencies.
- Batch and agent trace data models may need backend additions to fully support the UI requirements.
