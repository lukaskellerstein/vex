"""Claude Code SDK adapter (V1 scaffold)."""

import logging
from typing import AsyncIterator

from agent_orchestrator.adapters.base import AgentAdapter, AgentProcess

logger = logging.getLogger(__name__)


class ClaudeCodeSDKAdapter(AgentAdapter):
    """Adapter for Claude Code SDK agents.

    This is a scaffold — real SDK integration will be wired in later.
    """

    name = "claude-code-sdk"
    capabilities = ["code-edit", "file-system", "section-generation"]

    def __init__(self) -> None:
        self._processes: dict[str, AgentProcess] = {}

    async def start(self, project_id: str, project_path: str) -> AgentProcess:
        """Start a stub agent process."""
        import uuid

        agent_id = str(uuid.uuid4())
        process = AgentProcess(agent_id=agent_id, pid=None)
        self._processes[agent_id] = process
        logger.info(
            "Stub: started claude-code-sdk agent %s for project %s at %s",
            agent_id, project_id, project_path,
        )
        return process

    async def stop(self, agent_id: str) -> None:
        """Clean up stored agent info."""
        removed = self._processes.pop(agent_id, None)
        if removed:
            logger.info("Stub: stopped claude-code-sdk agent %s", agent_id)
        else:
            logger.warning("Agent %s not found in processes", agent_id)

    async def send_task(self, agent_id: str, task: dict) -> None:
        """Format and log the task. Real SDK call added later."""
        prompt = (
            f"Project: {task.get('project_id', 'unknown')}\n"
            f"Task type: {task.get('type', 'unknown')}\n"
            f"Prompt: {task.get('prompt', '')}\n"
            f"Context: {task.get('context', '')}"
        )
        logger.info("Stub send_task to agent %s:\n%s", agent_id, prompt)

    async def get_status(self, agent_id: str) -> str:
        """Return 'running' if tracked, 'stopped' otherwise."""
        if agent_id in self._processes:
            return "running"
        return "stopped"

    async def subscribe_logs(self, agent_id: str) -> AsyncIterator[str]:
        """Yield stub log messages."""
        yield f"[stub] Log stream for agent {agent_id} — no real output yet."
