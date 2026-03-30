# IPC Contract: Electron Main ↔ Renderer

**Feature**: 004-dev-server-github-onboarding
**Date**: 2026-03-30

## Existing Channels (modified behavior)

### `start-dev-server`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
{ projectId: string, devCommand: string, projectPath: string, devPort: number }

// Response (success)
{ success: true }

// Response (error)
{ success: false, error: string }
// e.g., "Port 3000 is in use. Stop the other process first."
```

**Behavior**: Spawns process with `detached: true`. Updates AO status to "starting" via PATCH. Begins stdout parsing for URL detection. On URL found, updates AO with status "running" and dev_server_url. On process exit, updates AO with status "idle" (clean exit) or "error" (non-zero exit).

### `stop-dev-server`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
{ projectId: string }

// Response
{ success: true }
```

**Behavior**: Kills process group via `process.kill(-pid, 'SIGTERM')`. Updates AO status to "idle". Clears detected URL.

### `get-dev-server-logs`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
{ projectId: string }

// Response
{ logs: string[] }  // Up to 2000 most recent lines
```

## New Channels

### `clone-github-repo`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
{ url: string }  // GitHub repo URL, e.g., "https://github.com/user/repo"

// Response (success)
{ success: true, projectPath: string, repoName: string }

// Response (error)
{ success: false, error: string }
// e.g., "Could not access this repository. Check the URL and try again."
```

**Behavior**:
1. Validate URL format (must match `https://github.com/<owner>/<repo>`)
2. Extract repo name from URL
3. Determine dest path: `~/.vex/projects/<repo-name>` (append `-N` suffix if exists)
4. Run `git clone --progress <url> <dest>`
5. Send progress events via `clone-progress` channel
6. On completion, return the final path

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

### `install-dependencies`

**Direction**: Renderer → Main → Renderer (invoke/handle)

```typescript
// Request
{ projectPath: string }

// Response (success)
{ success: true, packageManager: string }  // "npm" | "yarn" | "pnpm" | "bun"

// Response (error)
{ success: false, error: string }
// e.g., "Installation failed. Make sure Node.js is installed on your computer."
```

**Behavior**:
1. Detect lock file in projectPath
2. Run appropriate install command
3. Send progress events via `clone-progress` channel (phase: "installing")
4. Return detected package manager on success

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
