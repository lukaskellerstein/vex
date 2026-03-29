from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class TaskStatus(StrEnum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskCreate(BaseModel):
    project_id: str
    type: str  # "section" | "image"
    prompt: str
    context: dict | None = None


class TaskResult(BaseModel):
    status: str
    result: str | None = None
    error: str | None = None


class Task(BaseModel):
    id: str
    project_id: str
    agent_id: str | None = None
    type: str
    status: TaskStatus = TaskStatus.PENDING
    prompt: str
    context: dict | None = None
    result: str | None = None
    error: str | None = None
    created_at: datetime
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
