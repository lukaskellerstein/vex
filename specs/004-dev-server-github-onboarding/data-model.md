# Data Model: Dev Server Management & Project Onboarding

**Feature**: 004-dev-server-github-onboarding
**Date**: 2026-03-30

## Entities

### Project (modified)

The existing `projects` table in SQLite already has all needed fields. No schema migration required.

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Display name |
| path | TEXT | Absolute filesystem path (UNIQUE) |
| framework | TEXT | Auto-detected: react, nextjs, vue, vite, etc. |
| dev_command | TEXT | e.g., "npm run dev" |
| dev_port | INTEGER | e.g., 3000 |
| package_manager | TEXT | npm, yarn, pnpm, bun |
| styling_approach | TEXT | tailwind, styled-components, css-modules, scss |
| status | TEXT | idle, starting, running, stopping, error |
| dev_server_pid | INTEGER | **Unused** — retained for schema compat, always NULL |
| dev_server_url | TEXT | Set by Electron when URL detected, e.g., "http://localhost:3000" |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

**State transitions** (managed by Electron, synced to AO via PATCH):

```
idle → starting → running → stopping → idle
                ↘ error ↗         ↘ error
```

### Dev Server Instance (runtime only, Electron in-memory)

Not persisted. Exists only in `DevServerManager`'s `Map<projectId, DevServer>`.

| Field | Type | Notes |
|-------|------|-------|
| projectId | string | Key in the map |
| process | ChildProcess | Node.js child process handle |
| pid | number | OS process ID (for process group kill) |
| logBuffer | string[] | Circular buffer, max 2000 lines |
| detectedUrl | string | null | First localhost URL found in stdout |
| status | string | starting, running, error |

### Clone Operation (runtime only, Electron in-memory)

Transient state during GitHub clone flow. Not persisted.

| Field | Type | Notes |
|-------|------|-------|
| url | string | GitHub repo URL |
| destPath | string | Target path in ~/.vex/projects/ |
| repoName | string | Extracted from URL |
| progress | number | 0-100 percentage (from git stderr) |
| phase | string | cloning, installing, detecting, ready, error |
| error | string | null | User-friendly error message |

## Relationships

```
Project (AO/SQLite) 1:1 DevServerInstance (Electron/memory)
  - Linked by projectId
  - Electron updates Project.status and Project.dev_server_url via PATCH API
  - On Electron restart, all DevServerInstances are gone → all Projects reset to idle
```

## No Schema Changes Required

The existing SQLite schema fully supports this feature:
- `projects.status` and `projects.dev_server_url` already exist for Electron to update
- `projects.dev_server_pid` is unused but harmless to leave (avoids unnecessary migration)
- No new tables or columns needed
