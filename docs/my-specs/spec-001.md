# Vex — Technical Specification

## 1. Overview

Vex is a visual web development tool that lets a developer point at elements on their live website, make visual edits (resize, restyle, add/remove elements, generate new sections with AI), and have an AI coding agent apply those changes to the actual source code.

The developer can: select elements and annotate them with text instructions; edit the DOM (add, delete, duplicate, move, wrap elements, edit text inline); visually resize elements by dragging handles with semantic before/after deltas; tweak styles (colors, fonts, spacing, borders, opacity, hover effects); replace images (upload, URL, or AI-generated); generate entire new sections by typing a prompt; copy styles between elements; and send everything as a batch to an AI agent that implements the changes in the codebase.

Vex has four components:

1. **Electron App** — the desktop shell that launches and manages everything, provides a project management UI
2. **AgentManager** — a Python process that orchestrates agents, owns state, exposes a REST API, and connects to NATS for real-time events
3. **NATS** — the real-time message bus connecting all components (embedded locally, cluster service on k8s)
4. **Chrome Extension** — the interactive visual editor the developer uses in the browser

---

## 2. Design Principle: Framework Agnosticism

Vex is completely agnostic to the web framework used to build the project. It works equally well with React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular, Astro, plain HTML, Django templates, Rails ERB, or anything else that renders to a browser.

This falls naturally out of the architecture. The Chrome extension operates on the **rendered DOM** — it sees elements, CSS, and pixels. It doesn't know or care whether a `<button>` was rendered by a React component, a Svelte template, or a static HTML file. When the developer drags a button wider, the extension records `{ selector: ".cta-btn", delta: "made 50% wider" }`. That's pure visual intent with no framework coupling.

Framework awareness lives entirely in the **agent**, not in Vex. When the code agent receives that action, it inspects the project and determines: "this is a Next.js project using Tailwind, so I change `w-48` to `w-72` in `components/Hero.tsx`." If the same visual change happened on a Vue project with SCSS, the agent would edit the `.cta-btn` class in a `.scss` file. Vex never needed to know the difference.

The chain is: **extension sees pixels → records intent → agent understands codebase → writes idiomatic code.** Vex is the visual layer and orchestration layer. The "how to write code in framework X" intelligence is the agent's job.

The only place Vex touches framework detection is in **dev server management** — it needs to know that `npm run dev` starts a Next.js app on port 3000, or that `python manage.py runserver` starts Django on 8000. But that's process lifecycle, not code understanding. The auto-detected `project.framework` and `project.stylingApproach` values are passed to the agent as **optional context hints** in the batch metadata, saving the agent from re-scanning the codebase every time. But if Vex guesses wrong or can't detect anything, the agent figures it out on its own by reading the code.

---

## 3. Architecture

### 3.1 Component topology

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron App                                                     │
│                                                                   │
│  ┌──────────────┐   ┌───────────────────┐   ┌────────────────┐  │
│  │  UI (webview) │   │  AgentManager     │   │  NATS Server   │  │
│  │  project mgmt │◄─►│  Python process   │◄─►│  embedded      │  │
│  │  status/logs  │   │  REST + state     │   │  port 4222     │  │
│  └──────────────┘   └───────┬───────────┘   └───────┬────────┘  │
│                              │                        │           │
│                     ┌────────▼──────────┐             │           │
│                     │  Claude Code      │◄────────────┘           │
│                     │  (agent process)  │  NATS sub/pub           │
│                     │  local filesystem │                         │
│                     └───────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
         ▲                      ▲
         │ REST                 │ NATS (via WS listener)
         │                      │
  ┌──────┴──────────────────────┴──────┐
  │        Chrome Extension             │
  │   visual editing on any website     │
  └─────────────────────────────────────┘
```

Electron spawns three child processes: AgentManager (Python), NATS server (nats-server binary), and agent processes (Claude Code). The UI is a webview that communicates with AgentManager over REST. The Chrome extension communicates with AgentManager over REST for batch submission and configuration, and subscribes to NATS via its native WebSocket listener for real-time events (generation results flowing back, status updates).

### 3.2 Deployment variants

This architecture supports two deployment modes with the same protocol:

**Local (this project):** Electron bundles everything. AgentManager and NATS run as child processes. Agents are local processes with direct filesystem access. State is stored in SQLite.

**K8s (future project):** AgentManager is a deployed service. NATS is a cluster service (Helm chart). Agents are k8s jobs or Temporal workflows. UI is a custom webapp. State is in PostgreSQL or Redis. No local filesystem access — agents interact with remote resources via APIs.

The protocol between components (REST endpoints, NATS subjects, data shapes) is identical in both modes. Only the deployment topology changes.

### 3.3 Communication patterns

**REST (AgentManager):** Request/response for configuration, project management, batch CRUD, agent lifecycle commands, status queries. The Chrome extension and UI both use the same REST API.

**NATS:** Pub/sub for real-time events. Subject hierarchy:

| Subject pattern | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `vex.batch.{projectId}.new` | Extension | AgentManager, Agents | New batch of actions submitted |
| `vex.generate.request.{projectId}` | Extension | Agents | Generation request (section or image prompt) |
| `vex.generate.result.{requestId}` | Agent | Extension | Generation result (HTML or image URL) |
| `vex.agent.{agentId}.status` | Agent | AgentManager, UI | Agent heartbeat, state changes |
| `vex.agent.{agentId}.log` | Agent | UI | Live log streaming |
| `vex.project.{projectId}.status` | AgentManager | UI | Project/dev server status changes |
| `vex.task.{taskId}.progress` | Agent | UI, Extension | Task progress updates |

The Chrome extension connects to NATS via the native WebSocket listener (nats-server supports `websocket {}` config since v2.2). It uses the `nats.ws` JavaScript client library. No custom WS relay needed.

### 3.4 State ownership

AgentManager owns all persistent state:
- **Projects:** path, framework, dev server config, detected settings
- **Agents:** registered agents, capabilities, current status, health history
- **Batches:** submitted action batches with metadata (screenshots stored as file references, not in the DB)
- **Tasks:** generation requests, their status, and results
- **Configuration:** global settings, per-project overrides

Storage: SQLite locally (single file at `~/.vex/vex.db`), PostgreSQL on k8s.

Screenshots and large binary data are stored as files in `~/.vex/data/{projectId}/` and referenced by path in the database.

---

## 4. Electron App

### 4.1 Responsibilities

The Electron app is a launcher and management shell. It:
- Spawns and manages child processes (AgentManager, NATS server, agents)
- Provides a project management UI
- Shows agent status, logs, and task progress
- Manages dev server lifecycle for each project
- Bundles the Chrome extension files for easy installation

### 4.2 Process management

On launch, Electron:
1. Starts the embedded NATS server (`nats-server` binary, bundled) on port 4222 with WebSocket listener on port 4223
2. Starts AgentManager (Python process) configured to connect to the local NATS
3. Waits for AgentManager's health endpoint to respond

On quit, Electron:
1. Sends shutdown signal to AgentManager
2. AgentManager gracefully stops all agents
3. Stops NATS server
4. Exits

If AgentManager crashes, Electron restarts it automatically (max 3 retries, then show error in UI).

### 4.3 Project management UI

The UI provides:
- **Project list:** shows all configured projects with status indicators (dev server running, agent connected, last batch time)
- **Add project:** folder picker dialog → auto-detection of framework and dev server command
- **Project detail view:** dev server logs, agent status, action history, configuration
- **Agent panel:** shows connected agents, their capabilities, health, and live logs
- **Settings:** NATS port, AgentManager port, default agent configuration, Chrome extension connection URL

### 4.4 Project auto-detection

When the developer picks a folder, Vex analyzes it to detect:

| Signal | Detection method | What it sets |
|---|---|---|
| Framework | Check for `next.config.*`, `nuxt.config.*`, `svelte.config.*`, `angular.json`, `vite.config.*`, `package.json` scripts | `project.framework` |
| Dev server command | Parse `package.json` scripts for `dev`, `start`, `serve` | `project.devCommand` |
| Package manager | Check for `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json` | `project.packageManager` |
| Styling approach | Scan for `tailwind.config.*`, `.scss` files, `styled-components` in deps, CSS modules (`*.module.css`) | `project.stylingApproach` |
| Port | Parse dev command or config for port number, default 3000 | `project.devPort` |

Auto-detected values are shown in the UI and editable. Stored in the project record in SQLite.

### 4.5 Dev server lifecycle

When a project is "started" in the Electron UI:
1. Run `project.devCommand` (e.g., `npm run dev`) in the project directory as a child process
2. Monitor stdout for the "ready" URL (regex patterns for common frameworks: "ready on <http://localhost:3000>", "Local: <http://localhost:5173>", etc.)
3. Once detected, store the URL and publish `vex.project.{projectId}.status` with `{ status: "running", url: "http://localhost:3000" }`
4. The Chrome extension receives this and can auto-navigate or show the URL
5. On stop: send SIGTERM to the dev server process, wait 5s, SIGKILL if still alive

Dev server stdout/stderr is streamed to the UI via NATS (`vex.project.{projectId}.log`).

---

## 5. AgentManager

A Python process that is the brain of the system.

### 5.1 Responsibilities

- Agent lifecycle: start, stop, restart, health monitoring
- REST API for all CRUD operations (projects, batches, agents, tasks, config)
- Task queue and routing: dispatch generation requests to agents with matching capabilities
- State persistence (SQLite/PostgreSQL)
- NATS subscription management

### 5.2 REST API

**Project endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create project (body: `{ path, name? }`). Triggers auto-detection. |
| `GET` | `/api/projects/{id}` | Get project details including detected config |
| `PATCH` | `/api/projects/{id}` | Update project settings |
| `DELETE` | `/api/projects/{id}` | Remove project |
| `POST` | `/api/projects/{id}/start` | Start dev server |
| `POST` | `/api/projects/{id}/stop` | Stop dev server |

**Batch endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/projects/{id}/batches` | Submit a batch of actions from the extension. Up to 50MB. |
| `GET` | `/api/projects/{id}/batches` | List batches for a project |
| `GET` | `/api/projects/{id}/batches/{batchId}` | Get a specific batch with all actions |
| `GET` | `/api/projects/{id}/batches/latest` | Get the most recent batch (what the agent reads) |
| `DELETE` | `/api/projects/{id}/batches/{batchId}` | Delete a batch |

**Agent endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | List all registered agents |
| `POST` | `/api/agents` | Register an agent (body: `{ name, capabilities, type }`) |
| `GET` | `/api/agents/{id}` | Agent details + health |
| `POST` | `/api/agents/{id}/start` | Start an agent process |
| `POST` | `/api/agents/{id}/stop` | Stop an agent |
| `DELETE` | `/api/agents/{id}` | Deregister |
| `POST` | `/api/agents/{id}/heartbeat` | Agent heartbeat |

**Task endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tasks` | Create a task (generation request). AgentManager routes to capable agent. |
| `GET` | `/api/tasks/{id}` | Task status and result |
| `GET` | `/api/tasks/pending` | Pending tasks for an agent (filtered by capability) |
| `POST` | `/api/tasks/{id}/result` | Agent posts task result |

**Utility:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | AgentManager health: uptime, agent count, NATS connected, DB status |
| `GET` | `/api/config` | Global configuration |
| `PATCH` | `/api/config` | Update configuration |

All endpoints return JSON. CORS enabled for local origins (Electron webview, Chrome extension).

### 5.3 Agent lifecycle management

AgentManager maintains an agent registry. Each agent has:
- `id`: unique identifier
- `name`: human-readable name (e.g., "Claude Code")
- `type`: `"claude-code"` | `"image-generator"` | custom
- `capabilities`: array of strings (e.g., `["code-edit", "file-system", "section-generation"]`)
- `status`: `"registered"` | `"starting"` | `"running"` | `"stopping"` | `"stopped"` | `"error"`
- `pid`: process ID (for local agents)
- `lastHeartbeat`: timestamp

For local deployment, AgentManager starts agent processes directly. For k8s, it creates jobs via the k8s API.

**Health monitoring:** Agents send heartbeats via `POST /api/agents/{id}/heartbeat` or NATS publish to `vex.agent.{agentId}.status`. If no heartbeat for 60 seconds, mark agent as unhealthy. After 5 minutes, attempt restart (local) or mark as failed (k8s).

### 5.4 Task routing

When a generation request arrives (section generation, image generation), AgentManager:
1. Checks the task type against registered agent capabilities
2. Routes to an available agent with the matching capability
3. If multiple agents match, uses round-robin (or queue groups via NATS)
4. Publishes task to `vex.generate.request.{projectId}` for the subscribed agent
5. Tracks task status: `pending` → `assigned` → `in_progress` → `completed` | `failed`
6. On result, publishes to `vex.generate.result.{requestId}` for the extension

For now, Claude Code handles everything. The routing layer exists so future agents can be added without changing the extension or protocol.

---

## 6. Chrome Extension

### 6.1 Manifest

Manifest V3 Chrome extension. Permissions: `activeTab`, `scripting`. Content scripts injected on all URLs.

### 6.2 Connection to Vex

The extension connects to:
- **AgentManager REST API** (default `http://localhost:8420`) for batch submission, project config, status
- **NATS WebSocket listener** (default `ws://localhost:4223`) for real-time events: generation results, project status, task progress

On activation, the extension fetches the project list from AgentManager and asks the developer to select which project they're working on (or auto-detects based on the current tab URL matching a project's dev server URL).

All actions and messages include a `projectId` so the system knows which codebase to modify.

### 6.3 Interaction modes

The extension provides four primary modes plus two auxiliary tools, switchable via a floating toolbar or keyboard shortcuts 1–6.

**Select Mode (default, shortcut `1`):**
Click elements to select them, optionally type a text instruction, capture screenshot. Each click captures: element metadata (CSS selector, computed styles, attributes, text content, bounding rect), a viewport screenshot with the element highlighted, and an optional text instruction.

**Edit Mode (shortcut `2`):**
Modify the live DOM. Every mutation is recorded as a structured operation.

Available actions: add element via "+" handles at block element edges (opens tag selector + text input popup); edit text via double-click (contenteditable); delete via Delete key or "×" handle; duplicate via Ctrl+D or "⧉" handle; move via drag-to-reorder; wrap via Ctrl+W dialog; generate section via large "+" dividers between major page sections (sends prompt to agent, result injected live); replace image via click on `<img>` (upload, URL, or AI-generated prompt).

"+" insertion handles appear at top/bottom edges of block elements (sibling insert) and inside containers (child insert). Section generation "+" dividers appear between `<section>`, `<main>` children, and top-level `<div>` blocks — larger and more prominent. Clicking opens a dialog with textarea, style hint dropdown, and Generate button.

Image replacement popup offers three options: upload (file picker → base64 → swap src), URL (paste → swap src), or generate (prompt → send to agent → result via NATS → swap src).

Ctrl+Z undoes the last DOM mutation. contenteditable cleanup strips browser artifacts (`<br>`, `<div>`, inline styles).

**Resize Mode (shortcut `3`):**
Click an element to show eight resize handles plus colored padding (green) and margin (orange) zone visualizations. Drag to resize — `element.style` updates live. On release, capture before/after styles and compute semantic deltas.

Semantic delta: parse values to numbers, compute ratio, generate description ("made ~50% wider", "doubled", "halved"). Round target values to sensible numbers. Changes under 5% show a keep/discard confirmation.

**Style Mode (shortcut `4`):**
Click an element to show a compact style editor panel. Sections: colors (pickers for color, backgroundColor, borderColor with design-token-aware descriptions); typography (font family picker with page font detection + Google Fonts, size slider, weight dropdown, line-height, letter-spacing, text-transform, text-align, text-decoration); spacing (padding/margin four-value inputs with link toggle); borders (width, style, color, radius); visibility toggles (display:none, opacity slider, visibility:hidden); hover effects (presets: scale, shadow, lift + custom hover state controls + transition duration/easing).

All changes apply live. On close/deselect, if changed: capture before/after screenshots, record action.

**Copy Style Tool (shortcut `5`):**
Click source element, click target. Target gets source's visual styles. Shift = text styles only, Alt = box styles only. Recorded with the property map.

**Visibility Helpers (shortcut `6`):**
Diagnostic overlay (not an action): element outlines, all margins/paddings visualized, grid/flex container badges. Read-only.

### 6.4 Floating toolbar

Appears at top-center of viewport when active. Six mode buttons, active highlight, action count badge, quick Send button. Draggable.

### 6.5 Extension popup

~340px wide. Mode selector, AgentManager connection status, project selector dropdown, action list with type badges and summaries, Send Batch button, Clear All, action count.

### 6.6 Background service worker

Handles extension icon click (toggle content script) and `captureTab` requests (`chrome.tabs.captureVisibleTab`).

### 6.7 Screenshot capture

Select Mode: one screenshot per selection (after), element highlighted in amber. Edit/Resize/Style modes: two screenshots per action (before + after). Base64 JPEG at quality 0.75. Coordinates multiplied by `devicePixelRatio`.

---

## 7. Data Shapes

### 7.1 Common fields on all actions

```json
{
  "type": "string",
  "selector": "CSS selector",
  "projectId": "string",
  "timestamp": "ISO 8601",
  "screenshotBefore": "base64 JPEG or null",
  "screenshotAfter": "base64 JPEG"
}
```

### 7.2 Action types

**type: "select"** — annotated selection with instruction

```json
{ "type": "select", "selector": ".hero > button.cta",
  "instruction": "add a gradient background from indigo to purple",
  "elementInfo": { "tagName": "button", "id": null, "classList": ["cta"],
    "textContent": "Get Started",
    "attributes": { "class": "cta", "type": "submit" },
    "computedStyles": { "...": "..." },
    "boundingRect": { "x": 520, "y": 340, "width": 200, "height": 48 },
    "parentTag": "div", "childCount": 2 },
  "screenshotAfter": "<base64>" }
```

**type: "insert"** — DOM insertion

```json
{ "type": "insert", "position": "after|before|firstChild|lastChild",
  "referenceSelector": ".hero > h1",
  "content": { "tag": "p", "text": "Welcome to our platform.", "attributes": {} },
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "editText"** — text content change

```json
{ "type": "editText", "selector": ".hero > h1",
  "before": "Welcome to Our Site", "after": "Build Something Amazing",
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "delete"** — element removal

```json
{ "type": "delete", "selector": ".hero > .legacy-badge",
  "deletedOuterHTML": "<span class=\"legacy-badge\">Beta</span>",
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "duplicate"** — clone element

```json
{ "type": "duplicate", "selector": ".features > .feature-card:nth-of-type(2)",
  "insertedAfter": ".features > .feature-card:nth-of-type(2)",
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "move"** — reorder siblings

```json
{ "type": "move", "selector": ".nav-links > a:nth-of-type(3)",
  "parentSelector": ".nav-links", "fromIndex": 2, "toIndex": 0,
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "wrap"** — wrap in new element

```json
{ "type": "wrap", "selector": ".hero > img",
  "wrapper": { "tag": "div", "classList": ["image-wrapper"] },
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "resize"** — visual resize with semantic deltas

```json
{ "type": "resize", "selector": ".hero > .cta-btn",
  "beforeStyles": { "width": "200px", "height": "48px", "padding": "12px 24px" },
  "afterStyles": { "width": "300px", "height": "48px", "padding": "12px 36px" },
  "deltas": [
    { "property": "width", "before": "200px", "after": "300px", "ratio": 1.5, "description": "made ~50% wider" },
    { "property": "padding-left", "before": "24px", "after": "36px", "ratio": 1.5, "description": "made ~50% wider" }
  ],
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "styleChange"** — CSS property changes including hover effects

```json
{ "type": "styleChange", "selector": ".card-title",
  "changes": [
    { "property": "color", "before": "rgb(0,0,0)", "after": "rgb(99,102,241)", "description": "changed from black to indigo (indigo-500)" },
    { "property": "fontSize", "before": "16px", "after": "20px", "ratio": 1.25, "description": "increased by 25%" },
    { "property": "fontFamily", "before": "Inter, sans-serif", "after": "Playfair Display, serif", "description": "changed to Playfair Display (serif)" }
  ],
  "hoverChanges": [
    { "property": "transform", "value": "scale(1.05)", "description": "scale up 5% on hover" },
    { "property": "boxShadow", "value": "0 8px 24px rgba(0,0,0,0.15)", "description": "add lift shadow on hover" }
  ],
  "transition": { "duration": "200ms", "easing": "ease" },
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "replaceImage"** — image replacement

```json
{ "type": "replaceImage", "selector": ".hero > img.hero-illustration",
  "originalSrc": "https://mysite.com/images/old-hero.png",
  "method": "generate",
  "prompt": "a flat illustration of a rocket launching from a laptop, indigo and purple palette",
  "dimensions": { "width": 800, "height": 400 },
  "generatedUrl": "https://generated-image-url-or-base64...",
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "generateSection"** — AI-generated section

```json
{ "type": "generateSection", "position": "after",
  "referenceSelector": "section.hero",
  "prompt": "a testimonials section with 3 cards, each with a quote, name, and role",
  "styleHint": "match existing page style",
  "generatedHTML": "<section class=\"testimonials\">...</section>",
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

**type: "copyStyle"** — style copy between elements

```json
{ "type": "copyStyle", "fromSelector": ".card-title", "toSelector": ".sidebar-title",
  "copiedProperties": { "fontSize": "24px", "fontWeight": "700", "color": "rgb(15, 23, 42)", "lineHeight": "1.2" },
  "screenshotBefore": "<base64>", "screenshotAfter": "<base64>" }
```

### 7.3 Batch object

```json
{ "batch": {
    "id": "batch-uuid",
    "projectId": "project-uuid",
    "pageUrl": "http://localhost:3000/landing",
    "pageTitle": "My Site — Landing Page",
    "actions": [ "...action objects in chronological order..." ],
    "timestamp": "2026-03-29T14:22:01.000Z"
  }
}
```

### 7.4 Generation request (NATS message)

Published to `vex.generate.request.{projectId}`:

```json
{ "requestId": "gen-uuid",
  "projectId": "project-uuid",
  "type": "section | image",
  "prompt": "a testimonials section with 3 cards",
  "context": { "pageUrl": "...", "surroundingHTML": "...", "dimensions": { "width": 800, "height": 400 } }
}
```

### 7.5 Generation result (NATS message)

Published to `vex.generate.result.{requestId}`:

```json
{ "requestId": "gen-uuid",
  "status": "completed | failed",
  "result": "<section>...</section> | https://image-url",
  "error": null
}
```

### 7.6 Computed styles to capture

color, backgroundColor, fontSize, fontFamily, fontWeight, padding (and per-side), margin (and per-side), border, borderRadius, display, position, width, height, textAlign, lineHeight, letterSpacing, boxShadow, opacity, transform, gap, flexDirection, justifyContent, alignItems, gridTemplateColumns, textTransform, textDecoration, transition.

### 7.7 Selector generation logic

Try `#id` first. If no ID, try `tag.class1.class2` and check uniqueness with `querySelectorAll`. If not unique, walk up the DOM building a path with `tag:nth-of-type(n)` segments, stopping at the first ancestor with an ID.

---

## 8. Generation Flow (Bidirectional Communication)

Section generation and image generation require a round-trip between the extension and an agent.

### 8.1 Flow

```
1. Developer clicks section "+" or image "Generate" in the Chrome extension

2. Extension publishes to NATS: vex.generate.request.{projectId}
   { requestId, type: "section"|"image", prompt, context }

3. Extension also POSTs to AgentManager REST: POST /api/tasks
   (for persistence and routing — AgentManager assigns to a capable agent)

4. Agent receives the request (via NATS subscription)

5. Agent generates HTML or image

6. Agent publishes to NATS: vex.generate.result.{requestId}
   { requestId, status: "completed", result: "<html>..." }

7. Agent also POSTs to AgentManager: POST /api/tasks/{id}/result
   (for persistence)

8. Extension receives the result via NATS subscription, injects into live page

9. Developer can tweak the generated content using other modes

10. Final batch (including the generateSection/replaceImage action) is sent
```

### 8.2 Timeout handling

If no result arrives within 30 seconds, the extension shows: "Agent didn't respond. Make sure Vex is running and an agent is connected." The developer can retry or cancel.

### 8.3 Context sent with generation requests

For section generation: page URL, surrounding HTML (truncated: the parent container + 2 adjacent siblings), detected framework and styling approach from the project config.

For image generation: original image src, current dimensions, alt text, surrounding context.

---

## 9. Agent Integration

Vex supports three tiers of agent integration, from full lifecycle control to "bring your own agent." All tiers use the same REST API and task format — the difference is who spawns the process and how deeply Vex can control it.

### 9.1 Integration tiers overview

| Tier | Who spawns the agent | Control level | Generation requests | Setup effort |
|---|---|---|---|---|
| **Tier 1: Native adapter** | AgentManager | Full (start, stop, restart, health, streaming logs) | Real-time via NATS | Zero — built into Vex |
| **Tier 2: CLI wrapper** | AgentManager | Medium (spawn with prompt, monitor process, capture output) | Batch only (included in prompt) | Zero — configure CLI path in Vex UI |
| **Tier 3: External bridge** | User manages agent themselves | Pull-based (agent polls for tasks) | Agent polls `/api/tasks/pending` | User installs a plugin, adds an MCP server, or pastes an instruction |

### 9.2 Tier 1: Native adapters (full orchestration)

AgentManager has a pluggable adapter system. Each adapter is a Python class that knows how to spawn, configure, send tasks to, and monitor a specific agent type. Adapters are built into AgentManager and registered at startup.

**Adapter interface:**

```python
class AgentAdapter:
    name: str                          # "claude-code", "codex", "aider", "langchain-deep"
    capabilities: list[str]            # ["code-edit", "file-system", "section-generation"]

    async def start(self, project) -> AgentProcess
    async def stop(self, agent_id)
    async def send_task(self, agent_id, task) -> None
    async def get_status(self, agent_id) -> AgentStatus
    def subscribe_logs(self, agent_id) -> AsyncIterator[str]
```

**Planned Tier 1 adapters:**

| Adapter | How it works |
|---|---|
| `claude-code-sdk` | Uses Claude Agent SDK to spawn a session. Feeds batch as structured prompt. Subscribes to output stream. Full NATS integration for real-time generation requests. **V1 implementation.** |
| `codex` | Spawns Codex CLI process. Passes batch as prompt via stdin or `--prompt`. Monitors stdout for progress. |
| `aider` | Spawns Aider with `--message` flag. Passes batch as the message. Monitors file changes. |
| `langchain-deep` | Instantiates a LangChain DeepAgent class directly in the AgentManager Python process. Full programmatic control. |
| `custom-sdk` | Generic adapter for any Python-based agent. User provides a Python class that implements the adapter interface. |

Tier 1 gives full lifecycle control: start, stop, restart, health monitoring, streaming logs to the UI, and real-time generation request handling via NATS.

**V1 ships with the `claude-code-sdk` adapter only.** Other Tier 1 adapters are added over time. The adapter interface is stable from day one so community adapters can be contributed.

### 9.3 Tier 2: CLI wrapper (spawn + prompt)

A generic adapter that works with any coding agent that has a CLI. AgentManager constructs a prompt string from the batch, then spawns the CLI process.

**How it works:**
1. AgentManager renders the batch into a structured text prompt (same content a Tier 1 adapter would send, but as plain text)
2. Spawns the agent CLI: `{cli_command} --prompt "{rendered_prompt}" --dir {project_path}` (or pipes via stdin, depending on the CLI)
3. Monitors the process: captures stdout/stderr, streams to UI via NATS
4. Detects completion (process exit) and reports success/failure

**Configuration in Vex UI:**
The developer adds a Tier 2 agent by providing:
- CLI command (e.g., `copilot-cli`, `aider`, `claude -p`)
- How to pass the prompt: `--prompt` flag, `--message` flag, stdin, or temp file
- Working directory handling: `--dir` flag, `--cwd` flag, or `cd` before invocation
- Optional: environment variables, timeout

**What you get:** Process lifecycle (start/stop), log streaming, exit code detection.
**What you lose vs Tier 1:** No real-time generation request handling (generation prompts are baked into the initial batch prompt). No incremental progress updates. No health monitoring between tasks.

This is the "it works with anything that has a CLI" tier. Adding a new agent takes 30 seconds of configuration, not code.

### 9.4 Tier 3: External agent bridge (bring your own agent)

For developers who already have an agent running (their own Claude Code session, Cursor, Windsurf, a custom setup) and want to connect it to Vex without Vex spawning or managing it.

The core insight: **the agent pulls work from Vex, not the other way around.** Vex's REST API already has everything needed. The agent just needs to know how to check for tasks and post results.

**Three integration methods, in order of ease:**

**Method A — Vex plugin for Claude Code:**

The user installs a Claude Code plugin:

```bash
claude plugin install vex-agent
```

The plugin contains:

```
vex-agent/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── vex-editor/
│       └── SKILL.md
├── commands/
│   └── apply.md
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── session-start.sh
│       └── session-end.sh
└── README.md
```

`SessionStart` hook registers the user's Claude Code session with AgentManager (`POST /api/agents` with `{ type: "external", capabilities: ["code-edit", "file-system"] }`). The skill teaches Claude Code the full Vex task format and interpretation rules. The `/vex-agent:apply` command fetches the latest batch and processes it. The `SessionStart` hook can also start a background polling loop for generation requests.

From the user's perspective: install the plugin, start Claude Code in their project directory, and it automatically connects to Vex. When they make visual edits in the extension and hit Send, they type `/vex-agent:apply` in their Claude Code session.

**Method B — Vex MCP server for Cursor/Windsurf/any MCP-compatible agent:**

Vex exposes an MCP server (started by AgentManager) that any MCP-compatible tool can connect to. The MCP server is a thin wrapper around the REST API.

**MCP tools exposed:**

| Tool | Description |
|---|---|
| `vex_get_pending_batch` | Returns the latest batch for the active project (actions, screenshots saved as temp files, project context) |
| `vex_get_task` | Returns a specific pending generation request |
| `vex_submit_result` | Posts a task result (generated HTML or image URL) back to Vex |
| `vex_get_project_context` | Returns project info (framework, styling approach, dev server URL, file structure summary) |
| `vex_register_agent` | Registers this agent session with AgentManager |
| `vex_heartbeat` | Keepalive signal |

The user adds the Vex MCP server to their agent's config:

```json
{
  "mcpServers": {
    "vex": {
      "url": "http://localhost:8420/mcp"
    }
  }
}
```

This IS the correct use of MCP — the agent calls Vex to pull work, not the other way around. The agent remains the orchestrator of its own actions; Vex is a tool it uses to get visual editing tasks and report results.

**Method C — Raw REST instructions (works with literally any agent):**

For agents that don't support plugins or MCP, the user pastes a one-paragraph instruction into their agent's context:

```
You are connected to Vex, a visual web editing tool. To get pending visual 
editing tasks, call: GET http://localhost:8420/api/projects/{projectId}/batches/latest
Each batch contains actions (select, insert, editText, delete, resize, styleChange, 
etc.) with CSS selectors, instructions, semantic deltas, and screenshots. 
Process each action in order. Find the element in the codebase using the CSS selector.
Apply the change idiomatically. When done, call:
POST http://localhost:8420/api/tasks/{taskId}/result with { "status": "completed" }
For generation requests, poll: GET http://localhost:8420/api/tasks/pending
```

This works with any agent that can make HTTP calls. No integration code, no plugins. The user manages the agent themselves; Vex just provides the task data.

**What Tier 3 agents can and cannot do:**

| Capability | Plugin (A) | MCP (B) | Raw REST (C) |
|---|---|---|---|
| Receive batches | Auto on `/apply` | Via `vex_get_pending_batch` tool | Manual GET call |
| Apply code changes | Full (agent has filesystem) | Full | Full |
| Generation requests | Background polling via hook | Via `vex_get_task` tool | Manual polling |
| Report results back | Auto via hook | Via `vex_submit_result` tool | Manual POST call |
| Health monitoring | Heartbeat via hook | Via `vex_heartbeat` tool | Not available |
| Show in Vex UI | Yes (registered agent) | Yes (registered) | Partial (no health) |
| Real-time NATS events | If agent supports NATS client | No (REST only) | No |

### 9.5 Agent interpretation rules

These rules apply to all agents regardless of integration tier. They define how the agent should translate each action type into source code changes:

- **select:** Use selector + element info to find element in source. Read instruction. Look at screenshot. Apply with own judgment.
- **insert:** Find reference element in source. Insert at specified position. Match project's coding style. The developer's edit is a sketch — produce idiomatic code.
- **editText:** Find element, replace before with after. Check translation files, CMS, constants — update the right source.
- **delete:** Find and remove. Clean up unused CSS, imports.
- **duplicate:** Clone after original. New ID if needed. Consider whether it suggests a loop pattern.
- **move:** Reorder within parent.
- **resize:** Read `deltas[].description` as primary instruction. Prefer relative/semantic values. Use project's styling system.
- **styleChange:** Read `changes[].description`. Map to design tokens. Handle font imports. For hover effects, create `:hover` rules or Tailwind `hover:` utilities.
- **replaceImage:** Upload → save to assets, update src. URL → update src. Generate → use prompt to create production image, save to assets.
- **generateSection:** Use prompt + generatedHTML as reference. Create proper components using the project's system. Don't paste raw HTML.
- **copyStyle:** Apply copied properties using the project's styling system.

**General principles:**
The developer's edit is a sketch, not a spec. Process actions in order. Prefer design tokens over raw values. Analyze the project first (framework, styling approach, component patterns). Ensure font imports for new font families.

### 9.6 Adapter registration and routing

AgentManager maintains a registry of all connected agents, regardless of tier:

```json
{
  "id": "agent-uuid",
  "name": "Claude Code (native)",
  "type": "claude-code-sdk",
  "tier": 1,
  "capabilities": ["code-edit", "file-system", "section-generation", "image-generation"],
  "status": "running",
  "pid": 12345,
  "lastHeartbeat": "2026-03-30T10:00:00Z",
  "projectId": "project-uuid"
}
```

When a task arrives, AgentManager routes it:
1. Filter agents by matching capability (e.g., `section-generation` for a generateSection task)
2. Prefer Tier 1 agents (fastest, most reliable)
3. If multiple agents match at the same tier, round-robin
4. If no agent has the capability, queue the task and notify the UI

The Vex UI shows all connected agents with their tier, capabilities, status, and which project they're assigned to. The developer can see at a glance: "Claude Code (native, Tier 1) is handling code edits; my Cursor session (MCP, Tier 3) is also connected and available."

### 9.7 Future specialized agents

The tier system makes it easy to add specialized agents:

| Agent | Tier | Capabilities | Notes |
|---|---|---|---|
| Claude Code (SDK) | 1 | `code-edit`, `file-system`, `section-generation` | V1 default |
| Codex CLI | 1 or 2 | `code-edit`, `file-system` | Tier 1 if SDK available, Tier 2 via CLI |
| Aider | 2 | `code-edit`, `file-system` | CLI wrapper |
| LangChain DeepAgent | 1 | `code-edit`, custom | Python class, runs in AgentManager |
| Image generation agent | 1 | `image-generation` | Dedicated agent for `replaceImage` |
| Linter/formatter | 1 or 2 | `code-quality` | Runs after code agent finishes |
| Test generator | 1 or 2 | `testing` | Generates/updates tests for changed components |
| User's Claude Code | 3 | `code-edit`, `file-system` | Via vex-agent plugin |
| User's Cursor | 3 | `code-edit` | Via MCP server |
| Any CLI agent | 2 | `code-edit` | User configures CLI path |
| Any HTTP-capable agent | 3 | varies | Via raw REST instructions |

---

## 10. Competitive Landscape

This combination is novel. Existing tools cover parts:

- **Visual CSS Editor, UI Inspector, CSS Pro:** browser extensions for visual CSS editing. CSS Pro has "Copy prompt for LLM" — manual copy-paste, CSS only, no DOM mutations, no screenshots, no live connection.
- **Cursor Visual Editor (Dec 2025):** closest competitor. Drag elements, describe changes by clicking, agents update code in parallel. But locked inside Cursor IDE's embedded browser — cannot use your real Chrome with cookies, auth, real state.
- **Inspector (MacOS app):** visual editing layer connecting to Claude Code/Cursor/Codex. Standalone app with embedded browser, not a Chrome extension.
- **Browser automation tools (browser-use, nanobrowser):** AI controls browser for navigation. Different problem — those automate browsing; Vex is about human visual editing with agent implementation.

**What makes Vex novel:** Chrome extension on any real website + multi-modal editing (select, DOM, resize, style, generation) + structured operations with semantic deltas + NATS-based bidirectional bridge + managed agent orchestration + project-aware dev server lifecycle + architecture that scales from desktop to k8s.

---

## 11. Edge Cases and Considerations

**Screenshots:** Base64 JPEGs at quality 0.75 are 50-200KB each. With before/after pairs, a batch of 10 actions is 2-4MB. 50MB body limit is sufficient.

**Iframes:** Content script only accesses the top frame. Elements inside iframes are not selectable.

**SPAs / dynamic content:** Selectors generated at action time may go stale on re-render. Screenshots serve as ground truth.

**Device pixel ratio:** Screenshots and canvas annotations must account for `devicePixelRatio`.

**Port conflicts:** AgentManager REST port (default 8420), NATS (4222), NATS WS (4223) are all configurable via Electron settings.

**Conflicting actions:** Multiple actions on the same element recorded separately in order. Agent applies sequentially.

**Framework interpretation:** Agent must consider React/JSX, Vue SFCs, Svelte, plain HTML, Tailwind, CSS Modules, styled-components, SCSS. Skill instructs analysis first.

**Font imports:** New font families require proper imports (Google Fonts, @font-face, npm).

**Generation timeouts:** 30-second timeout in extension. Retry or cancel.

**Generated content is a preview:** `generatedHTML` and `generatedUrl` are previews. Agent creates proper source code.

**Large batches:** 10-20MB possible. Extension shows progress indicator during Send.

**Project identification:** Extension auto-matches current tab URL to a project's dev server URL. If multiple projects match or no match, prompts the developer to select.

**NATS disconnection:** If NATS connection drops, extension falls back to REST polling for generation results. Reconnects automatically. UI shows connection status.

**Agent crash during task:** AgentManager detects via heartbeat timeout. Marks task as failed. Extension receives failure notification. Developer can retry.

**Multiple developers:** For local Electron use, it's single-user. For k8s deployment, AgentManager handles multi-tenancy via project ownership and auth tokens.
