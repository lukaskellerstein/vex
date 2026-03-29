# NATS Subject Contract

**Connection**: nats-server on port 4222 (native), port 4223 (WebSocket for Chrome Extension)
**Client libraries**: `nats.ws` (Chrome Extension), `nats-py` (AgentManager/Agents)

## Subject Hierarchy

| Subject Pattern | Publisher | Subscriber | Payload | Purpose |
|----------------|-----------|------------|---------|---------|
| `vex.batch.{projectId}.new` | Extension | AgentManager, Agents | Batch submission notification | New batch of actions submitted |
| `vex.generate.request.{projectId}` | Extension | Agents | Generation request | Section or image generation prompt |
| `vex.generate.result.{requestId}` | Agent | Extension | Generation result | Generated HTML or image URL |
| `vex.agent.{agentId}.status` | Agent | AgentManager, UI | Agent status | Heartbeat, state changes |
| `vex.agent.{agentId}.log` | Agent | UI | Log line | Live log streaming |
| `vex.project.{projectId}.status` | AgentManager | UI, Extension | Project status | Dev server status changes |
| `vex.task.{taskId}.progress` | Agent | UI, Extension | Progress update | Task progress percentage/message |

## Message Payloads

### vex.batch.{projectId}.new

```json
{
  "batchId": "batch-uuid",
  "projectId": "project-uuid",
  "actionCount": 5,
  "timestamp": "2026-03-30T14:22:01.000Z"
}
```

### vex.generate.request.{projectId}

```json
{
  "requestId": "gen-uuid",
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

### vex.generate.result.{requestId}

```json
{
  "requestId": "gen-uuid",
  "status": "completed",
  "result": "<section class=\"testimonials\">...</section>",
  "error": null
}
```

### vex.agent.{agentId}.status

```json
{
  "agentId": "agent-uuid",
  "status": "running",
  "timestamp": "2026-03-30T10:00:00Z",
  "metadata": {}
}
```

### vex.agent.{agentId}.log

```json
{
  "agentId": "agent-uuid",
  "level": "info",
  "message": "Processing batch batch-uuid...",
  "timestamp": "2026-03-30T10:00:00Z"
}
```

### vex.project.{projectId}.status

```json
{
  "projectId": "project-uuid",
  "status": "running",
  "url": "http://localhost:3000",
  "timestamp": "2026-03-30T10:00:00Z"
}
```

### vex.task.{taskId}.progress

```json
{
  "taskId": "task-uuid",
  "progress": 0.5,
  "message": "Generating section HTML...",
  "timestamp": "2026-03-30T10:00:15Z"
}
```

## Connection Behavior

- **Extension**: Connects via WebSocket (`ws://localhost:4223`). On disconnect, falls back to REST polling for generation results. Auto-reconnects with exponential backoff.
- **AgentManager**: Connects via native NATS protocol (`nats://localhost:4222`). Subscribes to all `vex.batch.>` and `vex.agent.>` subjects on startup.
- **Agents**: Connect via native NATS. Subscribe to `vex.generate.request.{projectId}` for their assigned project.
