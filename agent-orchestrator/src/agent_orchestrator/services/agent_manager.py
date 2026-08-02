"""Agent lifecycle management."""

import logging
from datetime import UTC, datetime

from agent_orchestrator.adapters.base import AgentAdapter
from agent_orchestrator.db.database import get_db
from agent_orchestrator.services import nats_service

logger = logging.getLogger(__name__)

_UNHEALTHY_THRESHOLD_S = 60
_RESTART_THRESHOLD_S = 300


class AgentManagerService:
    """Manages agent lifecycle: start, stop, health checks."""

    def __init__(self) -> None:
        self._adapters: dict[str, AgentAdapter] = {}
        self._running_agents: dict[str, dict] = {}

    def register_adapter(self, adapter: AgentAdapter) -> None:
        """Register an adapter by its name."""
        self._adapters[adapter.name] = adapter
        logger.info("Registered adapter: %s", adapter.name)

    async def start_agent(
        self,
        agent_id: str,
        project_id: str,
        project_path: str,
        adapter_type: str,
        model: str | None = None,
        auth_header: str | None = None,
    ) -> None:
        """Start an agent using the specified adapter."""
        adapter = self._adapters.get(adapter_type)
        if adapter is None:
            raise ValueError(f"No adapter registered for type: {adapter_type}")

        db = await get_db()
        await db.execute(
            "UPDATE agents SET status = ?, project_id = ? WHERE id = ?",
            ("starting", project_id, agent_id),
        )
        await db.commit()
        await self._publish_status(agent_id, "starting")

        try:
            process = await adapter.start(
                project_id,
                project_path,
                agent_id=agent_id,
                model=model,
                auth_header=auth_header,
            )
            now = datetime.now(UTC).isoformat()
            await db.execute(
                "UPDATE agents SET status = ?, pid = ?, last_heartbeat = ? WHERE id = ?",
                ("running", process.pid, now, agent_id),
            )
            await db.commit()

            self._running_agents[agent_id] = {
                "adapter_type": adapter_type,
                "project_id": project_id,
                "project_path": project_path,
                "model": model,
                "auth_header": auth_header,
                "pid": process.pid,
                "last_heartbeat": now,
            }
            await self._publish_status(agent_id, "running")
            logger.info("Started agent %s via %s", agent_id, adapter_type)
        except Exception:
            await db.execute(
                "UPDATE agents SET status = ? WHERE id = ?",
                ("error", agent_id),
            )
            await db.commit()
            await self._publish_status(agent_id, "error")
            raise

    async def stop_agent(self, agent_id: str) -> None:
        """Stop a running agent."""
        info = self._running_agents.get(agent_id)
        if info is None:
            logger.warning("Agent %s not tracked as running", agent_id)
            return

        adapter = self._adapters.get(info["adapter_type"])
        if adapter is None:
            logger.error("Adapter %s not found for agent %s", info["adapter_type"], agent_id)
            return

        db = await get_db()
        await db.execute(
            "UPDATE agents SET status = ? WHERE id = ?",
            ("stopping", agent_id),
        )
        await db.commit()
        await self._publish_status(agent_id, "stopping")

        try:
            await adapter.stop(agent_id)
        except Exception:
            logger.exception("Error stopping agent %s", agent_id)

        await db.execute(
            "UPDATE agents SET status = ?, pid = NULL WHERE id = ?",
            ("stopped", agent_id),
        )
        await db.commit()
        self._running_agents.pop(agent_id, None)
        await self._publish_status(agent_id, "stopped")
        logger.info("Stopped agent %s", agent_id)

    async def check_health(self) -> None:
        """Check heartbeat timestamps for all running agents.

        Marks agents unhealthy if heartbeat is older than 60s.
        Attempts restart if heartbeat is older than 300s.
        """
        now = datetime.now(UTC)
        db = await get_db()

        for agent_id, info in list(self._running_agents.items()):
            heartbeat_str = info.get("last_heartbeat")
            if heartbeat_str is None:
                continue

            heartbeat = datetime.fromisoformat(heartbeat_str)
            if heartbeat.tzinfo is None:
                heartbeat = heartbeat.replace(tzinfo=UTC)
            delta = (now - heartbeat).total_seconds()

            if delta > _RESTART_THRESHOLD_S:
                logger.warning(
                    "Agent %s heartbeat stale for %.0fs, attempting restart",
                    agent_id,
                    delta,
                )
                await db.execute(
                    "UPDATE agents SET status = ? WHERE id = ?",
                    ("error", agent_id),
                )
                await db.commit()
                await self._publish_status(agent_id, "error")

                try:
                    adapter_type = info["adapter_type"]
                    project_id = info["project_id"]
                    project_path = info["project_path"]
                    model = info.get("model")
                    auth_header = info.get("auth_header")
                    self._running_agents.pop(agent_id, None)
                    await self.start_agent(
                        agent_id,
                        project_id,
                        project_path,
                        adapter_type,
                        model=model,
                        auth_header=auth_header,
                    )
                except Exception:
                    logger.exception("Failed to restart agent %s", agent_id)

            elif delta > _UNHEALTHY_THRESHOLD_S:
                logger.warning(
                    "Agent %s heartbeat stale for %.0fs, marking unhealthy",
                    agent_id,
                    delta,
                )
                await db.execute(
                    "UPDATE agents SET status = ? WHERE id = ?",
                    ("error", agent_id),
                )
                await db.commit()
                await self._publish_status(agent_id, "error")

    async def _publish_status(self, agent_id: str, status: str) -> None:
        await nats_service.publish(
            f"vex.agent.{agent_id}.status",
            {"agent_id": agent_id, "status": status},
        )
