# Agent Orchestrator

FastAPI backend that orchestrates AI coding agents, manages projects, and communicates via NATS.

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) package manager
- NATS server running on port 4222

## Setup

```bash
cd agent-orchestrator
uv sync
```

## Run (development)

```bash
cd agent-orchestrator
source .venv/bin/activate
uvicorn agent_orchestrator.main:app --reload --port 8420
```

`--reload` enables auto-restart on code changes.

## Verify

```bash
curl http://localhost:8420/api/health
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Port | 8420 | HTTP API port |
| NATS URL | nats://localhost:4222 | NATS server connection |
| DB path | ~/.vex/vex.db | SQLite database |

## API routes

- `GET /api/health` — health check
- `GET/POST /api/projects` — project CRUD
- `GET/POST /api/batches` — batch operations
- `GET /api/agents` — agent status
- `GET/PATCH /api/config` — configuration
