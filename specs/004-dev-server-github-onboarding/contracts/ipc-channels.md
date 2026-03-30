# IPC Contract: Electron Main ↔ Renderer

**Feature**: 004-dev-server-github-onboarding
**Date**: 2026-03-30

## Existing Channels (modified behavior)

### `start-dev-server`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
projectId: string  // Main fetches full project details from AO internally

// Response (starting successfully)
{ status: "starting" }

// Response (already running)
{ status: "already_running", detail?: string }

// Response (error)
{ status: "error", detail: string }
// e.g., "Cannot determine dev command"
```

**Behavior**: Main fetches project from `GET /api/projects/:id`. Spawns process with `detached: true` and `FORCE_COLOR=0`/`NO_COLOR=1` env vars. Updates AO status to "starting" via PATCH. Begins stdout/stderr parsing for URL detection. On URL found, updates AO with status "running" and dev_server_url. On process exit, updates AO with status "idle" (clean exit) or "error" if a port conflict was detected.

**Note on port conflict**: Port conflicts are detected asynchronously via stderr parsing — NOT returned in this response. The error appears in the `get-dev-server-logs` response's `portError` field.

### `stop-dev-server`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
projectId: string

// Response
{ status: "stopped" } | { status: "not_running" }
```

**Behavior**: Sends SIGTERM to the process group via `process.kill(-pid, 'SIGTERM')`. Waits for process exit (up to 5 seconds), then escalates to SIGKILL. Updates AO status to "idle" and dev_server_url to null.

### `get-dev-server-logs`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
projectId: string, offset: number  // offset = number of lines already received

// Response (server running or recently stopped)
{
  lines: string[],      // New lines since the given offset
  offset: number,       // Updated offset (total lines buffered so far)
  running: boolean,     // true if process is still alive
  url: string | null,   // Detected dev server URL (null until detected)
  portError: string | null  // Port conflict message if detected, e.g. "Port 3000 is in use. Stop the other process first."
}

// Response (no server registered for this project)
{ lines: [], offset: 0, running: false, url: null, portError: null }
```

**Behavior**: Returns only lines appended since the given `offset`. The renderer accumulates these into local state and passes back the updated `offset` on each subsequent call. `url` and `portError` are included in each response to enable polling-based detection without additional IPC channels. Log lines are prefixed: `[out]` for stdout, `[err]` for stderr, `[system]` for lifecycle events.

## New Channels

### `clone-github-repo`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
url: string  // GitHub repo URL, e.g., "https://github.com/user/repo"

// Response (success)
{ success: true, projectPath: string, repoName: string }

// Response (error)
{ success: false, error: string }
// e.g., "Could not access this repository. Check the URL and try again."
// e.g., "Git is not installed on your computer."
// e.g., "Invalid GitHub URL. Expected format: https://github.com/owner/repo"
// e.g., "Not enough disk space. Free up some space and try again."
```

**Behavior**:
1. Check `git --version` is available in PATH; return error if not.
2. Validate URL against `^https://github\.com/[\w.-]+/[\w.-]+\/?$`; return error if invalid.
3. Create `~/.vex/projects/` if it does not exist.
4. Extract repo name from URL (strip trailing `.git` if present).
5. Determine dest path: `~/.vex/projects/<repo-name>` (append `-2`, `-3`, etc. suffix if already exists).
6. Run `git clone --progress <url> <dest>` — progress parsed from stderr.
7. Send progress events via `clone-progress` channel during clone.
8. On completion, return `{ success: true, projectPath, repoName }`.

### `clone-progress`

**Direction**: Main → Renderer (send/on)

```typescript
// Event payload
{
  phase: "cloning" | "installing" | "detecting" | "ready" | "error",
  progress: number,    // 0-100 (approximate)
  message: string      // Human-readable status, e.g., "Receiving objects: 45%"
}
```

**Behavior**: Sent from Main to Renderer during clone and install operations. Renderer updates the AddProjectDialog UI accordingly.

**Subscription via preload**: The preload exposes `onCloneProgress(callback)` which registers an `ipcRenderer.on` listener and returns an unsubscribe function. The dialog calls the unsubscribe function in its React `useEffect` teardown to prevent memory leaks.

```typescript
// preload
onCloneProgress: (callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on("clone-progress", handler);
  return () => ipcRenderer.removeListener("clone-progress", handler);
}
```

### `install-dependencies`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
projectPath: string

// Response (success — dependencies installed or no package.json present)
{ success: true, packageManager: string }  // "npm" | "yarn" | "pnpm" | "bun"

// Response (error)
{ success: false, error: string }
// e.g., "Installation failed. Make sure Node.js is installed on your computer."
// e.g., "Installation failed. Make sure pnpm is installed on your computer."
// e.g., "Not enough disk space. Free up some space and try again."
```

**Behavior**:
1. If no `package.json` exists in `projectPath`, return `{ success: true, packageManager: "npm" }` immediately (no install run).
2. Detect lock file: `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lockb` → `bun`, else `npm`.
3. Run `<pkgManager> install` with `FORCE_COLOR=0`/`NO_COLOR=1` env vars.
4. Send progress events via `clone-progress` channel (phase: `"installing"`).
5. Return detected package manager on success.

## REST Contract (Electron → AO)

No new AO endpoints. Electron uses existing endpoints:

| Operation | Method | Endpoint | Body |
|-----------|--------|----------|------|
| Create project after clone | POST | `/api/projects` | `{ path: string, name?: string }` |
| Update status on start | PATCH | `/api/projects/:id` | `{ status: "starting" }` |
| Update URL on detection | PATCH | `/api/projects/:id` | `{ status: "running", dev_server_url: "http://..." }` |
| Update status on stop | PATCH | `/api/projects/:id` | `{ status: "idle", dev_server_url: null }` |
| Update status on error | PATCH | `/api/projects/:id` | `{ status: "error" }` |
| Reset all on startup | PATCH | `/api/projects/:id` | `{ status: "idle", dev_server_url: null }` (for each project) |
