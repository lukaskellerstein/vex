"""AgentTrace and TraceStep models for agent execution tracing."""

from datetime import datetime

from pydantic import BaseModel


class TraceStep(BaseModel):
    id: str
    sequence_index: int
    type: str
    content: str | None = None
    metadata: dict | None = None
    duration_ms: int | None = None
    token_count: int | None = None
    created_at: datetime


class AgentTrace(BaseModel):
    id: str
    batch_id: str
    agent_id: str | None = None
    agent_name: str
    agent_model: str
    status: str = "running"
    total_duration_ms: int | None = None
    total_cost_usd: float | None = None
    total_tokens: int | None = None
    steps: list[TraceStep] = []
    created_at: datetime
    completed_at: datetime | None = None
