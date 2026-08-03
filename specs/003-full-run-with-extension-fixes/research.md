# Research: Full Run with Extension Fixes

**Branch**: `003-full-run-with-extension-fixes` | **Date**: 2026-03-30

## R1: NATS Process Management in Electron

### Decision

Keep the existing `process-manager.ts` child process approach. Harden with port-conflict detection (net.createServer probe), PID file (`~/.vex/nats.pid`) for orphan cleanup, and TCP health check after spawn.

### Rationale

- ProcessManager already spawns NATS with correct flags and has restart logic (max 3 attempts)
- Single binary, zero dependencies — ideal for child process management
- Health polling pattern proven with AgentManager

### Alternatives Considered

- Embedding NATS via nats.js: Rejected — no maintained embedded server for Node.js
- Docker-based NATS: Rejected — heavy dependency for desktop app
- Require external install only: Current approach — `nats-server` must be on PATH. Bundling deferred.

---

## R2: Claude Agent SDK Integration Pattern

### Decision

Use `ClaudeSDKClient` (stateful client) from `claude-agent-sdk`. It provides async context manager, streaming responses, multi-turn conversations, and hook support.

### Rationale

- Already a dependency in `pyproject.toml` (`claude-agent-sdk>=0.1.52`)
- Adapter interface maps cleanly: `start()` → create client, `send_task()` → `client.query()` + stream, `get_status()` → track session state
- Authentication automatic via Claude Code's environment variables
- Use `bypassPermissions` mode for automated agent runs
- Allowed tools: `["Read", "Write", "Edit", "Bash", "Glob", "Grep"]`

### Alternatives Considered

- `query()` function (stateless): Rejected — no hooks, no streaming control, no memory
- CLI wrapper adapter: Already exists as Tier 2 fallback — fragile stdout parsing
- Direct Anthropic API: Rejected — loses Claude Code tooling

---

## R3: Screenshot Display in Select-Mode PopupDialog

### Decision

The screenshot is already captured by `useScreenshot.ts` hook and stored in the action's `screenshot` field. The `PopupDialog.tsx` currently has a `ScreenshotThumb` component import but investigation reveals it displays a screenshot in certain flows. The fix is ensuring the screenshot is captured BEFORE the dialog opens and passed as a prop for immediate display.

### Rationale

- `captureScreenshot()` hides the overlay, captures the tab, draws a highlight rectangle and badge, returns base64 JPEG
- The capture is async (~100-200ms) — need to capture on element click, before showing the dialog
- `ScreenshotThumb.tsx` already renders `<img>` with base64 src, max 140px height
- Current flow: dialog opens immediately on click, screenshot may not be captured yet

### Implementation Approach

Trigger `captureScreenshot()` on element click in select mode, pass result to PopupDialog. If capture is slow, show dialog immediately with a loading placeholder, then update when screenshot arrives.

---

## R4: Resize Mode Hover Highlighting

### Decision

Add hover highlighting to `ResizeMode.tsx` using the same pattern as select mode's `useHoverHighlight` hook. Show a dashed indigo border on hover, suppress when an element is selected (resize handles visible).

### Rationale

- `useHoverHighlight()` hook exists and provides: element tracking on mousemove, `.cs-highlight` overlay div with border and label
- ResizeMode already has its own selection border (dashed indigo) for selected elements
- Need hover feedback ONLY when no element is selected (idle state)
- Can reuse the hover highlight hook with a gate: only active when `selectedElement === null`

### Alternatives Considered

- Custom hover implementation in ResizeMode: Rejected — duplicates existing hook logic
- CSS-only `:hover` approach: Rejected — shadow DOM isolation prevents direct page element styling

---

## R5: Style Editor Draggability

### Decision

Make the style editor panel header a drag handle using pointer events. Track mousedown on header, mousemove for delta, mouseup to stop. Constrain to viewport bounds.

### Rationale

- The Toolbar component already implements drag via similar pointer event pattern — proven approach
- StylePanel uses fixed positioning — updating `left`/`top` on drag is straightforward
- Header already has close button — adding drag behavior alongside it is natural
- Viewport constraining prevents panel from being dragged off-screen

### Implementation Approach

1. Add `onPointerDown` to the header (excluding the close button)
2. Track drag state: `isDragging`, `dragOffset`
3. On pointermove: update panel position (`left`, `top`) clamped to viewport
4. On pointerup: stop dragging
5. Override the initial `computePosition` with manual position once drag starts

---

## R6: Copy-Style Integration into Style Editor

### Decision

Add a "Copy Style" button in the StylePanel header/toolbar area. When clicked, it enters a two-phase flow (pick source, pick target) similar to the current CopyStyle component, but scoped to the style editor context. Remove the standalone copyStyle mode from the toolbar.

### Rationale

- CopyStyle component already has the full two-phase logic (source selection, target application)
- The style editor is the natural home for style operations
- Removes one mode from the toolbar, simplifying the UI
- Mode count drops from 6 to 5

### Implementation Approach

1. Extract the copy-style logic from `CopyStyle.tsx` into a reusable function or hook
2. Add "Copy Style" button to StylePanel
3. When clicked: temporarily enter copy-style flow (show instructions overlay, handle clicks)
4. On completion: apply copied styles and return to normal style editing
5. Remove `copyStyle` from mode enum and toolbar

---

## R7: Action List Relocation to On-Page Toolbar

### Decision

Add an expandable panel to the on-page Toolbar component (flowtable). The toolbar gets a chevron button; clicking it expands a panel below showing all recorded actions. Remove the ActionList from the popup.

### Rationale

- Keeps developer in context — no popup switching to review actions
- Toolbar is already draggable and positioned on-page
- ActionList component logic (display, inline edit, remove) can be adapted for the toolbar panel
- Popup becomes simpler: just controls (toggle, clear, send) and connection status

### Implementation Approach

1. Add chevron toggle button to Toolbar
2. Create ActionPanel component rendered below toolbar when expanded
3. Port display logic from `popup/ActionList.tsx`: action type badges, selector, instruction editing, remove
4. Connect to same `useActions` state via content script
5. Remove ActionList from popup, update popup layout

---

## R8: NATS Connection in FastAPI Lifespan

### Decision

Wire `nats_service.connect()` into FastAPI lifespan in `main.py`. Update health endpoint to return real NATS status.

### Rationale

- `nats_service.py` already has complete pub/sub implementation — just needs connection call
- Health endpoint currently returns hardcoded `False` for NATS status
