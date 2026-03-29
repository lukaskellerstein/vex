# AgentManager REST API Contract

**Base URL**: `http://localhost:8420`
**Content-Type**: `application/json`
**CORS**: Enabled for local origins (Electron webview, Chrome extension)

## Project Endpoints

### GET /api/projects
List all projects.

**Response 200**:
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "my-website",
      "path": "/home/user/my-website",
      "framework": "next",
      "devCommand": "npm run dev",
      "devPort": 3000,
      "packageManager": "npm",
      "stylingApproach": "tailwind",
      "status": "running",
      "devServerUrl": "http://localhost:3000",
      "createdAt": "2026-03-30T10:00:00Z",
      "updatedAt": "2026-03-30T10:00:00Z"
    }
  ]
}
```

### POST /api/projects
Create project. Triggers auto-detection.

**Request**:
```json
{
  "path": "/home/user/my-website",
  "name": "my-website"
}
```

**Response 201**: Project object with auto-detected fields populated.

### GET /api/projects/{id}
Get project details.

**Response 200**: Single project object.

### PATCH /api/projects/{id}
Update project settings. Accepts partial updates.

**Request**:
```json
{
  "devCommand": "npm run dev -- --port 3001",
  "devPort": 3001
}
```

**Response 200**: Updated project object.

### DELETE /api/projects/{id}
Remove project.

**Response 204**: No content.

### POST /api/projects/{id}/start
Start dev server.

**Response 200**:
```json
{
  "status": "starting",
  "message": "Dev server starting"
}
```

### POST /api/projects/{id}/stop
Stop dev server.

**Response 200**:
```json
{
  "status": "stopping",
  "message": "Dev server stopping"
}
```

---

## Batch Endpoints

### POST /api/projects/{id}/batches
Submit a batch of actions. Max 50MB body.

**Request**:
```json
{
  "batch": {
    "pageUrl": "http://localhost:3000/landing",
    "pageTitle": "My Site — Landing Page",
    "actions": [
      {
        "type": "select",
        "selector": ".hero > button.cta",
        "instruction": "add a gradient background",
        "elementInfo": { "tagName": "button", "..." : "..." },
        "screenshotAfter": "<base64>"
      }
    ],
    "timestamp": "2026-03-30T14:22:01.000Z"
  }
}
```

**Response 201**:
```json
{
  "id": "batch-uuid",
  "projectId": "project-uuid",
  "actionCount": 1,
  "status": "pending",
  "submittedAt": "2026-03-30T14:22:01.000Z"
}
```

### GET /api/projects/{id}/batches
List batches for a project.

**Response 200**:
```json
{
  "batches": [
    {
      "id": "batch-uuid",
      "actionCount": 5,
      "status": "completed",
      "submittedAt": "2026-03-30T14:22:01.000Z",
      "completedAt": "2026-03-30T14:23:15.000Z"
    }
  ]
}
```

### GET /api/projects/{id}/batches/{batchId}
Get a specific batch with all actions.

**Response 200**: Full batch object including actions array with screenshot file paths (not base64).

### GET /api/projects/{id}/batches/latest
Get the most recent batch.

**Response 200**: Same as single batch response.

### DELETE /api/projects/{id}/batches/{batchId}
Delete a batch.

**Response 204**: No content.

---

## Agent Endpoints

### GET /api/agents
List all registered agents.

**Response 200**:
```json
{
  "agents": [
    {
      "id": "agent-uuid",
      "name": "Claude Code",
      "type": "claude-code-sdk",
      "tier": 1,
      "capabilities": ["code-edit", "file-system", "section-generation"],
      "status": "running",
      "projectId": "project-uuid",
      "lastHeartbeat": "2026-03-30T10:00:00Z"
    }
  ]
}
```

### POST /api/agents
Register an agent.

**Request**:
```json
{
  "name": "Claude Code",
  "type": "claude-code-sdk",
  "capabilities": ["code-edit", "file-system", "section-generation"]
}
```

**Response 201**: Agent object.

### GET /api/agents/{id}
Agent details + health.

**Response 200**: Agent object with additional `healthy` boolean field.

### POST /api/agents/{id}/start
Start an agent process.

**Response 200**: `{ "status": "starting" }`

### POST /api/agents/{id}/stop
Stop an agent.

**Response 200**: `{ "status": "stopping" }`

### DELETE /api/agents/{id}
Deregister agent.

**Response 204**: No content.

### POST /api/agents/{id}/heartbeat
Agent heartbeat.

**Request**:
```json
{
  "status": "running",
  "metadata": {}
}
```

**Response 200**: `{ "acknowledged": true }`

---

## Task Endpoints

### POST /api/tasks
Create a task (generation request). AgentManager routes to capable agent.

**Request**:
```json
{
  "projectId": "project-uuid",
  "type": "section",
  "prompt": "a testimonials section with 3 cards",
  "context": {
    "pageUrl": "http://localhost:3000",
    "surroundingHTML": "<section>...</section>",
    "dimensions": { "width": 800, "height": 400 }
  }
}
```

**Response 201**:
```json
{
  "id": "task-uuid",
  "status": "pending",
  "createdAt": "2026-03-30T10:00:00Z"
}
```

### GET /api/tasks/{id}
Task status and result.

**Response 200**:
```json
{
  "id": "task-uuid",
  "status": "completed",
  "result": "<section class=\"testimonials\">...</section>",
  "completedAt": "2026-03-30T10:00:25Z"
}
```

### GET /api/tasks/pending
Pending tasks for an agent (filtered by capability query param).

**Query params**: `?capability=section-generation`

**Response 200**:
```json
{
  "tasks": [{ "id": "task-uuid", "type": "section", "prompt": "...", "context": {} }]
}
```

### POST /api/tasks/{id}/result
Agent posts task result.

**Request**:
```json
{
  "status": "completed",
  "result": "<section>...</section>"
}
```

**Response 200**: Updated task object.

---

## Utility Endpoints

### GET /api/health
AgentManager health.

**Response 200**:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "agentCount": 1,
  "natsConnected": true,
  "dbStatus": "ok"
}
```

### GET /api/config
Global configuration.

**Response 200**:
```json
{
  "config": {
    "agentmanager.port": "8420",
    "nats.port": "4222",
    "nats.ws.port": "4223"
  }
}
```

### PATCH /api/config
Update configuration.

**Request**: `{ "key": "value" }`
**Response 200**: Updated config.

---

## Error Format

All error responses use:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found",
    "details": {}
  }
}
```

**Standard error codes**: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).
