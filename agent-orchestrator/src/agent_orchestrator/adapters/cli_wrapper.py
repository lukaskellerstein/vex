"""CLI wrapper adapter (Tier 2) — runs any CLI-based coding agent."""

import asyncio
import logging
import shlex
from collections.abc import AsyncIterator

from agent_orchestrator.adapters.base import AgentAdapter, AgentProcess
from agent_orchestrator.utils.ids import generate_agent_id

logger = logging.getLogger(__name__)


class CLIWrapperAdapter(AgentAdapter):
    """Adapter that wraps arbitrary CLI-based coding agents.

    Supports configurable prompt delivery methods and working directory flags
    so it can drive Claude Code CLI, Aider, Cursor CLI, etc.
    """

    name = "cli-wrapper"
    capabilities = ["code-edit", "file-system"]

    def __init__(
        self,
        cli_command: str,
        prompt_method: str = "--prompt",
        workdir_flag: str = "--dir",
    ) -> None:
        self._cli_command = cli_command
        self._prompt_method = prompt_method  # "--prompt" | "--message" | "stdin" | "file"
        self._workdir_flag = workdir_flag  # "--dir" | "--cwd" | "cd"
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._agent_config: dict[str, dict] = {}

    async def start(self, project_id: str, project_path: str) -> AgentProcess:
        agent_id = generate_agent_id()
        self._agent_config[agent_id] = {
            "project_id": project_id,
            "project_path": project_path,
        }
        logger.info(
            "Registered cli-wrapper agent %s (cmd=%s) for project %s at %s",
            agent_id,
            self._cli_command,
            project_id,
            project_path,
        )
        return AgentProcess(agent_id=agent_id, pid=None)

    async def stop(self, agent_id: str) -> None:
        proc = self._processes.pop(agent_id, None)
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except TimeoutError:
                proc.kill()
            logger.info("Killed cli-wrapper agent %s", agent_id)
        self._agent_config.pop(agent_id, None)

    async def send_task(self, agent_id: str, task: dict) -> None:
        config = self._agent_config.get(agent_id)
        if not config:
            raise RuntimeError(f"Agent {agent_id} not registered")

        prompt = self._render_prompt(task)
        project_path = config["project_path"]
        cmd = self._build_command(prompt, project_path)

        logger.info("Executing task for agent %s: %s", agent_id, cmd)

        if self._prompt_method == "stdin":
            proc = await asyncio.create_subprocess_exec(
                *shlex.split(cmd),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            self._processes[agent_id] = proc
            stdout, stderr = await proc.communicate(input=prompt.encode())
        else:
            proc = await asyncio.create_subprocess_exec(
                *shlex.split(cmd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            self._processes[agent_id] = proc
            stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(
                "Agent %s exited with code %d: %s",
                agent_id,
                proc.returncode,
                stderr.decode(errors="replace"),
            )
        else:
            logger.info(
                "Agent %s completed task: %s",
                agent_id,
                stdout.decode(errors="replace")[:500],
            )

    async def get_status(self, agent_id: str) -> str:
        proc = self._processes.get(agent_id)
        if proc is None:
            return "idle" if agent_id in self._agent_config else "stopped"
        if proc.returncode is None:
            return "running"
        return "completed" if proc.returncode == 0 else "failed"

    async def subscribe_logs(self, agent_id: str) -> AsyncIterator[str]:
        proc = self._processes.get(agent_id)
        if proc is None or proc.stdout is None:
            yield f"[cli-wrapper] No active process for agent {agent_id}"
            return

        async for line in proc.stdout:
            yield line.decode(errors="replace").rstrip("\n")

    def _render_prompt(self, task: dict) -> str:
        parts = [
            f"Project: {task.get('project_id', 'unknown')}",
            f"Task type: {task.get('type', 'unknown')}",
            f"Prompt: {task.get('prompt', '')}",
        ]
        ctx = task.get("context")
        if ctx:
            parts.append(f"Context: {ctx}")
        return "\n".join(parts)

    def _build_command(self, prompt: str, project_path: str) -> str:
        parts = [self._cli_command]

        # Working directory
        if self._workdir_flag == "cd":
            parts.insert(0, f"cd {shlex.quote(project_path)} &&")
        else:
            parts.append(f"{self._workdir_flag} {shlex.quote(project_path)}")

        # Prompt delivery (stdin handled separately in send_task)
        if self._prompt_method in ("--prompt", "--message"):
            parts.append(f"{self._prompt_method} {shlex.quote(prompt)}")
        elif self._prompt_method == "file":
            # Caller would write a temp file; for now, fall back to --prompt
            parts.append(f"--prompt {shlex.quote(prompt)}")

        return " ".join(parts)
