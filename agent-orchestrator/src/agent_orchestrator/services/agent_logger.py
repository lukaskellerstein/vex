"""Agent file logger — writes .jsonl and/or .html logs for agent runs."""

import html
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Default log directory
_DEFAULT_LOG_DIR = Path.home() / ".vex" / "logs"


class AgentFileLogger:
    """Incrementally writes agent run logs to .jsonl and/or .html files.

    Usage:
        log = AgentFileLogger(agent_id, log_dir="/tmp/logs", formats=["jsonl", "html"])
        log.start(profile_name="general", model="claude-opus-4-6", prompt="...")
        log.config(intended_plugins=[...], loaded_plugins=[...], ...)
        log.event("thinking", "Planning the approach...")
        log.event("tool_call", "Read", tool_name="Read", tool_input={...})
        log.event("text", "Here is the result...")
        log.finish(status="completed", cost_usd=0.05, duration_ms=12000)
    """

    def __init__(
        self,
        agent_id: str,
        log_dir: str | Path | None = None,
        formats: list[str] | None = None,
    ) -> None:
        self.agent_id = agent_id
        self.log_dir = Path(log_dir) if log_dir else _DEFAULT_LOG_DIR
        self.formats = formats or ["jsonl"]
        self._jsonl_path: Path | None = None
        self._html_path: Path | None = None
        self._started_at: str = ""
        self._event_count = 0
        self._enabled = bool(self.formats)

        if not self._enabled:
            return

        # Each agent gets its own folder: {log_dir}/{agent_id}/
        agent_dir = self.log_dir / agent_id
        agent_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

        if "jsonl" in self.formats:
            self._jsonl_path = agent_dir / f"{ts}.jsonl"
        if "html" in self.formats:
            self._html_path = agent_dir / f"{ts}.html"

    @property
    def jsonl_path(self) -> Path | None:
        return self._jsonl_path

    @property
    def html_path(self) -> Path | None:
        return self._html_path

    def start(self, profile_name: str, model: str, prompt: str) -> None:
        """Write the log header with agent metadata."""
        if not self._enabled:
            return
        self._started_at = datetime.now(UTC).isoformat()

        if self._jsonl_path:
            _append_jsonl(self._jsonl_path, {
                "type": "start",
                "ts": self._started_at,
                "agent_id": self.agent_id,
                "profile": profile_name,
                "model": model,
                "prompt": prompt[:2000],
            })

        if self._html_path:
            self._html_path.write_text(
                _HTML_HEAD.format(
                    agent_id=html.escape(self.agent_id),
                    profile=html.escape(profile_name),
                    model=html.escape(model),
                    started=html.escape(self._started_at),
                    prompt=html.escape(prompt[:500]),
                ),
                encoding="utf-8",
            )

        logger.info(
            "Agent %s logging to: %s",
            self.agent_id,
            ", ".join(str(p) for p in [self._jsonl_path, self._html_path] if p),
        )

    def config(
        self,
        intended_plugins: list[str],
        loaded_plugins: list,
        loaded_skills: list,
        loaded_agents: list,
        loaded_tools: list,
        loaded_mcp: list,
    ) -> None:
        """Log the config comparison (intended vs loaded)."""
        if not self._enabled:
            return

        if self._jsonl_path:
            _append_jsonl(self._jsonl_path, {
                "type": "config",
                "ts": datetime.now(UTC).isoformat(),
                "intended_plugins": intended_plugins,
                "loaded_plugins": _names(loaded_plugins),
                "loaded_skills": _names(loaded_skills),
                "loaded_agents": _names(loaded_agents),
                "tools_count": len(loaded_tools),
                "loaded_mcp": _names(loaded_mcp),
            })

        if self._html_path:
            _append_html(
                self._html_path,
                _html_config_section(
                    intended_plugins,
                    _names(loaded_plugins),
                    _names(loaded_skills),
                    _names(loaded_agents),
                    len(loaded_tools),
                    _names(loaded_mcp),
                ),
            )

    def event(
        self,
        event_type: str,
        content: str,
        tool_name: str | None = None,
        tool_input: dict | None = None,
    ) -> None:
        """Log a single event (thinking, text, tool_call, tool_result, etc.)."""
        if not self._enabled:
            return
        self._event_count += 1
        ts = datetime.now(UTC).isoformat()

        if self._jsonl_path:
            record: dict = {
                "type": event_type,
                "ts": ts,
                "content": content[:2000],
            }
            if tool_name:
                record["tool_name"] = tool_name
            if tool_input:
                record["tool_input"] = tool_input
            _append_jsonl(self._jsonl_path, record)

        if self._html_path:
            ts_short = datetime.now(UTC).strftime("%H:%M:%S.%f")[:-3]
            _append_html(self._html_path, _html_event(ts_short, event_type, content, tool_name))

    def finish(
        self,
        status: str,
        cost_usd: float | None = None,
        duration_ms: int | None = None,
    ) -> None:
        """Write the log footer with final stats."""
        if not self._enabled:
            return
        finished_at = datetime.now(UTC).isoformat()

        if self._jsonl_path:
            _append_jsonl(self._jsonl_path, {
                "type": "finish",
                "ts": finished_at,
                "status": status,
                "cost_usd": cost_usd,
                "duration_ms": duration_ms,
                "events": self._event_count,
            })

        if self._html_path:
            _append_html(
                self._html_path,
                _html_footer(status, cost_usd, duration_ms, self._event_count, finished_at),
            )

        logger.info(
            "Agent %s log complete: %s, %d events, cost=$%s",
            self.agent_id,
            status,
            self._event_count,
            cost_usd,
        )


# ── Helpers ──────────────────────────────────────────────────────


def _names(items: list) -> list[str]:
    """Extract names from a list of dicts or strings."""
    result = []
    for item in items:
        if isinstance(item, dict):
            result.append(item.get("name", str(item)))
        else:
            result.append(str(item))
    return result


def _append_jsonl(path: Path, record: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")


def _append_html(path: Path, html_str: str) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(html_str)


# ── HTML templates ───────────────────────────────────────────────

_HTML_HEAD = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agent {agent_id} — Run Log</title>
<style>
  :root {{
    --bg: #1e1e2e; --fg: #cdd6f4; --surface: #313244; --overlay: #45475a;
    --blue: #89b4fa; --green: #a6e3a1; --yellow: #f9e2af;
    --magenta: #cba6f7; --red: #f38ba8; --cyan: #94e2d5; --dim: #6c7086;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: var(--bg); color: var(--fg); font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; padding: 24px; line-height: 1.6; }}
  h1 {{ color: var(--blue); font-size: 18px; margin-bottom: 4px; }}
  .meta {{ color: var(--dim); font-size: 12px; margin-bottom: 16px; }}
  .meta span {{ margin-right: 16px; }}
  .config {{ background: var(--surface); border-radius: 8px; padding: 16px; margin-bottom: 20px; }}
  .config h2 {{ color: var(--cyan); font-size: 14px; margin-bottom: 8px; }}
  .config .col {{ display: inline-block; vertical-align: top; min-width: 200px; margin-right: 24px; }}
  .config .label {{ color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }}
  .config li {{ list-style: none; padding: 1px 0; }}
  .events {{ margin-top: 16px; }}
  .ev {{ display: flex; gap: 12px; padding: 4px 8px; border-radius: 4px; }}
  .ev:hover {{ background: var(--surface); }}
  .ev .ts {{ color: var(--dim); min-width: 90px; flex-shrink: 0; }}
  .ev .tag {{ min-width: 90px; flex-shrink: 0; font-weight: bold; }}
  .ev .body {{ white-space: pre-wrap; word-break: break-word; }}
  .tag-thinking {{ color: var(--dim); font-style: italic; }}
  .tag-text {{ color: var(--fg); }}
  .tag-tool_call {{ color: var(--green); }}
  .tag-tool_result {{ color: var(--dim); }}
  .tag-progress {{ color: var(--yellow); }}
  .tag-diff {{ color: var(--cyan); }}
  .tag-error {{ color: var(--red); }}
  .tag-completed {{ color: var(--green); }}
  .footer {{ background: var(--surface); border-radius: 8px; padding: 16px; margin-top: 20px; }}
  .footer h2 {{ color: var(--green); font-size: 14px; margin-bottom: 8px; }}
  .footer.failed h2 {{ color: var(--red); }}
  .footer .stat {{ color: var(--dim); }}
  .prompt {{ background: var(--surface); border-radius: 8px; padding: 12px; margin-bottom: 16px; color: var(--yellow); }}
</style>
</head>
<body>
<h1>Agent Run Log</h1>
<div class="meta">
  <span>ID: {agent_id}</span>
  <span>Profile: {profile}</span>
  <span>Model: {model}</span>
  <span>Started: {started}</span>
</div>
<div class="prompt">{prompt}</div>
<div class="events">
"""


def _html_config_section(
    intended: list[str],
    plugins: list[str],
    skills: list[str],
    agents: list[str],
    tools_count: int,
    mcp: list[str],
) -> str:
    def _li(items: list[str]) -> str:
        if not items:
            return "<li><em>(none)</em></li>"
        return "".join(f"<li>{html.escape(i)}</li>" for i in items)

    return (
        f'<div class="config">\n'
        f'<h2>Configuration</h2>\n'
        f'<div class="col"><div class="label">Intended Plugins</div><ul>{_li(intended)}</ul></div>\n'
        f'<div class="col"><div class="label">Loaded Plugins</div><ul>{_li(plugins)}</ul></div>\n'
        f'<div class="col"><div class="label">Skills</div><ul>{_li(skills)}</ul></div>\n'
        f'<div class="col"><div class="label">Agents</div><ul>{_li(agents)}</ul></div>\n'
        f'<div class="col"><div class="label">MCP Servers</div><ul>{_li(mcp)}</ul></div>\n'
        f'<div class="col"><div class="label">Tools</div><ul><li>{tools_count} tool(s)</li></ul></div>\n'
        f'</div>\n'
    )


def _html_event(
    ts: str, event_type: str, content: str, tool_name: str | None
) -> str:
    tag_label = event_type
    if tool_name:
        tag_label = f"{event_type} ({html.escape(tool_name)})"
    return (
        f'<div class="ev">'
        f'<span class="ts">{html.escape(ts)}</span>'
        f'<span class="tag tag-{html.escape(event_type)}">{html.escape(tag_label)}</span>'
        f'<span class="body">{html.escape(content[:2000])}</span>'
        f'</div>\n'
    )


def _html_footer(
    status: str,
    cost_usd: float | None,
    duration_ms: int | None,
    event_count: int,
    finished_at: str,
) -> str:
    cls = "footer failed" if status != "completed" else "footer"
    return (
        f'</div>\n'
        f'<div class="{cls}">\n'
        f'<h2>Result: {html.escape(status)}</h2>\n'
        f'<div class="stat">Finished: {html.escape(finished_at)}</div>\n'
        f'<div class="stat">Duration: {duration_ms}ms</div>\n'
        f'<div class="stat">Cost: ${cost_usd}</div>\n'
        f'<div class="stat">Events: {event_count}</div>\n'
        f'</div>\n'
        f'</body></html>'
    )
