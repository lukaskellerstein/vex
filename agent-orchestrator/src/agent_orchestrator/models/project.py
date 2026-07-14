from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class ProjectStatus(StrEnum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class ProjectCreate(BaseModel):
    path: str
    name: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    dev_command: str | None = None
    dev_port: int | None = None
    package_manager: str | None = None
    styling_approach: str | None = None
    framework: str | None = None
    status: str | None = None
    dev_server_url: str | None = None
    model: str | None = None
    auth_header: str | None = None


class Project(BaseModel):
    id: str
    name: str
    path: str
    framework: str | None = None
    dev_command: str | None = None
    dev_port: int | None = None
    package_manager: str | None = None
    styling_approach: str | None = None
    model: str | None = None
    auth_header: str | None = None
    status: ProjectStatus = ProjectStatus.IDLE
    dev_server_url: str | None = None
    created_at: datetime
    updated_at: datetime
