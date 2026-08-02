"""Task routing — find the best agent for a given task type."""

import json
import logging

from agent_orchestrator.db.database import get_db

logger = logging.getLogger(__name__)


class TaskRouter:
    """Routes tasks to the most appropriate available agent."""

    def __init__(self) -> None:
        # Round-robin index per tier: {tier: last_index}
        self._round_robin: dict[int, int] = {}

    async def route_task(self, task_type: str, project_id: str) -> str | None:
        """Find the best agent for *task_type* within *project_id*.

        Selection logic:
        1. Query agents that are running and assigned to *project_id*
           (or unassigned).
        2. Filter to those whose capabilities include *task_type*.
        3. Prefer lower tier (Tier 1 > Tier 2 > Tier 3).
        4. Within the same tier, use round-robin.

        Returns the agent_id, or None if no capable agent is found.
        """
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT id, tier, capabilities
            FROM agents
            WHERE status = 'running'
              AND (project_id = ? OR project_id IS NULL)
            ORDER BY tier ASC
            """,
            (project_id,),
        )
        rows = await cursor.fetchall()

        # Group capable agents by tier.
        by_tier: dict[int, list[str]] = {}
        for row in rows:
            tier = int(row["tier"])
            try:
                caps = json.loads(row["capabilities"])
            except (json.JSONDecodeError, TypeError):
                caps = []
            if task_type in caps:
                by_tier.setdefault(tier, []).append(row["id"])

        if not by_tier:
            logger.debug(
                "No capable agent found for task_type=%s project_id=%s",
                task_type,
                project_id,
            )
            return None

        # Pick the lowest tier that has capable agents.
        best_tier = min(by_tier)
        candidates = by_tier[best_tier]

        # Round-robin within the tier.
        last_idx = self._round_robin.get(best_tier, -1)
        next_idx = (last_idx + 1) % len(candidates)
        self._round_robin[best_tier] = next_idx

        chosen = candidates[next_idx]
        logger.info(
            "Routed task_type=%s to agent %s (tier %d, index %d/%d)",
            task_type,
            chosen,
            best_tier,
            next_idx,
            len(candidates),
        )
        return chosen
