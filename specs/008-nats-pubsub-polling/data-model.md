# Data Model: Replace HTTP Polling with NATS Pub/Sub

## NATS Event Messages

No new database entities. This feature adds 3 new NATS message types (transient, not persisted).

### ProjectEvent

Published to `vex.project.events` on project or agent state changes.

| Field | Type | Description |
|-------|------|-------------|
| event | string | One of: `created`, `updated`, `deleted`, `agent_registered`, `agent_deregistered` |
| project_id | string | The affected project ID |
| project | object \| null | Full project data (on create/update), null on delete |
| agent | object \| null | Agent data (on register), null otherwise |
| agent_id | string \| null | Agent ID (on deregister), null otherwise |
| timestamp | string | ISO 8601 timestamp |

### BatchEvent

Published to `vex.batch.events` on batch lifecycle transitions.

| Field | Type | Description |
|-------|------|-------------|
| event | string | One of: `submitted`, `processing`, `completed`, `failed`, `cancelled` |
| project_id | string | The owning project ID |
| batch_id | string | The affected batch ID |
| timestamp | string | ISO 8601 timestamp |

### ActivityEvent

Published to `vex.activity.events` when new activity records are created.

| Field | Type | Description |
|-------|------|-------------|
| event | string | One of: `batch_processing`, `batch_completed`, `batch_failed` |
| project_id | string | The owning project ID |
| batch_id | string | The related batch ID |
| timestamp | string | ISO 8601 timestamp |

## IPC Channels (Electron)

New IPC channels bridging NATS events to the renderer process:

| IPC Channel | Direction | NATS Source | Payload |
|-------------|-----------|-------------|---------|
| `project-event` | main → renderer | `vex.project.events` | ProjectEvent |
| `batch-event` | main → renderer | `vex.batch.events` | BatchEvent |
| `activity-event` | main → renderer | `vex.activity.events` | ActivityEvent |

## State Transitions

No new state machines. This feature observes existing state transitions and publishes events at the point of change:

- **Project**: created → updated* → deleted
- **Agent**: registered → deregistered
- **Batch**: submitted → processing → completed/failed/cancelled
- **Activity**: one-shot creation (no lifecycle)
