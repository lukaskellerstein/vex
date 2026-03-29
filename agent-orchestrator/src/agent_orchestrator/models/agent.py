from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class AgentStatus(StrEnum):
    REGISTERED = "registered"
    STARTING = "starting"
    RUNNING = "running"
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
    created_at: datetime


class HeartbeatRequest(BaseModel):
    status: str
    metadata: dict | None = None
