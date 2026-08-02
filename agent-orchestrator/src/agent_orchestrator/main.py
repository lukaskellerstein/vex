"""Vex AgentManager — FastAPI application entry point."""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

# Configure application-level logging (uvicorn only configures its own loggers)
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_orchestrator.adapters.claude_code_sdk import ClaudeCodeSDKAdapter, load_config
from agent_orchestrator.api import (
    activity,
    agents,
    batches,
    config,
    models,
    projects,
    storage,
    tasks,
)
from agent_orchestrator.db.database import close_db, get_db, init_db
from agent_orchestrator.services import batch_processor, nats_service
from agent_orchestrator.services import marketplace as marketplace_service
from agent_orchestrator.services.agent_manager import AgentManagerService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        await nats_service.connect()
    except Exception as e:
        logger.warning("NATS connection failed on startup (will retry): %s", e)

    # Load config and sync marketplaces
    ao_config = load_config()
    try:
        marketplace_service.sync_all(ao_config)
    except Exception as e:
        logger.warning("Marketplace sync failed on startup (will continue): %s", e)

    # Initialize agent manager and batch processor
    agent_manager = AgentManagerService()
    agent_manager.register_adapter(ClaudeCodeSDKAdapter())
    batch_processor.init(agent_manager)

    # Clean up orphaned records from previous runs
    await _cleanup_orphaned_records()

    yield
    await nats_service.disconnect()
    await close_db()


async def _cleanup_orphaned_records() -> None:
    """Mark agents/batches/tasks that were left in active states as failed on startup.

    Also creates synthetic traces for orphaned agents so the UI can always display
    agent details instead of showing a broken/empty state.
    """
    db = await get_db()

    # Find orphaned agents that have no trace before updating their status
    cursor = await db.execute(
        """SELECT a.id, a.name, t.batch_id, p.model FROM agents a
           LEFT JOIN tasks t ON t.agent_id = a.id
           LEFT JOIN agent_traces at ON at.agent_id = a.id
           LEFT JOIN projects p ON p.id = a.project_id
           WHERE a.status IN ('running', 'starting', 'stopping', 'created', 'registered')
             AND at.id IS NULL"""
    )
    orphaned_rows = await cursor.fetchall()

    # Create synthetic traces for orphaned agents
    now = datetime.now(UTC).isoformat()
    for row in orphaned_rows:
        trace_id = uuid.uuid4().hex
        await db.execute(
            """INSERT INTO agent_traces (id, batch_id, agent_id, agent_name, agent_model, status,
               total_duration_ms, total_cost_usd, total_tokens, created_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trace_id,
                row["batch_id"],
                row["id"],
                row["name"],
                row["model"] or "default",
                "failed",
                None,
                None,
                0,
                now,
                now,
            ),
        )
        step_id = uuid.uuid4().hex
        await db.execute(
            """INSERT INTO trace_steps (id, trace_id, sequence_index, type, content, metadata,
               duration_ms, token_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                step_id,
                trace_id,
                0,
                "error",
                "Agent interrupted by server restart. No execution trace is available.",
                None,
                None,
                None,
                now,
            ),
        )

    orphaned_agents = await db.execute(
        "UPDATE agents SET status = 'stopped' WHERE status IN ('running', 'starting', 'stopping', 'created', 'registered')"
    )
    orphaned_batches = await db.execute(
        "UPDATE batches SET status = 'failed', error_message = 'Interrupted (server restart)' "
        "WHERE status IN ('pending', 'processing')"
    )
    orphaned_tasks = await db.execute(
        "UPDATE tasks SET status = 'failed', error = 'Interrupted (server restart)' "
        "WHERE status IN ('pending', 'assigned', 'in_progress')"
    )
    await db.commit()

    counts = (orphaned_agents.rowcount, orphaned_batches.rowcount, orphaned_tasks.rowcount)
    if any(c > 0 for c in counts):
        logger.info(
            "Cleaned up orphaned records on startup: %d agents (%d traces created), %d batches, %d tasks",
            counts[0],
            len(orphaned_rows),
            counts[1],
            counts[2],
        )


app = FastAPI(
    title="Vex AgentManager",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api")
app.include_router(batches.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(storage.router, prefix="/api")
app.include_router(models.router, prefix="/api")
