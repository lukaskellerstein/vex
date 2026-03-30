"""ActivityEvent model for the activity feed."""

from datetime import datetime

from pydantic import BaseModel


class ActivityEvent(BaseModel):
    id: str
    type: str
    project_id: str | None = None
    project_name: str | None = None
    agent_id: str | None = None
    agent_name: str | None = None
    summary: str
    meta: dict | None = None
    created_at: datetime
