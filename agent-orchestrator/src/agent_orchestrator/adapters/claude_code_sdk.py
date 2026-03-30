"""Claude Code SDK adapter — real integration via ClaudeSDKClient."""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import AsyncIterator

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
from claude_agent_sdk.types import (
    AssistantMessage,
    ResultMessage,
    TaskProgressMessage,
    TextBlock,
    ToolUseBlock,
)

from agent_orchestrator.adapters.base import AgentAdapter, AgentProcess
from agent_orchestrator.services import nats_service

logger = logging.getLogger(__name__)


@dataclass
class SDKAgentSession:
    """Runtime state for an active Claude Agent SDK session."""

    agent_id: str
    client: ClaudeSDKClient | None = None
    session_id: str | None = None
    status: str = "idle"  # idle, running, completed, failed
    current_task_id: str | None = None
    project_path: str = ""
    log_buffer: list[str] = field(default_factory=list)


class ClaudeCodeSDKAdapter(AgentAdapter):
    """Adapter for Claude Code SDK agents using ClaudeSDKClient."""

    name = "claude-code-sdk"
    capabilities = ["code-edit", "file-system", "section-generation"]

    def __init__(self) -> None:
        self._sessions: dict[str, SDKAgentSession] = {}

    async def start(self, project_id: str, project_path: str) -> AgentProcess:
        """Create a ClaudeSDKClient session for the given project."""
        agent_id = uuid.uuid4().hex

        options = ClaudeAgentOptions(
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": self._build_system_prompt(project_path),
            },
            model="claude-sonnet-4-5-20250929",
            max_turns=10,
            permission_mode="bypassPermissions",
            allowed_tools=[
                "Agent",
                "AskUserQuestion",
                "Bash",
                "CronCreate",
                "CronDelete",
                "CronList",
                "Edit",
                "EnterPlanMode",
                "EnterWorktree",
                "ExitPlanMode",
                "ExitWorktree",
                "Glob",
                "Grep",
                "ListMcpResourcesTool",
                "NotebookEdit",
                "Read",
                "ReadMcpResourceTool",
                "Skill",
                "TaskCreate",
                "TaskGet",
                "TaskList",
                "TaskOutput",
                "TaskStop",
                "TaskUpdate",
                "ToolSearch",
                "Write",
                "WebSearch",
                "WebFetch",
                "mcp__vex-playwright",
            ],
            disallowed_tools=[
                "Bash(rm -rf /)",
                "Bash(rm -rf ~)",
                "Bash(rm -rf /*)",
                "Bash(rm -rf ~/)",
                "Bash(rm -r -f /)",
                "Bash(rm -r -f ~)",
                "Bash(rm -r -f /*)",
                "Bash(rm -r -f ~/)",
                "Bash(sudo rm -rf /)",
                "Bash(sudo rm -rf ~)",
                "Bash(sudo rm -rf /*)",
                "Bash(sudo rm -rf ~/)",
            ],
            mcp_servers={
                "vex-playwright": {
                    "command": "npx",
                    "args": ["@playwright/mcp@latest", "--isolated"],
                },
            },
            plugins=[
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/dev-tools-plugin/1.1.0"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/documentation-plugin/4.2.0"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/infra-plugin/1.0.0"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/design-plugin/1.1.0"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/media-plugin/1.4.0"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/web-design-plugin/1.5.1"},
                {"type": "local", "path": "~/.claude/plugins/cache/claude-my-marketplace/web-selector-plugin/1.2.0"},
            ],
        )

        client = ClaudeSDKClient(options=options)

        session = SDKAgentSession(
            agent_id=agent_id,
            client=client,
            project_path=project_path,
        )
        self._sessions[agent_id] = session

        logger.info(
            "Started claude-code-sdk agent %s for project %s at %s",
            agent_id, project_id, project_path,
        )
        return AgentProcess(agent_id=agent_id, pid=None)

    async def stop(self, agent_id: str) -> None:
        """Close the SDK client and clean up session state."""
        session = self._sessions.pop(agent_id, None)
        if session:
            if session.client:
                try:
                    await session.client.__aexit__(None, None, None)
                except Exception:
                    pass
            session.status = "idle"
            logger.info("Stopped claude-code-sdk agent %s", agent_id)
        else:
            logger.warning("Agent %s not found in sessions", agent_id)

    async def send_task(self, agent_id: str, task: dict) -> None:
        """Send a task to the SDK agent, stream response, publish progress via NATS."""
        session = self._sessions.get(agent_id)
        if not session or not session.client:
            raise RuntimeError(f"Agent {agent_id} not found or not started")

        task_id = task.get("task_id", uuid.uuid4().hex)
        session.current_task_id = task_id
        session.status = "running"
        session.log_buffer.clear()

        prompt = self._format_prompt(task)

        try:
            await session.client.__aenter__()
            await session.client.query(prompt)

            result_text = ""
            cost_usd = None
            duration_ms = None

            async for message in session.client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            log_line = block.text
                            session.log_buffer.append(log_line)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "text",
                                    "content": log_line[:500],
                                    "timestamp": datetime.now(UTC).isoformat(),
                                },
                            )
                        elif isinstance(block, ToolUseBlock):
                            log_line = f"[tool] {block.name}"
                            session.log_buffer.append(log_line)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "tool_use",
                                    "content": log_line,
                                    "timestamp": datetime.now(UTC).isoformat(),
                                },
                            )

                elif isinstance(message, TaskProgressMessage):
                    log_line = f"[progress] {getattr(message, 'progress', '')}"
                    session.log_buffer.append(log_line)

                elif isinstance(message, ResultMessage):
                    cost_usd = getattr(message, "total_cost_usd", None)
                    duration_ms = getattr(message, "duration_ms", None)
                    result_text = f"Completed in {duration_ms}ms" if duration_ms else "Completed"

            session.status = "completed"

            await nats_service.publish(
                f"vex.task.{task_id}.complete",
                {
                    "task_id": task_id,
                    "agent_id": agent_id,
                    "status": "completed",
                    "result": result_text,
                    "error": None,
                    "cost_usd": cost_usd,
                    "duration_ms": duration_ms,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )

        except Exception as e:
            session.status = "failed"
            error_msg = self._classify_error(e)
            session.log_buffer.append(f"[error] {error_msg}")

            await nats_service.publish(
                f"vex.task.{task_id}.complete",
                {
                    "task_id": task_id,
                    "agent_id": agent_id,
                    "status": "failed",
                    "result": None,
                    "error": error_msg,
                    "cost_usd": None,
                    "duration_ms": None,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
            logger.exception("Task %s failed for agent %s", task_id, agent_id)

        finally:
            session.current_task_id = None

    async def get_status(self, agent_id: str) -> str:
        """Return real session status."""
        session = self._sessions.get(agent_id)
        if not session:
            return "stopped"
        return session.status

    async def subscribe_logs(self, agent_id: str) -> AsyncIterator[str]:
        """Yield real-time log messages from the SDK response stream."""
        session = self._sessions.get(agent_id)
        if not session:
            yield f"[error] Agent {agent_id} not found"
            return

        # Yield buffered logs
        for line in session.log_buffer:
            yield line

        # Stream new logs while task is running
        last_idx = len(session.log_buffer)
        while session.status == "running":
            await asyncio.sleep(0.5)
            new_logs = session.log_buffer[last_idx:]
            for line in new_logs:
                yield line
            last_idx = len(session.log_buffer)

        # Yield any remaining logs
        remaining = session.log_buffer[last_idx:]
        for line in remaining:
            yield line

    def _build_system_prompt(self, project_path: str) -> str:
        """Build a system prompt with project context."""
        return (
            "You are a senior web designer and front-end developer working "
            "inside the Vex visual editor.\n"
            f"Project path: {project_path}\n\n"
            "Your primary focus is **design and functionality** of real web "
            "applications. You translate visual edit actions into production-"
            "quality code that looks polished and works correctly.\n\n"
            "## Design principles\n"
            "- Prioritize visual fidelity: spacing, typography, color, and "
            "layout must match the intended design precisely.\n"
            "- Build responsive, accessible UI that works across viewports.\n"
            "- Use the project's existing design system, component library, "
            "and styling approach — never introduce conflicting patterns.\n"
            "- Prefer semantic HTML, proper ARIA attributes, and keyboard "
            "navigability.\n\n"
            "## Implementation approach\n"
            "- Analyze the project's framework, styling system, and component "
            "patterns before making changes.\n"
            "- Produce proper components, design tokens, and follow project "
            "conventions.\n"
            "- Never paste raw HTML or inline styles when the project uses a "
            "component-based or utility-class approach.\n"
            "- Ensure interactive elements (buttons, forms, modals, "
            "animations) function correctly — not just look correct.\n"
            "- Test visual changes in the browser when tools are available."
        )

    def _format_prompt(self, task: dict) -> str:
        """Convert task dict into a structured prompt for the SDK agent."""
        context = task.get("context", {})
        actions = context.get("actions", [])

        parts = [
            f"Project: {context.get('project_path', 'unknown')}",
            f"Framework: {context.get('framework', 'unknown')}",
            f"Styling: {context.get('styling_approach', 'unknown')}",
            "",
            "## Task",
            task.get("prompt", "Apply the following visual edits:"),
            "",
            "## Actions",
        ]

        for i, action in enumerate(actions, 1):
            action_type = action.get("type", "unknown")
            selector = action.get("selector", "unknown")
            instruction = action.get("instruction", "")
            data = action.get("data", {})
            parts.append(f"{i}. [{action_type}] {selector}")
            if instruction:
                parts.append(f"   Instruction: {instruction}")
            if data:
                parts.append(f"   Data: {json.dumps(data, indent=2)}")

        return "\n".join(parts)

    def _classify_error(self, error: Exception) -> str:
        """Classify SDK errors into actionable messages."""
        msg = str(error).lower()
        if "auth" in msg or "api_key" in msg or "401" in msg:
            return (
                "Authentication failed. Ensure ANTHROPIC_API_KEY is set "
                "or run 'claude login' to authenticate."
            )
        if "timeout" in msg or "timed out" in msg:
            return (
                "Agent task timed out. The task may be too complex. "
                "Try breaking it into smaller batches."
            )
        if "not found" in msg or "ModuleNotFoundError" in msg:
            return (
                "Claude Agent SDK not available. "
                "Install it: cd agent-orchestrator && uv sync"
            )
        return f"Agent error: {error}"
