# Research: First Full Run

**Branch**: `002-first-full-run` | **Date**: 2026-03-30

## R1: NATS Process Management in Electron

### Decision

Keep the existing `process-manager.ts` approach: spawn `nats-server` as a child process via `child_process.spawn()`. Harden it with port-conflict detection, orphan cleanup, and health verification.

### Rationale

- NATS is a single zero-dependency binary — ideal for child process management
- The `ProcessManager` class already spawns NATS with correct flags (`-p 4222 --websocket_port 4223 --websocket_no_tls`)
- Pattern is proven: same approach used for AgentManager (Python/uvicorn)
- Max 3 restart attempts already implemented
- Health polling (500ms interval, 30 retries) already works for AgentManager

### Alternatives Considered

- **Embedding NATS via nats.js server library**: Rejected — no maintained embedded server for Node.js; adds complexity
- **Requiring external NATS installation**: Rejected — violates "just works" UX; adds setup friction
- **Docker-based NATS**: Rejected — heavy dependency for desktop app; not all users have Docker

### Gaps to Address

1. **Port conflict detection**: Currently no check before spawning. Need to verify port 4222 is free (net.createServer probe or `nats-server` stderr parsing).
2. **Orphan cleanup**: No PID file written. On ungraceful shutdown, stale nats-server may hold the port. Need PID file at `~/.vex/nats.pid`.
3. **Health check for NATS**: Currently only AgentManager has HTTP health check. For NATS, verify by attempting a TCP connection to port 4222.
4. **NATS binary bundling**: Currently assumes `nats-server` is on PATH. Need to bundle platform-specific binary in Electron app resources or document installation requirement.

---

## R2: Claude Agent SDK Integration Pattern

### Decision

Use `ClaudeSDKClient` (stateful client) from `claude-agent-sdk` package. This is the right choice over `query()` because we need streaming output, session memory for multi-turn tasks, and hook support.

### Rationale

- `ClaudeSDKClient` provides: async context manager, streaming responses, multi-turn conversations, session resumption
- Already listed as a dependency in `pyproject.toml` (`claude-agent-sdk>=0.1.52`)
- Adapter interface (`AgentAdapter`) maps cleanly to SDK:
  - `start()` → create `ClaudeSDKClient` instance
  - `send_task()` → `client.query(prompt)` + stream `client.receive_response()`
  - `get_status()` → track internal state (idle/running/completed/failed)
  - `subscribe_logs()` → yield from response stream (TextBlock, ToolUseBlock events)
  - `stop()` → exit async context / cancel task

### Key Integration Details

- **Authentication**: SDK uses Claude Code's auth automatically (environment variables). No explicit API key management needed in adapter.
- **Permission mode**: Use `bypassPermissions` for automated agent runs (agent needs to freely read/write files).
- **Allowed tools**: `["Read", "Write", "Edit", "Bash", "Glob", "Grep"]` — standard file-system + code tools.
- **System prompt**: Inject project context (framework, styling, path) + batch actions as structured prompt.
- **Streaming**: `async for message in client.receive_response()` yields `AssistantMessage`, `TaskProgressMessage`, `ResultMessage` etc.
- **Cost tracking**: `ResultMessage` provides `total_cost_usd`, `input_tokens`, `output_tokens`, `duration_ms`.

### Alternatives Considered

- **`query()` function (stateless)**: Rejected — no hooks, no custom tools, no memory, no streaming control
- **CLI wrapper adapter (Tier 2)**: Already exists but spawns a subprocess, parses stdout — fragile, no structured output
- **Direct Anthropic API calls**: Rejected — loses all Claude Code tooling (file ops, search, etc.)

---

## R3: NATS Connection in FastAPI Lifespan

### Decision

Wire `nats_service.connect()` into FastAPI's async lifespan handler in `main.py`. The NATS service module already exists with full pub/sub support — it just needs to be connected on startup.

### Rationale

- `nats_service.py` already implements: `connect()`, `disconnect()`, `publish()`, `subscribe()`, `is_connected()`
- FastAPI lifespan is async — perfect fit for async NATS connection
- Health endpoint already checks NATS status but currently returns hardcoded `False`

### Gap

Currently `main.py` lifespan only initializes the database. Need to add:

```
await nats_service.connect()  # on startup
await nats_service.disconnect()  # on shutdown
```

---

## R4: End-to-End Data Flow

### Decision

Use existing protocol. No new endpoints or NATS subjects needed.

### Flow

1. Chrome extension submits batch → `POST /api/projects/{id}/batches`
2. Batch stored in SQLite with extracted screenshots
3. Task created → `POST /api/tasks` with batch reference
4. TaskRouter selects best agent (by capability + tier)
5. `ClaudeCodeSDKAdapter.send_task()` invoked with prompt containing:
   - Project context (framework, styling, path)
   - Batch actions (structured, typed)
   - Screenshot references
6. SDK agent processes task, streams output
7. Agent output published to NATS: `vex.agent.{agent_id}.status`
8. Task result submitted → `POST /api/tasks/{id}/result`
9. Chrome extension / UI receives result via NATS subscription or polling

### Rationale

All infrastructure exists. The missing pieces are: (a) real SDK calls in the adapter, (b) NATS connected in lifespan, and (c) NATS process reliability in Electron.

---

## R5: NATS Binary Distribution Strategy

### Decision

For the first full run, require `nats-server` to be installed on the developer's PATH. Document the one-liner install. Defer bundling into Electron app resources to a future feature.

### Rationale

- Bundling platform-specific binaries into Electron requires electron-builder asset configuration, platform detection, and extraction logic — significant scope for "first full run"
- NATS install is a single binary download: `curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.x/nats-server-v2.10.x-linux-amd64.tar.gz | tar xz`
- The existing `process-manager.ts` already spawns `nats-server` from PATH
- Bundling can be a follow-up feature with clear value

### Alternatives Considered

- **Bundle in app.asar**: Works but adds ~20MB per platform, requires build pipeline changes
- **Download on first launch**: Better UX but adds network dependency and version management
