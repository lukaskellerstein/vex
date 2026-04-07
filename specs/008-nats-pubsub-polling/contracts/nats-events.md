# NATS Event Contracts

## Subject: `vex.project.events`

Published by AgentManager after DB commit on project or agent mutations.

```json
{
  "event": "created | updated | deleted | agent_registered | agent_deregistered",
  "project_id": "string",
  "project": { "id": "...", "name": "...", "..." : "..." } | null,
  "agent": { "id": "...", "name": "...", "..." : "..." } | null,
  "agent_id": "string | null",
  "timestamp": "2026-04-05T12:00:00Z"
}
```

**Consumers**: Electron renderer (Projects page, ProjectDetail page), Chrome extension (AgentCursors)

---

## Subject: `vex.batch.events`

Published by AgentManager after batch submission and during batch processing lifecycle.

```json
{
  "event": "submitted | processing | completed | failed | cancelled",
  "project_id": "string",
  "batch_id": "string",
  "timestamp": "2026-04-05T12:00:00Z"
}
```

**Consumers**: Electron renderer (BatchList, ProjectDetail, Projects page)

---

## Subject: `vex.activity.events`

Published by AgentManager after inserting activity_events DB records.

```json
{
  "event": "batch_processing | batch_completed | batch_failed",
  "project_id": "string",
  "batch_id": "string",
  "timestamp": "2026-04-05T12:00:00Z"
}
```

**Consumers**: Electron renderer (Activity page)

---

## IPC Contracts (Electron main ↔ renderer)

### Invoke Channels (renderer → main)

| Channel | Args | Returns |
|---------|------|---------|
| `subscribe-project-events` | none | `{ ok: boolean; error?: string }` |
| `unsubscribe-project-events` | none | `{ ok: boolean }` |
| `subscribe-batch-events` | none | `{ ok: boolean; error?: string }` |
| `unsubscribe-batch-events` | none | `{ ok: boolean }` |
| `subscribe-activity-events` | none | `{ ok: boolean; error?: string }` |
| `unsubscribe-activity-events` | none | `{ ok: boolean }` |

### Event Channels (main → renderer)

| Channel | Payload |
|---------|---------|
| `project-event` | ProjectEvent JSON |
| `batch-event` | BatchEvent JSON |
| `activity-event` | ActivityEvent JSON |

### Preload API

```typescript
// Subscribe/unsubscribe
subscribeProjectEvents(): Promise<{ ok: boolean; error?: string }>;
unsubscribeProjectEvents(): Promise<{ ok: boolean }>;
subscribeBatchEvents(): Promise<{ ok: boolean; error?: string }>;
unsubscribeBatchEvents(): Promise<{ ok: boolean }>;
subscribeActivityEvents(): Promise<{ ok: boolean; error?: string }>;
unsubscribeActivityEvents(): Promise<{ ok: boolean }>;

// Event listeners (return cleanup function)
onProjectEvent(callback: (data: Record<string, unknown>) => void): () => void;
onBatchEvent(callback: (data: Record<string, unknown>) => void): () => void;
onActivityEvent(callback: (data: Record<string, unknown>) => void): () => void;
```
