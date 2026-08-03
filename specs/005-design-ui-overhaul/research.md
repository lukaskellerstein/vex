# Research: Electron App UI Overhaul

**Branch**: `005-design-ui-overhaul` | **Date**: 2026-03-30

## R1: Routing Approach for Electron App

**Decision**: Use React Router v6 with `MemoryRouter` for in-memory routing (no URL bar in Electron).

**Rationale**: The design requires nested routes (Projects → ProjectDetail → AgentTrace). The current state-based approach (`useState<Page>`) cannot support this cleanly — back navigation, deep linking within the app, and breadcrumbs all become fragile. `MemoryRouter` is the standard choice for Electron since there's no browser address bar.

**Alternatives considered**:
- Keep state-based routing: Rejected — nested routes (project/:id/trace/:traceId) require manual stack management that gets unwieldy.
- `HashRouter`: Unnecessary — Electron loads from file://, no server-side routing needed.
- TanStack Router: Overkill for this app's 6 routes.

## R2: Styling Approach — Replacing Inline Styles

**Decision**: Use CSS custom properties (CSS variables) with a dedicated theme file, plus standard CSS modules or a single global stylesheet. No Tailwind CSS.

**Rationale**: The design reference uses Tailwind CSS, but the current Vex project has zero CSS infrastructure — no PostCSS, no Tailwind config, no utility classes. Adding Tailwind would require build pipeline changes and create a dependency the project doesn't use elsewhere. The design's visual system is defined by ~20 color tokens, 2 fonts, and consistent spacing — all trivially represented as CSS custom properties. This keeps the tech stack minimal per Constitution Principle VII (YAGNI).

**Alternatives considered**:
- Tailwind CSS: Rejected — adds build complexity, new dependency, learning curve mismatch with the rest of the project. The design can be matched with plain CSS.
- styled-components / Emotion: Rejected — runtime CSS-in-JS overhead in Electron is unnecessary.
- Keep inline styles: Rejected — impossible to maintain consistent theming, pseudo-classes (hover, focus), or animations.

## R3: Animation Library

**Decision**: Use CSS transitions and keyframe animations. No GSAP.

**Rationale**: The design reference uses GSAP, but the animations needed (sidebar collapse, card hover lift, staggered fade-in, pulsing dots) are all achievable with CSS transitions and `@keyframes`. GSAP adds 30KB+ and a new dependency for effects that CSS handles natively. Only add GSAP later if a specific animation proves impossible with CSS.

**Alternatives considered**:
- GSAP: Rejected for initial implementation — violates YAGNI. Can be added later if CSS proves insufficient.
- Framer Motion: Heavy (50KB+), React-specific but overkill for these animations.

## R4: Icon Library

**Decision**: Use Lucide React icons (same as the design reference).

**Rationale**: The design extensively uses Lucide icons (Zap, FolderOpen, Activity, Settings, Search, Grid3x3, List, Play, Square, Trash2, etc.). Using the same library ensures visual parity with minimal effort. Lucide is tree-shakeable — only imported icons are bundled.

**Alternatives considered**:
- Inline SVGs: More work, harder to maintain.
- Heroicons: Different icon style, wouldn't match the design.

## R5: Backend API Gaps

**Decision**: Add new backend endpoints for activity events, agent logs, agent traces, and storage stats. Extend existing batch/project models.

**Rationale**: Analysis of existing vs. required APIs:

### Existing APIs (sufficient)

- `GET /api/projects` — list projects ✓
- `GET /api/projects/:id` — project detail ✓
- `POST /api/projects` — create project ✓
- `PATCH /api/projects/:id` — update project ✓
- `DELETE /api/projects/:id` — delete project ✓
- `GET /api/projects/:id/batches` — list batches ✓
- `GET /api/projects/:id/batches/:batchId` — batch detail with actions ✓
- `GET /api/agents` — list agents ✓
- `GET /api/agents/:id` — agent detail ✓
- `POST /api/agents/:id/start` — start agent ✓
- `POST /api/agents/:id/stop` — stop agent ✓
- `GET /api/config` — get config ✓
- `PATCH /api/config` — update config ✓
- `GET /api/health` — health check ✓

### Missing APIs (need to add)

- `GET /api/activity` — activity event timeline (with filters: project, type, time range)
- `GET /api/agents/:id/logs` — agent execution logs (endpoint exists in IPC but returns 404 from backend — no route implemented)
- `GET /api/batches/:batchId/trace` — agent execution trace for a batch
- `GET /api/storage/stats` — storage usage statistics (db size, screenshot cache, logs)
- `GET /api/projects/:id/batches` needs extension — missing `page_url`, `duration_ms`, `cost_usd`, `error_message` fields on batch summary
- `GET /api/tasks` — list all tasks (currently only `GET /api/tasks/pending`)

### Missing DB tables (need to add)

- `activity_events` — stores cross-component events for the activity timeline
- `agent_logs` — stores agent runtime log entries
- `agent_traces` / `trace_steps` — stores agent execution traces and their steps

### IPC additions needed

- `get-batches` — list batches for a project (currently only available via direct API)
- `get-batch` — get batch detail
- `get-activity` — get activity events
- `get-agent-trace` — get trace for a batch
- `get-storage-stats` — get storage usage
- `delete-project` — delete project (currently only via direct API)
- `get-tasks` — list tasks

## R6: Tooltip Component

**Decision**: Build a minimal tooltip component in-house (CSS-only with `position: absolute` and hover trigger).

**Rationale**: The sidebar needs tooltips in collapsed mode. A 20-line CSS-based tooltip is sufficient. No need for a tooltip library (Radix, Floating UI) for this single use case.

## R7: Project Data Model Enrichment

**Decision**: The batch model needs `duration_ms`, `cost_usd`, and `error_message` fields. The project model needs a `last_activity_at` computed field.

**Rationale**: The design shows duration, cost, and error info on batch cards. These fields don't exist in the current schema. `last_activity_at` can be computed from the most recent batch's `submitted_at` via a JOIN or denormalized column.
