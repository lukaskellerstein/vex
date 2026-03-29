# Research: Vex — Visual Web Development Tool

**Branch**: `001-vex-visual-editor` | **Date**: 2026-03-30

## Research Topics

### R1: NATS WebSocket Integration in Chrome Extensions

**Decision**: Use `nats.ws` JavaScript client library connecting to nats-server's native WebSocket listener on port 4223.

**Rationale**: nats-server has built-in WebSocket support since v2.2 (`websocket {}` config block). The `nats.ws` package is the official NATS WebSocket client for browsers. This eliminates the need for a custom WebSocket relay — the extension connects directly to nats-server. The content script runs in the page context (via Shadow DOM), so standard WebSocket APIs are available.

**Alternatives considered**:
- Custom WebSocket relay through AgentManager: Rejected — adds unnecessary complexity, violates Principle VII (YAGNI), and creates a single point of failure for real-time events.
- Server-Sent Events (SSE) from AgentManager: Rejected — unidirectional only, cannot handle the bidirectional generation request/result flow.
- Long-polling REST: Rejected — high latency, poor UX for real-time generation results.

---

### R2: Chrome Extension Content Script Isolation

**Decision**: Continue using Shadow DOM for UI isolation (already implemented). All Vex UI (toolbar, overlays, panels) renders inside a Shadow DOM root attached to a container div injected into the page.

**Rationale**: Shadow DOM provides complete CSS isolation — page styles cannot leak into Vex UI and vice versa. The existing implementation already follows this pattern. Event handling uses `stopPropagation` to prevent interference with the host page.

**Alternatives considered**:
- iframe-based UI: Rejected — adds complexity for cross-frame communication, breaks the "real browser" principle if the developer interacts with Vex inside an iframe.
- No isolation (direct DOM injection): Rejected — page CSS would break Vex styling, Vex styles could affect the page.

---

### R3: Semantic Delta Computation for Resize

**Decision**: Compute deltas by parsing before/after CSS values to numbers, calculating ratios, and generating human-readable descriptions. Round target values to sensible increments (multiples of 4px for spacing, nearest 25% for ratios).

**Rationale**: Human-readable deltas ("made ~50% wider") give the agent semantic understanding of intent, which is more useful than raw pixel values. The agent can then choose the appropriate unit system (Tailwind classes, CSS custom properties, rem values) based on the project's styling approach.

**Algorithm**:
1. Parse before/after values to numbers (strip units)
2. Compute ratio = after / before
3. Generate description based on ratio ranges: < 0.5 → "less than half", 0.5 → "halved", 0.5-0.9 → "reduced by ~X%", 1.0 → "unchanged", 1.1-1.5 → "increased by ~X%", 2.0 → "doubled", > 2.0 → "more than doubled"
4. Round target values: width/height to nearest 4px, percentage ratios to nearest 5%

**Alternatives considered**:
- Raw pixel diffs only: Rejected — loses semantic meaning ("changed from 200px to 300px" vs "made ~50% wider").
- AI-interpreted deltas: Rejected — unnecessary complexity; simple math produces accurate descriptions.

---

### R4: AgentManager State Persistence

**Decision**: SQLite via aiosqlite for async access. Single database file at `~/.vex/vex.db`. Simple schema with tables for projects, agents, batches, actions, and tasks. Screenshot binary data stored as files in `~/.vex/data/{projectId}/`, referenced by file path in the database.

**Rationale**: SQLite is zero-config, embedded, and handles the single-user local deployment perfectly. aiosqlite provides async access compatible with FastAPI's async handlers. File-based screenshot storage keeps the database lightweight and avoids blob storage in SQLite (which degrades performance for large BLOBs).

**Alternatives considered**:
- PostgreSQL: Rejected for V1 — overkill for single-user local deployment. Will be used in the k8s deployment variant (future project).
- JSON file storage: Rejected — no transactional guarantees, poor query performance for batch/task lookups.
- SQLAlchemy ORM: Rejected — unnecessary abstraction for a well-defined schema. Raw SQL with aiosqlite is simpler and more transparent.

---

### R5: Agent Adapter Architecture

**Decision**: Python abstract base class (`AgentAdapter`) with async methods for start, stop, send_task, get_status, and subscribe_logs. V1 ships with `ClaudeCodeSDKAdapter` using the Claude Agent SDK. A `CLIWrapperAdapter` provides Tier 2 support for any CLI-based agent.

**Rationale**: The adapter interface is minimal (5 methods) and maps directly to the agent lifecycle described in the spec. Using an abstract class (not a protocol) ensures explicit registration and makes the extension point clear. The Claude Agent SDK provides programmatic control over Claude Code sessions — feeding structured prompts, subscribing to output streams, and handling NATS integration for real-time generation.

**Alternatives considered**:
- Plugin-based discovery (entry points, importlib): Rejected — overengineered for V1. Adapters are built-in Python classes registered at startup.
- gRPC between AgentManager and agents: Rejected — adds protocol complexity. REST + NATS already covers all communication needs.

---

### R6: Electron Process Management

**Decision**: Electron main process spawns three child processes: nats-server (binary), AgentManager (Python via `child_process.spawn`), and agent processes (via AgentManager). Process lifecycle uses SIGTERM for graceful shutdown (5s timeout → SIGKILL). AgentManager auto-restarts on crash (max 3 retries).

**Rationale**: Direct child process management is the simplest approach for a desktop app. Electron's `child_process` module provides spawn, kill, and stdio streaming. Health checking via HTTP GET to AgentManager's `/api/health` endpoint.

**Alternatives considered**:
- Docker containers for each component: Rejected — adds Docker dependency for a desktop app, violates simplicity principle.
- PM2 or similar process manager: Rejected — external dependency for something Electron handles natively.

---

### R7: Chrome Extension ↔ AgentManager Communication

**Decision**: Replace the current bridge server (localhost:3456) with direct REST calls to AgentManager (localhost:8420). The extension popup and content script both use `fetch()` to the AgentManager REST API for batch submission, project config, and status. Real-time events (generation results, task progress) flow via NATS WebSocket.

**Rationale**: The current bridge server at port 3456 is a stub. AgentManager already exposes the full REST API needed. Using two channels (REST for CRUD, NATS for real-time) matches the architecture specification exactly.

**Alternatives considered**:
- Keep a separate bridge server: Rejected — redundant intermediate layer, violates four-component architecture.
- WebSocket-only (no REST): Rejected — REST is better for request/response patterns (batch submission, config reads).

---

### R8: Project Auto-Detection Strategy

**Decision**: File-based heuristic detection. On project folder selection, scan for known configuration files and parse them for framework, dev command, package manager, styling, and port information.

**Detection order**:
1. **Framework**: Check for config files (next.config.*, nuxt.config.*, svelte.config.*, angular.json, vite.config.*). Fall back to package.json dependencies.
2. **Dev command**: Parse package.json scripts for "dev", "start", "serve" keys.
3. **Package manager**: Check lock files (pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lockb → bun, package-lock.json → npm).
4. **Styling**: Scan for tailwind.config.*, .scss files, styled-components in deps, *.module.css files.
5. **Port**: Parse dev command or framework config for port number, default 3000.

**Rationale**: Simple file existence checks + JSON parsing covers 90%+ of standard web projects. No need for AST analysis or running the project. Detection results are editable by the developer.

**Alternatives considered**:
- Running the dev server and parsing output: Rejected — slow, side-effect-heavy, might fail if deps aren't installed.
- AI-based project analysis: Rejected — overkill for detection that's based on well-known file patterns.
