#!/usr/bin/env python3
"""
Test script to verify plugins/skills/MCP are loaded and usable by SDK agents.

Run: cd agent-orchestrator && uv run python tests/test_agent_plugins.py
"""

import anyio
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ThinkingBlock,
    ResultMessage,
    SystemMessage,
)
from claude_agent_sdk.types import (
    HookInput,
    HookContext,
    HookJSONOutput,
    HookMatcher,
    ToolUseBlock,
    ToolResultBlock,
)
from pathlib import Path


# ── Hook: log every tool call ──
async def log_tool_use(
    input_data: HookInput, tool_use_id: str | None, context: HookContext,
) -> HookJSONOutput:
    tool_name = input_data.get("tool_name", "")
    print(f"  [PreToolUse] {tool_name}")
    return {}


# ── Resolve plugins (same logic as adapter) ──
def resolve_plugins() -> list[dict]:
    cache_root = Path.home() / ".claude" / "plugins" / "cache" / "claude-my-marketplace"
    plugin_names = ["dev-tools-plugin", "documentation-plugin", "infra-plugin", "media-plugin"]
    plugins: list[dict] = []
    for name in plugin_names:
        plugin_dir = cache_root / name
        if not plugin_dir.is_dir():
            print(f"  [MISSING] {name}")
            continue
        versions = sorted((d for d in plugin_dir.iterdir() if d.is_dir()), key=lambda d: d.name)
        if not versions:
            continue
        latest = versions[-1]
        if (latest / ".claude-plugin" / "plugin.json").exists():
            plugins.append({"type": "local", "path": str(latest)})
            print(f"  [OK] {name}/{latest.name}")
    return plugins


async def run_test():
    print("=" * 60)
    print("TEST: Agent plugin/skill/MCP loading")
    print("=" * 60)

    # 1. Resolve plugins
    print("\n1. Resolving plugins:")
    plugins = resolve_plugins()
    print(f"   Total: {len(plugins)} plugins")

    # 2. Build options (mirrors adapter config)
    options = ClaudeAgentOptions(
        model="claude-opus-4-6",
        setting_sources=["user", "project"],
        max_turns=10,
        permission_mode="bypassPermissions",
        cwd="/home/lukas/.vex/projects/todo-app-4",
        allowed_tools=[
            "Agent", "Bash", "Edit", "Glob", "Grep", "Read", "Write",
            "Skill", "ToolSearch", "WebSearch", "WebFetch",
            "mcp__vex-playwright",
        ],
        mcp_servers={
            "vex-playwright": {
                "command": "npx",
                "args": ["@playwright/mcp@latest", "--isolated"],
            },
        },
        plugins=plugins,
        hooks={
            "PreToolUse": [HookMatcher(matcher=".*", hooks=[log_tool_use])],
        },
    )

    print("\n2. Starting agent...")
    async with ClaudeSDKClient(options=options) as client:

        # 3. Check init message for Skill tool presence
        print("\n3. Checking init message...")
        await client.query("hello")
        async for msg in client.receive_response():
            if isinstance(msg, SystemMessage):
                data = getattr(msg, "data", {})
                sub = getattr(msg, "subtype", "")
                if sub == "init":
                    tools = data.get("tools", [])
                    skill_in_tools = "Skill" in tools
                    print(f"   Tools ({len(tools)}): Skill present = {skill_in_tools}")
                    if not skill_in_tools:
                        print(f"   ALL TOOLS: {tools}")
                    skills = data.get("skills", [])
                    print(f"   Skills ({len(skills)}): {skills[:15]}")
            elif isinstance(msg, ResultMessage):
                break

        # 4. Actual task
        BATCH_PROMPT = """Project: /home/lukas/.vex/projects/todo-app-4
Framework: vite
Styling: css

## Task
Add image as background

## Where to apply
**Action**: [insert] at `#root > div:nth-of-type(1) > div:nth-of-type(1)`
**Position**: before relative to `#root > div:nth-of-type(1) > div:nth-of-type(1)`
**Element to create**: `<div>`

## Screenshots
Use the Read tool to view these images for visual reference:
- **Before**: `/home/lukas/.vex/data/44e7b25bdae047d58c78c3a6cb1fa9a8/9caed429d3d7450da8e0ab8c5517d5c1.jpg`
- **After**: `/home/lukas/.vex/data/44e7b25bdae047d58c78c3a6cb1fa9a8/4190755939d441f7bfde096c359dd4a2.jpg`"""

        print("\n4. Task: explicit skill usage request")
        print("-" * 40)
        await client.query(BATCH_PROMPT)
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        print(f"   [text] {block.text[:300]}")
                    elif isinstance(block, ThinkingBlock):
                        print(f"   [think] {block.thinking[:200]}")
                    elif isinstance(block, ToolUseBlock):
                        print(f"   [tool] {block.name} → {str(block.input)[:200]}")
                    elif isinstance(block, ToolResultBlock):
                        content = block.content if isinstance(block.content, str) else str(block.content)[:200]
                        print(f"   [result] {content[:200]}")
            elif isinstance(msg, ResultMessage):
                print(f"\n   Cost: ${msg.total_cost_usd:.4f}" if msg.total_cost_usd else "")
                print(f"   Duration: {msg.duration_ms}ms" if msg.duration_ms else "")
                break

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    anyio.run(run_test)
