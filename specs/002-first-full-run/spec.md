# Feature Specification: First Full Run

**Feature Branch**: `002-first-full-run`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Electron app starts NATS binary on launch; agent-orchestrator integrates real Claude Agent SDK"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Launches Vex and NATS Starts Automatically (Priority: P1)

A developer opens the Vex Electron application. As part of the startup sequence, the application automatically starts the NATS message bus as a standalone binary process. The developer does not need to install, configure, or manually start NATS — it is bundled and managed by the Electron app. Once NATS is running, the application is ready to accept connections from the Chrome extension and agent processes.

**Why this priority**: NATS is the communication backbone for all Vex components. Without a running NATS instance, no real-time events can flow between the Chrome extension, AgentManager, and agents. This is the foundational prerequisite for any end-to-end workflow.

**Independent Test**: Launch the Electron app and verify that NATS is reachable on its configured port (default 4222) and that the app UI indicates a healthy system status.

**Acceptance Scenarios**:

1. **Given** the Electron app is not running, **When** the developer launches the Electron app, **Then** NATS starts automatically as a child process and is reachable on port 4222 within 5 seconds of app launch.
2. **Given** the Electron app is running with NATS active, **When** the developer quits the Electron app, **Then** the NATS process is gracefully terminated and the port is released.
3. **Given** the NATS binary is missing or corrupt, **When** the developer launches the Electron app, **Then** the app displays a clear error message explaining that NATS could not be started and suggests remediation steps.
4. **Given** port 4222 is already in use by another process, **When** the developer launches the Electron app, **Then** the app detects the conflict and either uses an alternative port or notifies the developer with actionable guidance.

---

### User Story 2 - Agent Orchestrator Runs Real Claude Agent SDK Agents (Priority: P1)

When the developer submits a batch of visual edits from the Chrome extension, the AgentManager delegates the work to a real Claude Agent SDK agent — not a stub. The agent receives the task, processes it using the Claude Agent SDK, and returns results. The developer sees real code changes proposed by the agent.

**Why this priority**: The current agent adapter is a scaffold that logs stubs. Without a real agent integration, Vex cannot deliver its core value proposition: turning visual edits into actual code changes. This is equally critical as NATS for achieving the first end-to-end run.

**Independent Test**: Send a task to the agent-orchestrator and verify that it invokes a real Claude Agent SDK process, receives a response, and returns meaningful output (not stub log messages).

**Acceptance Scenarios**:

1. **Given** the AgentManager is running and connected to NATS, **When** a task is submitted to the Claude Code SDK adapter, **Then** the adapter starts a real Claude Agent SDK process, sends the task prompt, and returns the agent's response.
2. **Given** an agent task is in progress, **When** the developer requests status, **Then** the system returns the real agent status (running, completed, failed) rather than a hardcoded stub value.
3. **Given** an agent task is in progress, **When** the developer subscribes to logs, **Then** the system streams real agent output (not stub messages).
4. **Given** the Claude Agent SDK is unavailable or authentication fails, **When** a task is submitted, **Then** the system returns a clear error indicating the SDK is not configured or authenticated, with guidance on how to resolve it.

---

### User Story 3 - End-to-End First Full Run (Priority: P2)

A developer opens Vex, opens their project, navigates to their live site in Chrome with the Vex extension, makes a visual edit (e.g., resizing a button), and submits the batch. The edit flows from the Chrome extension through NATS to the AgentManager, which dispatches a real Claude Agent SDK agent. The agent proposes a code change. The developer sees the result in the Vex UI.

**Why this priority**: This is the integration story that validates the two P1 stories working together. It has lower priority because it depends on both P1 stories being complete, but it is the ultimate validation that the system works end-to-end.

**Independent Test**: Perform a single visual edit in the Chrome extension on a test project and verify that a real code change is proposed by the agent and visible in the Vex UI.

**Acceptance Scenarios**:

1. **Given** the Electron app is running (NATS active, AgentManager running), **When** the developer submits a visual edit batch from the Chrome extension, **Then** the edit reaches the AgentManager, is dispatched to a Claude Agent SDK agent, and the agent's response is delivered back to the UI within a reasonable time.
2. **Given** a batch has been submitted and processed, **When** the developer views the results, **Then** they see the proposed code changes (file paths, diffs, or descriptions) rather than stub output.

---

### Edge Cases

- What happens when NATS crashes mid-session? The system should detect the failure and notify the developer, with an option to restart NATS automatically.
- What happens when the Claude Agent SDK agent times out on a large batch? The system should enforce a configurable timeout and report partial results or a timeout error.
- What happens when the developer submits a batch while a previous batch is still in progress? The system should queue the new batch or reject it with a clear message.
- What happens when the Electron app is force-killed (e.g., via task manager)? NATS and agent child processes should be orphan-cleaned on next startup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Electron app MUST bundle the NATS server binary for the host operating system.
- **FR-002**: The Electron app MUST start the NATS server as a managed child process during application startup.
- **FR-003**: The Electron app MUST monitor the NATS child process health and restart it if it crashes unexpectedly.
- **FR-004**: The Electron app MUST gracefully terminate the NATS process when the application shuts down.
- **FR-005**: The Electron app MUST detect port conflicts on NATS startup and handle them (alternative port or user notification).
- **FR-006**: The Electron app MUST clean up orphaned NATS processes from previous ungraceful shutdowns on startup.
- **FR-007**: The agent-orchestrator MUST replace the current stub Claude Code SDK adapter with a real integration that invokes the Claude Agent SDK.
- **FR-008**: The agent-orchestrator MUST support starting, stopping, and querying the status of real Claude Agent SDK agent processes.
- **FR-009**: The agent-orchestrator MUST stream real-time agent output (logs, progress) to subscribers via NATS.
- **FR-010**: The agent-orchestrator MUST handle Claude Agent SDK errors (authentication failures, timeouts, SDK unavailability) with clear, actionable error messages.
- **FR-011**: The system MUST support end-to-end flow: visual edit submission from Chrome extension through NATS to AgentManager to Claude Agent SDK agent, with results returned to the UI.

### Key Entities

- **NATS Process**: A managed child process representing the embedded NATS server instance, with attributes: process ID, port, health status, uptime.
- **Agent Process**: A real Claude Agent SDK process managed by the orchestrator, with attributes: agent ID, task, status (starting, running, completed, failed), output stream.
- **Task**: A unit of work submitted to an agent, containing: project context, visual edit batch, prompt, and metadata.
- **Batch Result**: The agent's response to a task, containing: proposed code changes, file paths, status, and any errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: NATS is reachable and accepting connections within 5 seconds of Electron app launch in 99% of startups.
- **SC-002**: Agent tasks submitted to the orchestrator produce real code change proposals (not stub output) for 100% of valid task submissions.
- **SC-003**: A developer can complete an end-to-end visual edit cycle (select element, edit, submit, receive code change) within 2 minutes for a single-element change.
- **SC-004**: System recovers from NATS process crash within 10 seconds without requiring app restart.
- **SC-005**: Agent errors (authentication, timeout, SDK issues) are reported to the developer with actionable guidance within 5 seconds of failure detection.

## Assumptions

- The NATS server binary is distributed as a single standalone executable with zero runtime dependencies, making it suitable for bundling inside the Electron app.
- The Claude Agent SDK is available as an installable library and supports programmatic invocation (start agent, send prompt, receive response, stream output).
- The developer has valid Claude API credentials configured on their machine (environment variable or config file) before using agent features.
- The default NATS port is 4222, with WebSocket listener on 9222 for Chrome extension connectivity.
- The host operating system is Linux, macOS, or Windows (NATS binaries are available for all three).
- The existing AgentManager REST API and NATS subject structure are sufficient for this feature — no new endpoints or subjects are required beyond what is already designed.

## Scope

### In Scope

- Bundling and managing NATS as a child process in the Electron app
- Replacing the stub Claude Code SDK adapter with a real Claude Agent SDK integration
- End-to-end flow validation from Chrome extension to agent and back
- Error handling for NATS and agent failures
- Process lifecycle management (start, stop, health check, crash recovery)

### Out of Scope

- K8s deployment variant (NATS cluster, remote agents)
- Chrome extension visual editing features (assumed already functional)
- AgentManager REST API changes (assumed existing API is sufficient)
- Multi-agent orchestration (one agent per task is sufficient for first run)
- UI enhancements beyond displaying agent results
- NATS authentication/TLS configuration (local-only, no security needed for first run)
