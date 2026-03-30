# Feature Specification: Dev Server Management & Project Onboarding

**Feature Branch**: `004-dev-server-github-onboarding`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Dev Server Management & Project Onboarding — move dev server lifecycle to Electron, add GitHub URL-based project onboarding"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start and Stop a Dev Server (Priority: P1)

A non-technical user (designer, PM, content person) opens Vex, selects an existing project, and clicks **Start**. Vex spawns the project's dev server, detects the URL from stdout, and enables the **Open** button. The user clicks Open to view the running site in a browser. When done, they click **Stop** and the dev server process is cleanly killed.

**Why this priority**: This is the core interaction loop. Without reliable start/stop, no other feature matters. The previous approach caused orphaned processes and stuck status. Moving ownership to the desktop app fixes the fundamental reliability issue.

**Independent Test**: Start a project, verify URL is detected and Open button works, stop the project, verify process is killed and status resets to idle.

**Acceptance Scenarios**:

1. **Given** a project with a configured dev command, **When** the user clicks Start, **Then** the dev server process is spawned, status transitions to "starting" then "running", and the detected URL is displayed.
2. **Given** a running dev server, **When** the user clicks Open, **Then** the browser opens at the detected dev server URL.
3. **Given** a running dev server, **When** the user clicks Stop, **Then** the process group is terminated, status transitions to "idle", and the Open button is disabled.
4. **Given** a running dev server, **When** the desktop app is closed, **Then** all spawned dev server processes are killed (no orphans).
5. **Given** a fresh app launch, **When** the app starts, **Then** all project statuses are "idle" (clean slate, no stale state from previous sessions).

---

### User Story 2 - Add Project from GitHub URL (Priority: P1)

A non-technical user wants to work on a project they found on GitHub. They click **Add Project**, choose **From GitHub URL**, paste the repo URL, and Vex handles everything: cloning, detecting the framework, installing dependencies. The project appears in their project list ready to Start.

**Why this priority**: The target user doesn't know git or terminals. Without this, onboarding requires developer assistance, which defeats the product vision. This is equally critical as Story 1 because it's the entry point to the entire experience.

**Independent Test**: Paste a public GitHub repo URL, verify cloning progress is shown, dependencies are installed, and the project appears ready to Start.

**Acceptance Scenarios**:

1. **Given** the Add Project dialog, **When** the user selects "From GitHub URL" and pastes a valid repo URL, **Then** Vex clones the repo to a managed project directory.
2. **Given** a repo is being cloned, **When** the cloning is in progress, **Then** the UI shows progress feedback (cloning... -> installing... -> ready).
3. **Given** a cloned repo, **When** cloning completes, **Then** Vex auto-detects the framework, dev command, package manager, and styling approach.
4. **Given** a cloned repo with a lock file, **When** detection completes, **Then** Vex runs the appropriate dependency install command.
5. **Given** an invalid or inaccessible URL, **When** the user submits it, **Then** a clear error message is displayed (e.g., "Could not access this repository. Check the URL and try again.").
6. **Given** a repo name that already exists in the managed directory, **When** the user tries to add it, **Then** the system handles the conflict (e.g., appends a suffix or prompts the user).

---

### User Story 3 - Add Project from Local Folder (Priority: P2)

A developer who already has a project cloned locally clicks **Add Project**, chooses **From Local Folder**, and selects the project directory. Vex detects the framework and dev command, and the project is ready to Start.

**Why this priority**: This is the existing flow for developers. It's secondary because the target user is non-technical, but it remains important for the developer edge case.

**Independent Test**: Select a local folder containing a web project, verify detection completes and the project is listed.

**Acceptance Scenarios**:

1. **Given** the Add Project dialog, **When** the user selects "From Local Folder" and picks a directory, **Then** the project is added with auto-detected settings.
2. **Given** a selected folder, **When** detection runs, **Then** the framework, dev command, and package manager are identified from project files.

---

### User Story 4 - View Dev Server Logs (Priority: P2)

A user (or support person) wants to see what the dev server is outputting. They can view buffered stdout/stderr logs for the running dev server to diagnose issues.

**Why this priority**: Essential for troubleshooting but not part of the primary happy path. Most users won't need this unless something goes wrong.

**Independent Test**: Start a dev server, open the logs view, verify output is streaming and recent lines are visible.

**Acceptance Scenarios**:

1. **Given** a running dev server, **When** the user views logs, **Then** the most recent stdout/stderr output is displayed (up to 2000 lines buffered).
2. **Given** a dev server that has been stopped, **When** the user views logs, **Then** the last session's logs are still available until the next start.

---

### User Story 5 - Port Conflict Handling (Priority: P3)

A user tries to start a dev server, but the port is already in use by another process. Vex shows a clear error message instead of silently failing or hanging.

**Why this priority**: Edge case that affects reliability. Important for user trust but not part of the core flow.

**Independent Test**: Occupy a port manually, attempt to start a dev server on that port, verify error message appears.

**Acceptance Scenarios**:

1. **Given** a port already in use, **When** the user clicks Start, **Then** an error is displayed: "Port X is in use. Stop the other process first."
2. **Given** a port conflict error, **When** the user resolves the conflict and clicks Start again, **Then** the dev server starts successfully.

---

### Edge Cases

- What happens when the user's disk is full during clone or install?
- How does the system handle a dev server that crashes immediately after starting?
- What happens if the GitHub URL points to a very large repo (multi-GB)?
- How does the system handle repos that require authentication (private repos)?
- What happens if dependency install fails due to runtime version mismatch?
- What happens if the cloned repo has no recognizable framework (no package.json)?
- How does the system behave if the user's internet drops during cloning?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The desktop app MUST own the full dev server lifecycle (spawn, monitor, kill) — no process management in the backend API service.
- **FR-002**: Dev server processes MUST be spawned in their own process group so the entire tree can be killed cleanly.
- **FR-003**: System MUST detect the dev server URL by parsing stdout for localhost URL patterns (stripping escape codes).
- **FR-004**: System MUST buffer dev server stdout/stderr in memory (up to 2000 lines).
- **FR-005**: On desktop app close, all spawned dev server processes MUST be terminated.
- **FR-006**: On desktop app restart, all project statuses MUST reset to "idle" (no stale state).
- **FR-007**: When a port is already in use, the system MUST display a clear error message and not attempt to recover or scan for alternatives.
- **FR-008**: The desktop app MUST update project status and dev server URL in the backend API when state changes.
- **FR-009**: System MUST provide an "Add from GitHub URL" option that clones a repo to a managed project directory.
- **FR-010**: After cloning, the system MUST auto-detect the project's framework, dev command, package manager, and styling approach.
- **FR-011**: After detection, the system MUST automatically run the appropriate dependency install command.
- **FR-012**: The UI MUST show progress feedback during clone and install operations (cloning -> installing -> ready).
- **FR-013**: The "Add from folder" option MUST remain available as a secondary choice.
- **FR-014**: System MUST handle clone/install errors gracefully with user-friendly error messages.
- **FR-015**: System MUST handle duplicate repo names in the managed project directory without data loss.

### Key Entities

- **Project**: A web project managed by Vex. Key attributes: name, path, framework, dev command, dev port, package manager, status (idle/starting/running/error), dev server URL.
- **Dev Server Instance**: A running dev server process. Key attributes: process ID, associated project, buffered log output, detected URL, current status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can start a dev server and see the running site within 30 seconds of clicking Start (excluding dependency install time).
- **SC-002**: Stopping a dev server kills all child processes with zero orphaned processes remaining.
- **SC-003**: A non-technical user can go from a GitHub URL to a running dev server in under 5 minutes (including clone and install for a typical project).
- **SC-004**: 100% of desktop app close events result in all dev server processes being terminated (no orphans across 50 consecutive test cycles).
- **SC-005**: Dev server URL is correctly detected and displayed for projects using common frameworks (React, Next.js, Vue, Vite, etc.).
- **SC-006**: Port conflict errors are displayed within 5 seconds of the user clicking Start.
- **SC-007**: Clone and install errors display user-friendly messages that a non-technical user can understand and act on.

## Assumptions

- Git is installed on the user's machine (required for cloning). If not present, the system should detect this and prompt the user to install it.
- A supported runtime (Node.js with npm/yarn/pnpm) is installed. Framework detection relies on the presence of package.json and lock files.
- Only public GitHub repos are supported initially. Private repo support (authentication) is out of scope for this iteration.
- The managed project storage location is `~/.vex/projects/`. This directory is created automatically if it doesn't exist.
- The backend API service remains the source of truth for project metadata (persistent storage), while the desktop app owns runtime process state.
