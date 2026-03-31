"""Vex AgentManager — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_orchestrator.db.database import init_db, close_db
from agent_orchestrator.services import nats_service
from agent_orchestrator.services import batch_processor
from agent_orchestrator.services.agent_manager import AgentManagerService
from agent_orchestrator.adapters.claude_code_sdk import ClaudeCodeSDKAdapter
from agent_orchestrator.api import projects, batches, agents, tasks, config, activity, storage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        await nats_service.connect()
    except Exception as e:
        logger.warning("NATS connection failed on startup (will retry): %s", e)

    # Initialize agent manager and batch processor
    agent_manager = AgentManagerService()
    agent_manager.register_adapter(ClaudeCodeSDKAdapter())
    batch_processor.init(agent_manager)

    yield
    await nats_service.disconnect()
    await close_db()


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
