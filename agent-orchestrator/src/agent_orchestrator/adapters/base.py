"""Base class for agent adapters."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class AgentProcess:
    """Represents a running agent process."""

    agent_id: str
    pid: int | None = None


class AgentAdapter(ABC):
    """Abstract base class for agent adapters.

    Each adapter knows how to spawn, configure, send tasks to,
    and monitor a specific agent type.
    """

    name: str
    capabilities: list[str]

    @abstractmethod
    async def start(self, project_id: str, project_path: str, agent_id: str | None = None) -> AgentProcess:
        """Start an agent process for the given project."""

    @abstractmethod
    async def stop(self, agent_id: str) -> None:
        """Stop an agent process."""

    @abstractmethod
    async def send_task(self, agent_id: str, task: dict) -> None:
        """Send a task to the agent."""

    async def abort(self, agent_id: str) -> None:
        """Abort a running agent task. Default falls back to stop()."""
        await self.stop(agent_id)

    @abstractmethod
    async def resume(
        self,
        agent_id: str,
        project_id: str,
        project_path: str,
        message: str,
        session_id: str,
    ) -> None:
        """Resume a conversation with a finished agent."""

    @abstractmethod
    async def get_status(self, agent_id: str) -> str:
        """Get the current status of the agent."""

    @abstractmethod
    def subscribe_logs(self, agent_id: str) -> AsyncIterator[str]:
        """Subscribe to live log output from the agent."""
