"""Vex AgentManager — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

# Configure application-level logging (uvicorn only configures its own loggers)
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_orchestrator.db.database import init_db, close_db, get_db
from agent_orchestrator.services import nats_service
from agent_orchestrator.services import batch_processor
from agent_orchestrator.services import marketplace as marketplace_service
from agent_orchestrator.services.agent_manager import AgentManagerService
from agent_orchestrator.adapters.claude_code_sdk import ClaudeCodeSDKAdapter, load_config
from agent_orchestrator.api import projects, batches, agents, tasks, config, activity, storage

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
    """Mark agents/batches/tasks that were left in active states as failed on startup."""
    db = await get_db()

    orphaned_agents = await db.execute(
        "UPDATE agents SET status = 'stopped' WHERE status IN ('running', 'starting', 'stopping', 'created')"
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
            "Cleaned up orphaned records on startup: %d agents, %d batches, %d tasks",
            *counts,
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
