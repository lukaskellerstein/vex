# Data Model: Vex — Visual Web Development Tool

**Branch**: `001-vex-visual-editor` | **Date**: 2026-03-30

## Entities

### Project

Represents a web development project the developer has registered with Vex.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Display name (derived from folder name, editable) |
| path | string | Absolute filesystem path to project root |
| framework | string, nullable | Auto-detected framework (next, nuxt, svelte, angular, vite, react, vue, static) |
| devCommand | string, nullable | Command to start dev server (e.g., "npm run dev") |
| devPort | integer | Dev server port (default 3000) |
| packageManager | string, nullable | Detected package manager (npm, yarn, pnpm, bun) |
| stylingApproach | string, nullable | Detected styling (tailwind, scss, css-modules, styled-components, css) |
| status | enum | idle, starting, running, stopping, error |
| devServerPid | integer, nullable | PID of running dev server process |
| devServerUrl | string, nullable | Detected ready URL when running |
| createdAt | datetime | Creation timestamp |
| updatedAt | datetime | Last update timestamp |

**State transitions**: idle → starting → running → stopping → idle; any → error → idle (on retry)

---

### Agent

Represents a connected AI coding agent (any tier).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Human-readable name (e.g., "Claude Code") |
| type | string | Adapter type (claude-code-sdk, cli-wrapper, external) |
| tier | integer | Integration tier (1, 2, or 3) |
| capabilities | string[] | Array of capability strings (code-edit, file-system, section-generation, image-generation) |
| status | enum | registered, starting, running, stopping, stopped, error |
| pid | integer, nullable | Process ID (for locally managed agents) |
| projectId | UUID, nullable | Assigned project (nullable for unassigned agents) |
| lastHeartbeat | datetime, nullable | Last heartbeat timestamp |
| config | JSON, nullable | Agent-specific configuration |
| createdAt | datetime | Registration timestamp |

**State transitions**: registered → starting → running → stopping → stopped; running → error → starting (auto-restart, max 3); any → stopped (manual stop)

**Health rules**: No heartbeat for 60s → mark unhealthy. No heartbeat for 5min → auto-restart (local) or mark failed (external).

---

### Batch

A collection of visual editing actions submitted as a unit.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| projectId | UUID | FK to Project |
| pageUrl | string | URL of the page being edited |
| pageTitle | string | Document title |
| actionCount | integer | Number of actions in the batch |
| status | enum | pending, processing, completed, failed |
| submittedAt | datetime | Submission timestamp |
| completedAt | datetime, nullable | Completion timestamp |

---

### Action

A single visual editing operation within a batch.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| batchId | UUID | FK to Batch |
| sequenceIndex | integer | Order within the batch (0-based) |
| type | enum | select, insert, editText, delete, duplicate, move, wrap, resize, styleChange, replaceImage, generateSection, copyStyle |
| selector | string | CSS selector for the target element |
| data | JSON | Type-specific action data (instruction, deltas, changes, etc.) |
| screenshotBeforePath | string, nullable | File path to before screenshot |
| screenshotAfterPath | string | File path to after screenshot |
| createdAt | datetime | Action timestamp |

**Action data by type** (JSON `data` field structure):

- **select**: `{ instruction, elementInfo: { tagName, id, classList, attributes, computedStyles, boundingRect, parentTag, childCount, textContent } }`
- **insert**: `{ position (after|before|firstChild|lastChild), referenceSelector, content: { tag, text, attributes } }`
- **editText**: `{ before, after }`
- **delete**: `{ deletedOuterHTML }`
- **duplicate**: `{ insertedAfter }`
- **move**: `{ parentSelector, fromIndex, toIndex }`
- **wrap**: `{ wrapper: { tag, classList } }`
- **resize**: `{ beforeStyles, afterStyles, deltas: [{ property, before, after, ratio, description }] }`
- **styleChange**: `{ changes: [{ property, before, after, ratio?, description }], hoverChanges?: [{ property, value, description }], transition?: { duration, easing } }`
- **replaceImage**: `{ originalSrc, method (upload|url|generate), prompt?, dimensions, generatedUrl? }`
- **generateSection**: `{ position, referenceSelector, prompt, styleHint, generatedHTML }`
- **copyStyle**: `{ fromSelector, toSelector, copiedProperties: { [property]: value } }`

---

### Task

A generation request (section or image) with lifecycle tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| projectId | UUID | FK to Project |
| agentId | UUID, nullable | FK to assigned Agent |
| type | enum | section, image |
| status | enum | pending, assigned, in_progress, completed, failed |
| prompt | string | Generation prompt from the developer |
| context | JSON | Page URL, surrounding HTML, dimensions, framework hints |
| result | text, nullable | Generated HTML or image URL |
| error | string, nullable | Error message if failed |
| createdAt | datetime | Request timestamp |
| assignedAt | datetime, nullable | When assigned to an agent |
| completedAt | datetime, nullable | Completion timestamp |

**State transitions**: pending → assigned → in_progress → completed | failed

---

### Configuration

Global and per-project settings.

| Field | Type | Description |
|-------|------|-------------|
| key | string | Setting key (e.g., "agentmanager.port", "nats.port") |
| value | string | Setting value |
| scope | enum | global, project |
| projectId | UUID, nullable | FK to Project (null for global) |
| updatedAt | datetime | Last update timestamp |

**Default global settings**:
- `agentmanager.port`: 8420
- `nats.port`: 4222
- `nats.ws.port`: 4223
- `agent.heartbeat.timeout`: 60 (seconds)
- `agent.restart.max`: 3
- `generation.timeout`: 30 (seconds)

## Relationships

```
Project 1──* Batch
Project 1──* Agent (via projectId assignment)
Project 1──* Task
Batch   1──* Action (ordered by sequenceIndex)
Agent   1──* Task (via agentId assignment)
```

## Validation Rules

- Project.path must be a valid, existing directory
- Project.devPort must be 1024-65535
- Batch.actionCount must match the actual number of linked actions
- Action.sequenceIndex must be unique within a batch and contiguous from 0
- Action.type must be one of the 12 defined types
- Action.data must conform to the type-specific schema
- Task.prompt must be non-empty
- Agent.capabilities must contain at least one capability string
- Configuration.key must follow dotted notation (component.setting)
