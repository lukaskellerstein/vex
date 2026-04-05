from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class AgentStatus(StrEnum):
    CREATED = "created"
    REGISTERED = "registered"
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


class AgentCreate(BaseModel):
    name: str
    type: str
    capabilities: list[str]


class Agent(BaseModel):
    id: str
    name: str
    type: str
    tier: int
    capabilities: list[str]
    status: AgentStatus = AgentStatus.REGISTERED
    pid: int | None = None
    project_id: str | None = None
    last_heartbeat: datetime | None = None
    config: dict | None = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    total_cost_usd: float = 0
    created_at: datetime


class ContinueRequest(BaseModel):
    message: str = Field(..., min_length=1)


class HeartbeatRequest(BaseModel):
    status: str
    metadata: dict | None = None
