# Feature Specification: Replace HTTP Polling with NATS Pub/Sub

**Feature Branch**: `008-nats-pubsub-polling`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: User description: "Replace HTTP polling with NATS Pub/Sub for real-time UI updates — based on docs/my-specs/spec-008.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Project List Updates (Priority: P1)

A user creates, updates, or deletes a project. The Projects page in the Electron app reflects the change immediately without waiting for a polling interval to elapse.

**Why this priority**: This is the most visible polling loop (5s interval) and the most common user interaction. Eliminating it provides the clearest perceived improvement.

**Independent Test**: Create a project via the UI. The projects list updates within 1 second without a page refresh or manual reload.

**Acceptance Scenarios**:

1. **Given** the Projects page is open, **When** a new project is created, **Then** the project appears in the list within 1 second
2. **Given** the Projects page is open, **When** a project is deleted, **Then** the project disappears from the list within 1 second
3. **Given** the Projects page is open, **When** a project name is updated, **Then** the updated name appears within 1 second

---

### User Story 2 - Real-Time Batch and Agent Status on Project Detail (Priority: P1)

A user views a project's detail page. When a batch is submitted, starts processing, completes, or fails, the batch list and agent statuses update immediately.

**Why this priority**: The project detail page has two polling loops (2s + 3s). Batch and agent status changes are the primary feedback mechanism during active work — delays here directly impact user productivity.

**Independent Test**: Submit a batch while viewing the project detail page. Observe batch status transitions (submitted, processing, completed/failed) appearing in real time.

**Acceptance Scenarios**:

1. **Given** the project detail page is open, **When** a batch is submitted, **Then** it appears in the batch list within 1 second
2. **Given** a batch is processing, **When** the batch completes or fails, **Then** the status updates within 1 second
3. **Given** the project detail page is open, **When** an agent registers or deregisters, **Then** the agent list updates within 1 second

---

### User Story 3 - Real-Time Activity Feed (Priority: P2)

A user views the Activity page. New activity events (batch started, completed, failed) appear immediately instead of waiting up to 10 seconds.

**Why this priority**: The activity page polls at the slowest interval (10s), making it feel the most stale. However, it's less frequently viewed than the project pages.

**Independent Test**: Open the Activity page and trigger a batch. Observe the activity entry appearing within 1 second of the event occurring.

**Acceptance Scenarios**:

1. **Given** the Activity page is open, **When** a batch starts processing, **Then** a new activity entry appears within 1 second
2. **Given** the Activity page is open, **When** a batch completes or fails, **Then** a new activity entry appears within 1 second

---

### User Story 4 - Chrome Extension Cursor Updates Without HTTP Polling (Priority: P2)

The Chrome extension stops polling the HTTP endpoint for active cursors. Instead, it receives cursor data and agent completion signals via messaging events.

**Why this priority**: The 3-second HTTP poll in the Chrome extension adds unnecessary network traffic and server load. Messaging infrastructure is already connected in the extension.

**Independent Test**: With the Chrome extension active on a page, run a batch that creates cursors. Verify cursors appear and disappear based on events, not HTTP polling.

**Acceptance Scenarios**:

1. **Given** the Chrome extension is active, **When** a batch starts and creates cursors, **Then** cursors appear without HTTP polling
2. **Given** cursors are active, **When** the batch completes, **Then** cursors are removed based on agent status events

---

### User Story 5 - Reduced CPU and Network Usage at Idle (Priority: P1)

When the user has VEX running but is not actively performing operations, CPU usage drops significantly because no polling loops are firing requests or triggering UI re-renders.

**Why this priority**: This is the root motivation — VEX causes fans to spin due to continuous background polling. Eliminating unnecessary polling directly addresses this.

**Independent Test**: Start VEX with no active batches or operations. Observe that no periodic requests are made for project, batch, or activity data. CPU usage remains low.

**Acceptance Scenarios**:

1. **Given** VEX is running with no active operations, **When** 30 seconds elapse, **Then** no periodic requests are made for project, batch, or activity data
2. **Given** VEX is idle, **When** CPU usage is measured, **Then** it is significantly lower than with polling enabled

---

### Edge Cases

- What happens when the messaging connection drops temporarily? The UI must not become permanently stale — a reconnection should trigger a full data refresh.
- What happens when events arrive in rapid succession (e.g., bulk project import)? The UI must debounce re-fetches to avoid render storms.
- What happens when the user opens a page after events were already published? The initial data load must still work (events are for incremental updates, not initial state).
- What happens when a user has multiple Electron windows open? Each window must independently subscribe and receive events.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST publish events to dedicated messaging subjects when project, batch, agent, or activity state changes occur
- **FR-002**: The desktop app main process MUST subscribe to messaging subjects and forward events to the UI layer
- **FR-003**: The UI MUST replace polling-based data fetching with event-driven invalidation (re-fetch on event receipt)
- **FR-004**: The browser extension MUST replace HTTP polling for cursor data with event-based subscriptions where applicable
- **FR-005**: All UI components MUST retain their initial data fetch on load — events supplement, not replace, the initial load
- **FR-006**: The UI MUST debounce rapid event sequences to prevent re-render storms (max one re-fetch per 300ms per data source)
- **FR-007**: Polling MUST be retained only for data that has no backend event source (dev server logs, health checks, DOM-based cursor positioning)
- **FR-008**: The system MUST handle messaging disconnection gracefully — reconnection should trigger a full data refresh to prevent stale state

### Key Entities

- **State Change Event**: A message published when backend state changes, containing an event type and relevant entity identifiers
- **Event Subject/Channel**: A named routing path for grouping related events (project events, batch events, activity events)
- **Event-to-UI Bridge**: The component that subscribes to backend events and forwards them to the UI rendering layer

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All state changes (project CRUD, batch status, agent registration, activity) are reflected in the UI within 1 second of occurring
- **SC-002**: At idle (no active operations), zero periodic requests are made for project, batch, or activity data
- **SC-003**: CPU usage at idle drops measurably compared to the polling baseline (target: fan noise elimination)
- **SC-004**: No data staleness — after messaging reconnection, the UI shows current state within 2 seconds
- **SC-005**: Rapid state changes (10+ events per second) do not cause UI freezes or excessive re-renders
