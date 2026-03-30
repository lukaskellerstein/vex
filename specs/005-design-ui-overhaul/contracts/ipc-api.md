# IPC API Contract: Electron Renderer ↔ Main Process

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30

All methods are exposed via `window.electronAPI` from `preload.ts` and return Promises.

## Existing Methods (no changes)

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getProjects()` | — | `Project[]` | `GET /api/projects` |
| `createProject(name, path)` | string, string | `Project` | `POST /api/projects` |
| `updateProject(id, data)` | string, object | `Project` | `PATCH /api/projects/:id` |
| `startDevServer(projectId)` | string | `{status, detail?}` | DevServerManager |
| `stopDevServer(projectId)` | string | `{status}` | DevServerManager |
| `getDevServerLogs(projectId, offset)` | string, number | `{lines, nextOffset}` | DevServerManager |
| `openExternal(url)` | string | void | `shell.openExternal` |
| `getAgents()` | — | `Agent[]` | `GET /api/agents` |
| `getAgentLogs(agentId)` | string | `LogEntry[]` | `GET /api/agents/:id/logs` |
| `getNatsStatus()` | — | `{healthy: boolean}` | TCP check |
| `getConfig()` | — | `Record<string, string>` | `GET /api/config` |
| `updateConfig(config)` | object | `Record<string, string>` | `PATCH /api/config` |
| `cloneGithubRepo(url)` | string | `{path}` | github-cloner |
| `installDependencies(path)` | string | `{success}` | dependency-installer |
| `selectFolder()` | — | `string \| null` | `dialog.showOpenDialog` |
| `onCloneProgress(callback)` | function | unsubscribe function | IPC event |

## New Methods

### Project Management

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `deleteProject(projectId)` | string | void | `DELETE /api/projects/:id` |
| `getProject(projectId)` | string | `Project` | `GET /api/projects/:id` |

### Batch Management

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getBatches(projectId)` | string | `BatchSummary[]` | `GET /api/projects/:id/batches` |
| `getBatch(projectId, batchId)` | string, string | `BatchDetail` | `GET /api/projects/:id/batches/:batchId` |

### Agent Traces

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getAgentTrace(batchId)` | string | `AgentTrace` | `GET /api/batches/:id/trace` |

### Activity

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getActivity(filters?)` | `{projectId?, type?, since?}` | `ActivityEvent[]` | `GET /api/activity` |
| `getActivityStats(since?)` | string? | `ActivityStats` | `GET /api/activity/stats` |

### Tasks

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getTasks(projectId?)` | string? | `Task[]` | `GET /api/tasks` |

### Storage & System

| Method | Params | Returns | Backend Route |
|--------|--------|---------|---------------|
| `getStorageStats()` | — | `StorageStats` | `GET /api/storage/stats` |
| `clearScreenshots()` | — | `{deleted: number}` | `DELETE /api/storage/screenshots` |
| `getAppInfo()` | — | `{version, electron, node, platform}` | Local (no API) |

## Data Shapes (TypeScript)

```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  framework: string | null;
  dev_command: string | null;
  dev_port: number | null;
  package_manager: string | null;
  styling_approach: string | null;
  status: "idle" | "starting" | "running" | "stopping" | "error";
  dev_server_url: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchSummary {
  id: string;
  project_id: string;
  page_url: string;
  page_title: string;
  action_count: number;
  status: "pending" | "processing" | "completed" | "failed";
  submitted_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  error_message: string | null;
  agent_id: string | null;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  tier: number;
  capabilities: string[];
  status: "registered" | "starting" | "running" | "stopping" | "stopped" | "error";
  pid: number | null;
  project_id: string | null;
  last_heartbeat: string | null;
  tasks_completed: number;
  tasks_failed: number;
  total_cost_usd: number;
  created_at: string;
}

interface AgentTrace {
  id: string;
  batch_id: string;
  agent_name: string;
  agent_model: string;
  status: "running" | "completed" | "failed";
  total_duration_ms: number;
  total_cost_usd: number;
  total_tokens: number;
  steps: TraceStep[];
  created_at: string;
  completed_at: string | null;
}

interface TraceStep {
  id: string;
  sequence_index: number;
  type: "thinking" | "text" | "tool_call" | "tool_result" | "diff" | "subagent_spawn" | "subagent_result" | "skill_invoke" | "skill_result" | "error";
  content: string;
  metadata: Record<string, unknown> | null;
  duration_ms: number | null;
  token_count: number | null;
}

interface ActivityEvent {
  id: string;
  type: string;
  project_id: string | null;
  project_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityStats {
  completed_batches: number;
  failed_batches: number;
  total_actions: number;
  active_agents: number;
  total_cost_usd: number;
}

interface StorageStats {
  database_bytes: number;
  screenshots_bytes: number;
  total_bytes: number;
}
```
