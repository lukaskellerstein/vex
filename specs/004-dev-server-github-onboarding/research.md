# Research: Dev Server Management & Project Onboarding

**Feature**: 004-dev-server-github-onboarding
**Date**: 2026-03-30

## R-001: DevServerManager Simplification

**Decision**: Strip DevServerManager to three operations: start (spawn + URL detect), stop (kill process group), getLogs (return buffer).

**Rationale**: The current implementation (360 lines) includes `checkRunning` (TCP port probe), `syncProjectStatuses` (startup scan), and `killByPort` (lsof/netstat). These were carryovers from the AO approach and violate the "clean slate on restart" principle. With Electron owning the lifecycle, there's no need for orphan detection or recovery — if Electron didn't spawn it, it doesn't exist.

**Alternatives considered**:
- Keep `checkRunning` for status verification → Rejected: adds false sense of state recovery. If the process crashes, the exit handler already catches it.
- Keep `killByPort` for edge cases → Rejected: user can kill the process themselves. Port conflict error message is sufficient.

## R-002: URL Detection from Stdout

**Decision**: Parse stdout for `https?://localhost:\d+` pattern after stripping ANSI escape codes. First match wins.

**Rationale**: All major Node.js dev servers (Vite, Next.js, Create React App, Vue CLI) print the local URL to stdout. The pattern is consistent enough that a simple regex handles 95%+ of cases. ANSI stripping is needed because many dev servers colorize output.

**Alternatives considered**:
- Port scanning → Rejected: violates the "no scanning" principle. Also unreliable (server might bind but not be ready).
- Parsing framework-specific output → Rejected: over-engineering for marginal gain. The regex works across all common frameworks.

## R-003: Process Group Killing

**Decision**: Spawn with `detached: true`, kill with `process.kill(-pid, 'SIGTERM')` (negative PID kills the process group).

**Rationale**: Dev servers (especially Node.js) spawn child processes (webpack, esbuild, etc.). Killing only the parent leaves children orphaned. Process groups ensure the entire tree is terminated. This is a POSIX standard approach that works on Linux and macOS.

**Alternatives considered**:
- `tree-kill` npm package → Rejected: adds dependency for something the OS already provides.
- Recursive PID walk via `/proc` → Rejected: Linux-only, complex, fragile.

**Platform note**: On Windows, `detached: true` creates a new process group but `process.kill(-pid)` doesn't work. Windows support would need `taskkill /T /F /PID`. This is out of scope for now (Linux/macOS target).

## R-004: Git Clone with Progress

**Decision**: Run `git clone --progress <url> <dest>` via `child_process.spawn()`. Parse stderr for progress lines.

**Rationale**: `git clone --progress` writes progress to stderr (not stdout) in the format `Receiving objects: XX% (N/M)`. This can be parsed and forwarded to the renderer via IPC for a progress indicator. Using `spawn` (not `exec`) allows streaming.

**Alternatives considered**:
- `isomorphic-git` (pure JS git) → Rejected: large dependency, doesn't support all git features, slower for large repos.
- `simple-git` (Node.js wrapper) → Rejected: adds abstraction over a single command. Direct spawn is simpler.
- `degit` (download without .git) → Rejected: user might want to pull updates later.

## R-005: Dependency Installation

**Decision**: Detect package manager from lock file, run the appropriate install command via `child_process.spawn()`.

**Rationale**: Lock file detection is deterministic:
- `pnpm-lock.yaml` → `pnpm install`
- `yarn.lock` → `yarn install`
- `bun.lockb` → `bun install`
- `package-lock.json` or none → `npm install`

The AO's `project_detector.py` already implements this detection. We'll replicate the same logic in TypeScript (5 lines of conditionals) rather than calling the AO for detection during clone flow, since the AO might not have the project registered yet at that point.

**Alternatives considered**:
- Always use npm → Rejected: would generate a new lock file, potentially causing version drift.
- Use the AO's detector → Rejected: chicken-and-egg — project isn't registered in AO until after clone+install completes.

## R-006: Add Project Dialog UX

**Decision**: Replace the current inline "Add Project" flow in ProjectList with a dedicated dialog component that has two tabs: "From GitHub URL" and "From Local Folder".

**Rationale**: The current flow (click button → folder picker → name input) is embedded in ProjectList.tsx and is hard to extend. A dialog component isolates the onboarding logic and makes it easy to show progress states (cloning, installing).

**Alternatives considered**:
- Separate page for adding projects → Rejected: too heavy for a simple form. A dialog keeps the user in context.
- Keep inline in ProjectList → Rejected: adding GitHub flow inline would make ProjectList too complex.

## R-007: Duplicate Repo Name Handling

**Decision**: If `~/.vex/projects/<repo-name>` already exists, append a numeric suffix: `<repo-name>-2`, `<repo-name>-3`, etc.

**Rationale**: Simple, deterministic, no user interaction required. The user can rename the project later via the existing rename feature in ProjectDetail.

**Alternatives considered**:
- Prompt the user → Rejected: adds friction to the onboarding flow for a non-technical user.
- Overwrite → Rejected: destructive, violates FR-015.
- Use UUID suffix → Rejected: ugly, non-memorable names.

## R-008: Error Handling Strategy

**Decision**: All errors (clone failure, install failure, disk full, network error) surface as user-friendly messages in the dialog. No retry logic — user can try again manually.

**Rationale**: The target user is non-technical. Error messages should explain what went wrong in plain language, not show stack traces or git output. Examples:
- "Could not access this repository. Check the URL and try again."
- "Installation failed. Make sure Node.js is installed on your computer."
- "Not enough disk space. Free up some space and try again."

**Alternatives considered**:
- Automatic retry → Rejected: YAGNI. Clone failures are usually not transient (wrong URL, no internet).
- Show raw git/npm output → Rejected: meaningless to target user. Log it for debugging but show friendly message.

---

## Implementation Findings

## R-009: Incremental Log Polling via Offset

**Finding**: The `get-dev-server-logs` IPC channel was implemented with an `offset` parameter rather than returning the full buffer on every call.

**Rationale**: The renderer polls every second. Returning the full 2000-line buffer on each poll would send growing payloads over IPC unnecessarily. The offset approach returns only lines appended since the last poll. `url` and `portError` are included in the same response to avoid additional round-trips.

**Implementation**: `getLogs(projectId, offset)` returns `{ lines: string[], offset: number, running: boolean, url: string | null, portError: string | null }`. The renderer accumulates lines into local state and passes back the updated offset on each call.

## R-010: Port Conflict Detection via Async Log Parsing

**Finding**: Port conflicts cannot be detected synchronously at the time `start-dev-server` returns. The process must spawn and attempt to bind before the error appears in stderr. The implementation parses stderr lines on arrival, stores the conflict message in `DevServer.portError`, and surfaces it via `getLogs`. The renderer displays it inline below the Start/Stop buttons.

**Rationale**: This is more accurate than attempting to pre-check the port (which violates the "no port scanning" constraint) and avoids blocking the IPC response while waiting for a potential error that may never occur.

## R-011: SIGKILL Escalation on Stop

**Finding**: The `stop` method sends SIGTERM to the process group and waits up to 5 seconds for the process to exit. If the process does not exit within that window, SIGKILL is sent. The `before-quit` handler calls `stopAll()` which uses this same mechanism.

**Rationale**: Some dev servers (particularly those running webpack) may not respond immediately to SIGTERM. The 5-second escalation ensures clean shutdown even for unresponsive processes, which is critical for the "no orphans on quit" requirement.

## R-012: `buildRunCommand` Reads `package.json` Instead of Splitting `dev_command`

**Finding**: The AO stores a `dev_command` field (e.g., `"npm run dev"`), but the implementation ignores it and instead reads `package.json` directly to find the first matching script key (`dev`, `start`, `serve`), then constructs the command as `[packageManager, "run", scriptKey]`.

**Rationale**: The stored `dev_command` string may be set to a human-readable value that does not match the actual script key. Reading `package.json` directly is deterministic. The package manager is taken from the AO's `package_manager` field, which is set by `project_detector.py` at registration time.

**Limitation**: If the project's dev script uses a non-standard key not in (`dev`, `start`, `serve`), `buildRunCommand` returns `null` and start fails with "Cannot determine dev command".

## R-013: `installDependencies` Skips Repos Without `package.json`

**Finding**: If the cloned repo does not contain a `package.json`, `installDependencies` returns `{ success: true, packageManager: "npm" }` without running any install command. This is intentional — repos without `package.json` (e.g., non-Node projects, static sites) should not cause an install error during onboarding.

**Rationale**: Non-Node repos may still have other value (e.g., a static HTML site that can be served). Silently skipping install keeps the onboarding flow working rather than failing with a confusing error.

## R-014: `BrowserWindow` Passed Directly for Progress Reporting

**Finding**: Both `cloneRepo` and `installDependencies` accept a `BrowserWindow | null` reference to send progress events directly via `win.webContents.send("clone-progress", ...)`. This avoids the need for an event emitter or callback abstraction.

**Rationale**: Since the clone/install operations live in the Electron main process and `mainWindow` is accessible at call time, passing it directly is the simplest approach. The `null` guard (`if (win && !win.isDestroyed())`) handles the edge case where the window was closed during a long-running clone.
