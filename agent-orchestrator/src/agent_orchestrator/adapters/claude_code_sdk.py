"""Claude Code SDK adapter — real integration via ClaudeSDKClient."""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import AsyncIterator

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
from claude_agent_sdk.types import (
    AssistantMessage,
    HookContext,
    HookInput,
    HookJSONOutput,
    HookMatcher,
    ResultMessage,
    SystemMessage,
    TaskProgressMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
)

from agent_orchestrator.adapters.base import AgentAdapter, AgentProcess
from agent_orchestrator.services import nats_service
from agent_orchestrator.services import marketplace as marketplace_service
from agent_orchestrator.services.agent_logger import AgentFileLogger

logger = logging.getLogger(__name__)

# ── ANSI colors for terminal output ─────────────────────────────
_CYAN = "\033[96m"
_YELLOW = "\033[93m"
_GREEN = "\033[92m"
_MAGENTA = "\033[95m"
_BLUE = "\033[94m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_RESET = "\033[0m"

# Config loaded once at module level (set by load_config)
_config: dict = {}

CONFIG_PATH = Path(__file__).resolve().parents[3] / "config.json"


def load_config(path: Path | None = None) -> dict:
    """Load agent orchestrator config from JSON file."""
    global _config
    config_path = path or CONFIG_PATH
    if config_path.exists():
        _config = json.loads(config_path.read_text())
        logger.info("Loaded config from %s", config_path)
    else:
        logger.warning("Config file not found at %s, using defaults", config_path)
        _config = {}
    return _config


def get_config() -> dict:
    """Return the loaded config."""
    return _config


def get_agent_profile(profile_name: str = "general") -> dict:
    """Return an agent profile from config, or sensible defaults."""
    agents = _config.get("agents", {})
    profile = agents.get(profile_name)
    if profile:
        return profile
    logger.warning("Agent profile '%s' not found, using defaults", profile_name)
    return {
        "model": "claude-sonnet-4-6",
        "max_turns": None,
        "plugins": [],
        "allowed_tools": [],
        "disallowed_tools": [],
        "mcp_servers": {},
    }


@dataclass
class SDKAgentSession:
    """Runtime state for an active Claude Agent SDK session."""

    agent_id: str
    client: ClaudeSDKClient | None = None
    options: ClaudeAgentOptions | None = None
    session_id: str | None = None
    status: str = "idle"  # idle, running, completed, failed
    current_task_id: str | None = None
    project_path: str = ""
    log_buffer: list[str] = field(default_factory=list)
    steps: list[dict] = field(default_factory=list)
    file_logger: AgentFileLogger | None = None


class ClaudeCodeSDKAdapter(AgentAdapter):
    """Adapter for Claude Code SDK agents using ClaudeSDKClient."""

    name = "claude-code-sdk"
    capabilities = ["code-edit", "file-system", "section-generation"]

    def __init__(self, profile_name: str = "general") -> None:
        self._sessions: dict[str, SDKAgentSession] = {}
        self._profile_name = profile_name

    async def start(
        self, project_id: str, project_path: str, agent_id: str | None = None
    ) -> AgentProcess:
        """Create a ClaudeSDKClient session for the given project."""
        agent_id = agent_id or uuid.uuid4().hex
        profile = get_agent_profile(self._profile_name)

        # Resolve plugins from marketplace
        plugin_refs = profile.get("plugins", [])
        plugins = marketplace_service.resolve_plugin_refs(plugin_refs)

        options = ClaudeAgentOptions(
            model=profile.get("model", "claude-sonnet-4-6"),
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": profile.get("system_prompt", ""),
            },
            cwd=project_path,
            setting_sources=["project"],
            max_turns=profile.get("max_turns"),
            allowed_tools=profile.get("allowed_tools", []),
            disallowed_tools=profile.get("disallowed_tools", []),
            mcp_servers=profile.get("mcp_servers", {}),
            plugins=plugins,
            hooks=self._make_hooks(agent_id),
        )

        client = ClaudeSDKClient(options=options)

        # Set up file logging if configured
        log_dir_raw = profile.get("log_dir")
        log_dir = Path(log_dir_raw).expanduser() if log_dir_raw else None
        log_formats = profile.get("log_formats", [])
        file_logger = None
        if log_formats:
            file_logger = AgentFileLogger(
                agent_id=agent_id,
                log_dir=log_dir,
                formats=log_formats,
            )

        session = SDKAgentSession(
            agent_id=agent_id,
            client=client,
            options=options,
            project_path=project_path,
            file_logger=file_logger,
        )
        self._sessions[agent_id] = session

        logger.info(
            "Started claude-code-sdk agent %s (profile=%s, model=%s, %d plugins) "
            "for project %s at %s",
            agent_id,
            self._profile_name,
            profile.get("model", "?"),
            len(plugins),
            project_id,
            project_path,
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

        # Start file logger
        if session.file_logger:
            profile = get_agent_profile(self._profile_name)
            session.file_logger.start(
                profile_name=self._profile_name,
                model=profile.get("model", "?"),
                prompt=prompt,
            )

        try:
            await session.client.__aenter__()

            # Log intended config (what we asked for)
            intended_plugins = [
                p.get("path", "")
                for p in (session.options.plugins if session.options else [])
            ]
            profile = get_agent_profile(self._profile_name)
            print(
                f"\n{_BOLD}{_BLUE}{'─' * 60}{_RESET}"
                f"\n{_BOLD}{_BLUE}  Agent {agent_id} — Intended Config{_RESET}"
                f"\n{_BLUE}{'─' * 60}{_RESET}"
            )
            print(f"  {_BLUE}[CONFIG]{_RESET} Profile: {self._profile_name}")
            print(f"  {_BLUE}[CONFIG]{_RESET} Model: {profile.get('model', '?')}")
            print(f"  {_BLUE}[CONFIG]{_RESET} Plugins ({len(intended_plugins)}):")
            for p in intended_plugins:
                print(f"    {_CYAN}[PLUGIN]{_RESET} {p}")

            await session.client.query(prompt)

            result_text = ""
            cost_usd = None
            duration_ms = None
            session.steps.clear()

            # Notify subscribers that agent is now running
            await nats_service.publish(
                f"vex.agent.{agent_id}.status",
                {
                    "agent_id": agent_id,
                    "status": "running",
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )

            step_index = 0

            async for message in session.client.receive_response():
                if isinstance(message, SystemMessage):
                    subtype = getattr(message, "subtype", "")
                    data = getattr(message, "data", {})
                    if subtype == "init":
                        await self._log_agent_init(
                            agent_id,
                            data,
                            profile,
                            intended_plugins,
                            session.file_logger,
                        )
                    continue

                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        now_ts = datetime.now(UTC).isoformat()
                        if isinstance(block, ThinkingBlock):
                            log_line = f"[thinking] {block.thinking[:200]}"
                            session.log_buffer.append(log_line)
                            if session.file_logger:
                                session.file_logger.event(
                                    "thinking", block.thinking[:2000]
                                )
                            self._mark_previous_steps_past(session)
                            step_data = {
                                "type": "thinking",
                                "content": block.thinking[:2000],
                                "timestamp": now_ts,
                                "status": "current",
                            }
                            session.steps.append(step_data)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "thinking",
                                    "content": block.thinking[:500],
                                    "timestamp": now_ts,
                                },
                            )
                            await nats_service.publish(
                                f"vex.agent.{agent_id}.step",
                                {"index": step_index, **step_data},
                            )
                            step_index += 1
                        elif isinstance(block, TextBlock):
                            log_line = block.text
                            session.log_buffer.append(log_line)
                            if session.file_logger:
                                session.file_logger.event("text", log_line[:2000])
                            self._mark_previous_steps_past(session)
                            step_data = {
                                "type": "text",
                                "content": log_line[:2000],
                                "timestamp": now_ts,
                                "status": "current",
                            }
                            session.steps.append(step_data)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "text",
                                    "content": log_line[:500],
                                    "timestamp": now_ts,
                                },
                            )
                            await nats_service.publish(
                                f"vex.agent.{agent_id}.step",
                                {"index": step_index, **step_data},
                            )
                            step_index += 1
                        elif isinstance(block, ToolUseBlock):
                            log_line = f"[tool] {block.name}"
                            session.log_buffer.append(log_line)
                            if session.file_logger:
                                input_preview = (
                                    json.dumps(block.input)[:2000]
                                    if block.input
                                    else ""
                                )
                                session.file_logger.event(
                                    "tool_call",
                                    input_preview,
                                    tool_name=block.name,
                                    tool_input=block.input,
                                )
                            self._mark_previous_steps_past(session)
                            input_json = json.dumps(block.input) if block.input else ""
                            step_data = {
                                "type": "tool_call",
                                "content": input_json[:2000],
                                "tool_name": block.name,
                                "tool_input": block.input,
                                "timestamp": now_ts,
                                "status": "current",
                            }
                            session.steps.append(step_data)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "tool_call",
                                    "tool_name": block.name,
                                    "content": log_line,
                                    "timestamp": now_ts,
                                },
                            )
                            await nats_service.publish(
                                f"vex.agent.{agent_id}.step",
                                {
                                    "index": step_index,
                                    "type": "tool_call",
                                    "content": input_json[:2000],
                                    "tool_name": block.name,
                                    "timestamp": now_ts,
                                    "status": "current",
                                },
                            )
                            step_index += 1
                            # Emit diff step for Edit tool calls
                            if block.name == "Edit" and block.input:
                                diff_step = self._emit_diff_step(
                                    session, block.input, now_ts
                                )
                                if diff_step:
                                    await nats_service.publish(
                                        f"vex.agent.{agent_id}.step",
                                        {"index": step_index, **diff_step},
                                    )
                                    step_index += 1
                        elif isinstance(block, ToolResultBlock):
                            content_text = ""
                            if isinstance(block.content, str):
                                content_text = block.content
                            elif isinstance(block.content, list):
                                content_text = " ".join(
                                    item.get("text", "")
                                    for item in block.content
                                    if isinstance(item, dict)
                                )
                            session.log_buffer.append(f"[result] {content_text[:200]}")
                            if session.file_logger:
                                session.file_logger.event(
                                    "tool_result", content_text[:2000]
                                )
                            self._mark_previous_steps_past(session)
                            step_data = {
                                "type": "tool_result",
                                "content": content_text[:2000],
                                "timestamp": now_ts,
                                "status": "current",
                            }
                            session.steps.append(step_data)
                            await nats_service.publish(
                                f"vex.task.{task_id}.progress",
                                {
                                    "task_id": task_id,
                                    "agent_id": agent_id,
                                    "type": "tool_result",
                                    "content": content_text[:500],
                                    "timestamp": now_ts,
                                },
                            )
                            await nats_service.publish(
                                f"vex.agent.{agent_id}.step",
                                {"index": step_index, **step_data},
                            )
                            step_index += 1

                elif isinstance(message, TaskProgressMessage):
                    log_line = f"[progress] {getattr(message, 'progress', '')}"
                    session.log_buffer.append(log_line)
                    if session.file_logger:
                        session.file_logger.event(
                            "progress", getattr(message, "progress", "")
                        )
                    now_ts = datetime.now(UTC).isoformat()
                    self._mark_previous_steps_past(session)
                    step_data = {
                        "type": "progress",
                        "content": getattr(message, "progress", ""),
                        "timestamp": now_ts,
                        "status": "current",
                    }
                    session.steps.append(step_data)
                    await nats_service.publish(
                        f"vex.agent.{agent_id}.step",
                        {"index": step_index, **step_data},
                    )
                    step_index += 1

                elif isinstance(message, ResultMessage):
                    cost_usd = getattr(message, "total_cost_usd", None)
                    duration_ms = getattr(message, "duration_ms", None)
                    result_text = (
                        f"Completed in {duration_ms}ms" if duration_ms else "Completed"
                    )
                    now_ts = datetime.now(UTC).isoformat()
                    self._mark_previous_steps_past(session)
                    step_data = {
                        "type": "completed",
                        "content": result_text,
                        "timestamp": now_ts,
                        "status": "past",
                        "cost_usd": cost_usd,
                        "duration_ms": duration_ms,
                    }
                    session.steps.append(step_data)
                    await nats_service.publish(
                        f"vex.agent.{agent_id}.step",
                        {"index": step_index, **step_data},
                    )
                    step_index += 1

            session.status = "completed"
            if session.file_logger:
                session.file_logger.finish("completed", cost_usd, duration_ms)

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
            await nats_service.publish(
                f"vex.agent.{agent_id}.status",
                {
                    "agent_id": agent_id,
                    "status": "completed",
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )

        except Exception as e:
            session.status = "failed"
            error_msg = self._classify_error(e)
            session.log_buffer.append(f"[error] {error_msg}")
            if session.file_logger:
                session.file_logger.event("error", error_msg)
                session.file_logger.finish("failed")
            now_ts = datetime.now(UTC).isoformat()
            self._mark_previous_steps_past(session)
            session.steps.append(
                {
                    "type": "error",
                    "content": error_msg,
                    "timestamp": now_ts,
                    "status": "past",
                }
            )

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
            await nats_service.publish(
                f"vex.agent.{agent_id}.status",
                {
                    "agent_id": agent_id,
                    "status": "failed",
                    "error": error_msg,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
            logger.exception("Task %s failed for agent %s", task_id, agent_id)

        finally:
            session.current_task_id = None

    @staticmethod
    async def _log_agent_init(
        agent_id: str,
        init_data: dict,
        intended_profile: dict,
        intended_plugins: list[str],
        file_logger: AgentFileLogger | None = None,
    ) -> None:
        """Print colored agent init summary and publish config to NATS."""
        loaded_plugins = init_data.get("plugins", [])
        loaded_skills = init_data.get("skills", [])
        loaded_agents = init_data.get("agents", [])
        loaded_tools = init_data.get("tools", [])
        loaded_mcp = init_data.get("mcp_servers", [])
        loaded_model = init_data.get("model", "?")

        # ── Colored terminal output ──
        print(
            f"\n{_BOLD}{_GREEN}{'─' * 60}{_RESET}"
            f"\n{_BOLD}{_GREEN}  Agent {agent_id} — Loaded (from SDK init){_RESET}"
            f"\n{_GREEN}{'─' * 60}{_RESET}"
        )
        print(f"  {_GREEN}[MODEL]{_RESET}   {loaded_model}")
        print(f"  {_GREEN}[TOOLS]{_RESET}   {len(loaded_tools)} tool(s)")

        # Plugins
        print(f"\n  {_CYAN}{_BOLD}/plugins ({len(loaded_plugins)}){_RESET}")
        if loaded_plugins:
            for p in loaded_plugins:
                name = p.get("name", "?") if isinstance(p, dict) else str(p)
                path = p.get("path", "") if isinstance(p, dict) else ""
                print(
                    f"    {_CYAN}[PLUGIN]{_RESET} {name}"
                    + (f"  {_DIM}{path}{_RESET}" if path else "")
                )
        else:
            print(f"    {_DIM}(none){_RESET}")

        # Skills
        print(f"\n  {_YELLOW}{_BOLD}/skills ({len(loaded_skills)}){_RESET}")
        if loaded_skills:
            for s in loaded_skills:
                name = s.get("name", s) if isinstance(s, dict) else str(s)
                print(f"    {_YELLOW}[SKILL]{_RESET}  {name}")
        else:
            print(f"    {_DIM}(none){_RESET}")

        # Agents
        print(f"\n  {_MAGENTA}{_BOLD}/agents ({len(loaded_agents)}){_RESET}")
        if loaded_agents:
            for a in loaded_agents:
                name = a.get("name", a) if isinstance(a, dict) else str(a)
                print(f"    {_MAGENTA}[AGENT]{_RESET}  {name}")
        else:
            print(f"    {_DIM}(none){_RESET}")

        # MCP servers
        if loaded_mcp:
            print(f"\n  {_BLUE}{_BOLD}MCP Servers ({len(loaded_mcp)}){_RESET}")
            for m in loaded_mcp:
                name = m.get("name", "?") if isinstance(m, dict) else str(m)
                status = m.get("status", "?") if isinstance(m, dict) else ""
                print(
                    f"    {_BLUE}[MCP]{_RESET}    {name}"
                    + (f"  {_DIM}({status}){_RESET}" if status else "")
                )

        print(f"{_GREEN}{'─' * 60}{_RESET}\n")

        # ── File logger: config section ──
        if file_logger:
            file_logger.config(
                intended_plugins=intended_plugins,
                loaded_plugins=loaded_plugins,
                loaded_skills=loaded_skills,
                loaded_agents=loaded_agents,
                loaded_tools=loaded_tools,
                loaded_mcp=loaded_mcp,
            )

        # ── Publish to NATS ──
        await nats_service.publish(
            f"vex.agent.{agent_id}.config",
            {
                "agent_id": agent_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "intended": {
                    "profile": intended_profile.get("model", "?"),
                    "plugins": intended_plugins,
                    "allowed_tools": intended_profile.get("allowed_tools", []),
                    "disallowed_tools": intended_profile.get("disallowed_tools", []),
                    "mcp_servers": list(intended_profile.get("mcp_servers", {}).keys()),
                },
                "loaded": {
                    "model": loaded_model,
                    "plugins": [
                        (p.get("name", "?") if isinstance(p, dict) else str(p))
                        for p in loaded_plugins
                    ],
                    "skills": [
                        (s.get("name", s) if isinstance(s, dict) else str(s))
                        for s in loaded_skills
                    ],
                    "agents": [
                        (a.get("name", a) if isinstance(a, dict) else str(a))
                        for a in loaded_agents
                    ],
                    "tools_count": len(loaded_tools),
                    "mcp_servers": [
                        (m.get("name", "?") if isinstance(m, dict) else str(m))
                        for m in loaded_mcp
                    ],
                },
            },
        )

    @staticmethod
    def _mark_previous_steps_past(session: SDKAgentSession) -> None:
        """Mark all existing steps as 'past'."""
        for step in session.steps:
            if step["status"] == "current":
                step["status"] = "past"

    @staticmethod
    def _emit_diff_step(
        session: SDKAgentSession, tool_input: dict, timestamp: str
    ) -> dict | None:
        """Emit a diff step from an Edit tool call's old_string/new_string."""
        file_path = tool_input.get("file_path", "")
        old_string = tool_input.get("old_string", "")
        new_string = tool_input.get("new_string", "")
        if not old_string and not new_string:
            return None
        lines = [file_path]
        for line in old_string.splitlines():
            lines.append(f"- {line}")
        for line in new_string.splitlines():
            lines.append(f"+ {line}")
        step_data = {
            "type": "diff",
            "content": "\n".join(lines),
            "timestamp": timestamp,
            "status": "current",
        }
        session.steps.append(step_data)
        return step_data

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

    # ── Hook helpers ────────────────────────────────────────────────

    @staticmethod
    def _make_hooks(agent_id: str) -> dict:
        """Build SDK hook dict that publishes lifecycle events to NATS."""

        _ALLOW: HookJSONOutput = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
            }
        }
        _CONTINUE: HookJSONOutput = {"continue_": True}

        async def _on_subagent_start(
            hook_input: HookInput,
            tool_use_id: str | None,
            ctx: HookContext,
        ) -> HookJSONOutput:
            await nats_service.publish(
                f"vex.agent.{agent_id}.hooks",
                {
                    "hook": "SubagentStart",
                    "agent_id": agent_id,
                    "subagent_id": hook_input.get("agent_id", ""),
                    "subagent_type": hook_input.get("agent_type", ""),
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
            return _CONTINUE

        async def _on_subagent_stop(
            hook_input: HookInput,
            tool_use_id: str | None,
            ctx: HookContext,
        ) -> HookJSONOutput:
            await nats_service.publish(
                f"vex.agent.{agent_id}.hooks",
                {
                    "hook": "SubagentStop",
                    "agent_id": agent_id,
                    "subagent_id": hook_input.get("agent_id", ""),
                    "subagent_type": hook_input.get("agent_type", ""),
                    "transcript_path": hook_input.get("agent_transcript_path", ""),
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
            return _CONTINUE

        async def _on_pre_tool_use(
            hook_input: HookInput,
            tool_use_id: str | None,
            ctx: HookContext,
        ) -> HookJSONOutput:
            tool_name = hook_input.get("tool_name", "")
            tool_input = hook_input.get("tool_input", {})

            logger.info("Agent %s PreToolUse: %s", agent_id, tool_name)

            payload: dict = {
                "hook": "PreToolUse",
                "agent_id": agent_id,
                "tool_name": tool_name,
                "timestamp": datetime.now(UTC).isoformat(),
            }
            if hook_input.get("agent_id"):
                payload["subagent_id"] = hook_input["agent_id"]
                payload["subagent_type"] = hook_input.get("agent_type", "")

            if tool_name == "Skill":
                payload["skill_name"] = tool_input.get("skill", "")
                payload["skill_args"] = tool_input.get("args", "")
            elif tool_name == "Agent":
                payload["subagent_description"] = tool_input.get("description", "")
                payload["subagent_prompt"] = tool_input.get("prompt", "")[:500]
                payload["subagent_agent_type"] = tool_input.get("subagent_type", "")
            elif tool_name.startswith("mcp__"):
                payload["mcp_tool"] = tool_name
                logger.info("Agent %s MCP tool call: %s", agent_id, tool_name)

            await nats_service.publish(f"vex.agent.{agent_id}.hooks", payload)
            return _ALLOW

        async def _on_post_tool_use(
            hook_input: HookInput,
            tool_use_id: str | None,
            ctx: HookContext,
        ) -> HookJSONOutput:
            tool_name = hook_input.get("tool_name", "")
            tool_response = hook_input.get("tool_response", "")
            response_str = str(tool_response)[:1000] if tool_response else ""

            logger.info("Agent %s PostToolUse: %s", agent_id, tool_name)

            payload: dict = {
                "hook": "PostToolUse",
                "agent_id": agent_id,
                "tool_name": tool_name,
                "response_preview": response_str,
                "timestamp": datetime.now(UTC).isoformat(),
            }
            if hook_input.get("agent_id"):
                payload["subagent_id"] = hook_input["agent_id"]
                payload["subagent_type"] = hook_input.get("agent_type", "")

            if tool_name == "Skill":
                payload["skill_name"] = hook_input.get("tool_input", {}).get(
                    "skill", ""
                )
            elif tool_name == "Agent":
                payload["subagent_description"] = hook_input.get("tool_input", {}).get(
                    "description", ""
                )

            await nats_service.publish(f"vex.agent.{agent_id}.hooks", payload)
            return _CONTINUE

        return {
            "SubagentStart": [HookMatcher(matcher=".*", hooks=[_on_subagent_start])],
            "SubagentStop": [HookMatcher(matcher=".*", hooks=[_on_subagent_stop])],
            "PreToolUse": [HookMatcher(matcher=".*", hooks=[_on_pre_tool_use])],
            "PostToolUse": [
                HookMatcher(matcher="Skill|Agent|mcp__.*", hooks=[_on_post_tool_use])
            ],
        }

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
