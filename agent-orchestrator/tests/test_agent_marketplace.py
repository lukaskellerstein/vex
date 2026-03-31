#!/usr/bin/env python3
"""
Test script: Agent with Marketplace Plugins

Syncs the marketplace defined in config.json, discovers plugins,
runs the "general" agent profile with test prompts, and validates
that the agent correctly discovers and uses marketplace skills/agents.

Validation is done by parsing the JSONL log produced by AgentFileLogger
after each test run.

Usage:
    cd agent-orchestrator
    uv run python tests/test_agent_marketplace.py
"""

import json
import os
import sys
import time
from pathlib import Path

import anyio
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolUseBlock,
)

# Add src to path so we can import our modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from agent_orchestrator.adapters.claude_code_sdk import load_config, get_agent_profile
from agent_orchestrator.services import marketplace as marketplace_service
from agent_orchestrator.services.agent_logger import AgentFileLogger

# ── ANSI colors ──────────────────────────────────────────────────
CYAN = "\033[96m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
MAGENTA = "\033[95m"
RED = "\033[91m"
BLUE = "\033[94m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log(category: str, message: str) -> None:
    """Print a colored log line."""
    colors = {
        "CONFIG": BLUE,
        "MARKET": CYAN,
        "PLUGIN": CYAN,
        "SKILL": YELLOW,
        "AGENT": MAGENTA,
        "TOOL": GREEN,
        "TEXT": DIM,
        "RESULT": GREEN,
        "COST": RED,
        "INIT": BLUE,
        "MCP": BLUE,
        "PASS": GREEN,
        "FAIL": RED,
        "WARN": YELLOW,
        "LOG": BLUE,
    }
    color = colors.get(category, RESET)
    print(f"  {color}[{category}]{RESET} {message}")


def parse_jsonl_log(log_path: Path) -> tuple[list[str], list[str], int, int]:
    """Parse a .jsonl agent log.

    Returns:
        (skill_names, agent_types, tool_call_count, text_block_count)
    """
    skills: list[str] = []
    agents: list[str] = []
    tool_call_count = 0
    text_block_count = 0

    for line in log_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        rtype = record.get("type", "")

        if rtype == "tool_call":
            tool_call_count += 1
            tool_name = record.get("tool_name", "")
            tool_input = record.get("tool_input", {})
            if tool_name == "Skill":
                skills.append(tool_input.get("skill", ""))
            elif tool_name == "Agent":
                agents.append(
                    tool_input.get("subagent_type", "")
                    or tool_input.get("description", "")
                )
        elif rtype == "text":
            text_block_count += 1

    return skills, agents, tool_call_count, text_block_count


async def run_test(
    test_name: str,
    prompt: str,
    profile: dict,
    plugins: list[dict],
    workdir: Path,
    expect_skills: list[str] | None = None,
    expect_agents: list[str] | None = None,
    max_turns: int = 8,
) -> bool:
    """Run a single test case and validate expectations via JSONL log."""
    print(f"\n{BOLD}{'=' * 70}")
    print(f"  TEST: {test_name}")
    print(f"{'=' * 70}{RESET}\n")

    log("CONFIG", f"Model: {profile.get('model', '?')}")
    log("CONFIG", f"Plugins: {len(plugins)}")
    log("CONFIG", f"Prompt: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")

    workdir.mkdir(parents=True, exist_ok=True)

    # Set up file logger (JSONL)
    test_id = workdir.name
    file_logger = AgentFileLogger(
        agent_id=test_id,
        log_dir=workdir / "logs",
        formats=["jsonl"],
    )
    file_logger.start(
        profile_name="general",
        model=profile.get("model", "?"),
        prompt=prompt,
    )

    options = ClaudeAgentOptions(
        model=profile.get("model", "claude-sonnet-4-6"),
        max_turns=max_turns,
        plugins=plugins,
        cwd=str(workdir),
        allowed_tools=profile.get("allowed_tools", []),
        disallowed_tools=profile.get("disallowed_tools", []),
        mcp_servers=profile.get("mcp_servers", {}),
    )

    cost_usd = None
    duration_ms = None
    start_time = time.monotonic()

    try:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)

            async for message in client.receive_response():
                if isinstance(message, SystemMessage):
                    subtype = getattr(message, "subtype", "")
                    data = getattr(message, "data", {})
                    if subtype == "init":
                        file_logger.config(
                            intended_plugins=[p.get("path", "?") for p in plugins],
                            loaded_plugins=data.get("plugins", []),
                            loaded_skills=data.get("skills", []),
                            loaded_agents=data.get("agents", []),
                            loaded_tools=data.get("tools", []),
                            loaded_mcp=data.get("mcp_servers", []),
                        )
                        # Print detailed init info (aligned with JSONL)
                        loaded_plugins = data.get("plugins", [])
                        loaded_skills = data.get("skills", [])
                        loaded_agents = data.get("agents", [])
                        loaded_mcp = data.get("mcp_servers", [])

                        log("INIT", f"Model: {data.get('model', '?')}")
                        log("INIT", f"Tools: {len(data.get('tools', []))}")

                        log("INIT", f"/plugins ({len(loaded_plugins)}):")
                        for p in loaded_plugins:
                            name = p.get("name", "?") if isinstance(p, dict) else str(p)
                            log("PLUGIN", f"  {name}")

                        log("INIT", f"/skills ({len(loaded_skills)}):")
                        for s in loaded_skills:
                            name = s.get("name", s) if isinstance(s, dict) else str(s)
                            log("SKILL", f"  {name}")

                        log("INIT", f"/agents ({len(loaded_agents)}):")
                        for a in loaded_agents:
                            name = a.get("name", a) if isinstance(a, dict) else str(a)
                            log("AGENT", f"  {name}")

                        if loaded_mcp:
                            log("INIT", f"MCP servers ({len(loaded_mcp)}):")
                            for m in loaded_mcp:
                                name = (
                                    m.get("name", "?")
                                    if isinstance(m, dict)
                                    else str(m)
                                )
                                log("MCP", f"  {name}")

                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, ToolUseBlock):
                            input_preview = (
                                json.dumps(block.input)[:500] if block.input else ""
                            )
                            file_logger.event(
                                "tool_call",
                                input_preview,
                                tool_name=block.name,
                                tool_input=block.input,
                            )
                            # Live console output
                            if block.name == "Skill" and block.input:
                                skill = block.input.get("skill", "?")
                                log("SKILL", f">>> {skill}")
                            elif block.name == "Agent" and block.input:
                                atype = block.input.get(
                                    "subagent_type", ""
                                ) or block.input.get("description", "?")
                                log("AGENT", f">>> {atype}")
                            else:
                                log("TOOL", block.name)
                        elif isinstance(block, TextBlock):
                            file_logger.event("text", block.text[:2000])
                            preview = block.text[:200]
                            if len(block.text) > 200:
                                preview += "..."
                            log("TEXT", preview)

                elif isinstance(message, ResultMessage):
                    cost_usd = getattr(message, "total_cost_usd", None)
                    duration_ms = getattr(message, "duration_ms", None)

        file_logger.finish("completed", cost_usd, duration_ms)

    except Exception as e:
        file_logger.finish("failed")
        log("FAIL", f"Agent error: {e}")
        return False

    elapsed = time.monotonic() - start_time

    # ── Parse JSONL log for validation ──
    jsonl_path = file_logger.jsonl_path
    if not jsonl_path or not jsonl_path.exists():
        log("FAIL", "No JSONL log file produced")
        return False

    log("LOG", f"JSONL log: {jsonl_path}")
    skills_found, agents_found, tool_count, text_count = parse_jsonl_log(jsonl_path)

    # ── Results ──
    print(f"\n  {BOLD}Results:{RESET}")
    log("RESULT", f"Duration: {elapsed:.1f}s (SDK: {duration_ms or '?'}ms)")
    if cost_usd:
        log("COST", f"Cost: ${cost_usd:.4f}")
    log("RESULT", f"Tool calls: {tool_count}")
    log("RESULT", f"Skills invoked: {skills_found or 'none'}")
    log("RESULT", f"Agents invoked: {agents_found or 'none'}")

    # ── Validation ──
    print(f"\n  {BOLD}Validation:{RESET}")
    passed = True

    if expect_skills:
        for expected in expect_skills:
            found = any(expected in s for s in skills_found)
            if found:
                log("PASS", f"Expected skill '{expected}' was invoked")
            else:
                log("FAIL", f"Expected skill '{expected}' was NOT invoked")
                log("WARN", f"  Actual skills: {skills_found}")
                passed = False

    if expect_agents:
        for expected in expect_agents:
            found = any(expected in a for a in agents_found)
            if found:
                log("PASS", f"Expected agent '{expected}' was invoked")
            else:
                log("FAIL", f"Expected agent '{expected}' was NOT invoked")
                log("WARN", f"  Actual agents: {agents_found}")
                passed = False

    if tool_count == 0:
        log("FAIL", "No tool calls were made at all")
        passed = False
    else:
        log("PASS", f"Agent made {tool_count} tool call(s)")

    if text_count == 0:
        log("WARN", "No text output from agent")
    else:
        log("PASS", f"Agent produced {text_count} text block(s)")

    return passed


async def main() -> None:
    """Sync marketplace, load config, run test cases."""
    print(f"\n{BOLD}Vex Agent Marketplace Test Suite{RESET}")
    print(f"{'─' * 50}\n")

    # Step 1: Load config
    config_path = Path(__file__).resolve().parents[1] / "config.json"
    log("CONFIG", f"Loading config from {config_path}")
    ao_config = load_config(config_path)

    if not ao_config:
        log("FAIL", "No config loaded. Create agent-orchestrator/config.json first.")
        sys.exit(1)

    log("CONFIG", f"Marketplaces: {list(ao_config.get('marketplaces', {}).keys())}")
    log("CONFIG", f"Agent profiles: {list(ao_config.get('agents', {}).keys())}")

    # Step 1b: Print environment variables available to the agent
    # These are inherited by the SDK subprocess — API keys are needed
    # for MCP servers (ElevenLabs, Gemini, etc.) and the SDK itself.
    _RELEVANT_ENV_VARS = [
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_VERTEX",
        "AWS_REGION",
        "GEMINI_API_KEY",
        "ELEVENLABS_API_KEY",
        "MEDIA_OUTPUT_DIR",
        "HOME",
        "PATH",
    ]
    print(f"\n{BOLD}Environment Variables{RESET}")
    print(f"{'─' * 50}")
    for var in _RELEVANT_ENV_VARS:
        val = os.environ.get(var)
        if val is None:
            log("WARN", f"{var}: (not set)")
        elif "KEY" in var or "SECRET" in var or "TOKEN" in var:
            log(
                "CONFIG",
                f"{var}: {val[:4]}...{val[-4:]}" if len(val) > 8 else f"{var}: ***",
            )
        else:
            log("CONFIG", f"{var}: {val}")

    # Step 2: Sync marketplaces
    print(f"\n{BOLD}Syncing Marketplaces{RESET}")
    print(f"{'─' * 50}")
    marketplace_service.sync_all(ao_config)

    resolved = marketplace_service.get_resolved_plugins()
    for mkt_name, plugins_map in resolved.items():
        log("MARKET", f"'{mkt_name}': {len(plugins_map)} plugin(s)")
        for pname, ppath in plugins_map.items():
            log("PLUGIN", f"  {pname} -> {ppath}")

    # Step 3: Resolve plugins for "general" profile
    profile = get_agent_profile("general")
    plugin_refs = profile.get("plugins", [])
    plugins = marketplace_service.resolve_plugin_refs(plugin_refs)

    log("CONFIG", f"Resolved {len(plugins)} plugin(s) for 'general' profile:")
    for p in plugins:
        log("PLUGIN", f"  {p['path']}")

    if not plugins:
        log("FAIL", "No plugins resolved. Check marketplace sync and config.json.")
        sys.exit(1)

    # Step 4: Run test cases
    output_dir = Path(__file__).resolve().parents[1] / "test_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    test_cases = [
        # # ── dev-tools-plugin skills ─────────────────────────────────
        # {
        #     "name": "Dead code detection → dev-tools-plugin:dead-code skill",
        #     "prompt": (
        #         "Find all unused code in this project — unused imports, dead functions, "
        #         "unreferenced variables. Report what can be safely deleted."
        #     ),
        #     "expect_skills": ["dead-code"],
        #     "expect_agents": None,
        # },
        # {
        #     "name": "Dependency update → dev-tools-plugin:update-dependencies skill",
        #     "prompt": (
        #         "Update all project dependencies to their latest versions. "
        #         "Check for breaking changes and report what was upgraded."
        #     ),
        #     "expect_skills": ["update-dependencies"],
        #     "expect_agents": None,
        # },
        # # ── documentation-plugin skills ─────────────────────────────
        # {
        #     "name": "README generation → documentation-plugin:update-readme skill",
        #     "prompt": (
        #         "Create a professional README.md for this repository. Include badges, "
        #         "installation instructions, usage examples, and a contributing section."
        #     ),
        #     "expect_skills": ["update-readme"],
        #     "expect_agents": None,
        # },
        {
            "name": "PowerPoint → documentation-plugin:pptx skill",
            "prompt": (
                "Create a PowerPoint presentation about microservices architecture. "
                "Include 5 slides covering: intro, benefits, challenges, patterns, "
                "and conclusion."
            ),
            "expect_skills": ["pptx"],
            "expect_agents": None,
        },
        # {
        #     "name": "Word document → documentation-plugin:docx skill",
        #     "prompt": (
        #         "Write a Word document (.docx) — a technical design proposal for "
        #         "migrating from a monolith to microservices. 2-3 pages."
        #     ),
        #     "expect_skills": ["docx"],
        #     "expect_agents": None,
        # },
        # {
        #     "name": "Excel spreadsheet → documentation-plugin:xlsx skill",
        #     "prompt": (
        #         "Create an Excel spreadsheet (.xlsx) with a project budget tracker. "
        #         "Include columns for task, estimated hours, hourly rate, and total cost. "
        #         "Add formulas for totals and some sample data."
        #     ),
        #     "expect_skills": ["xlsx"],
        #     "expect_agents": None,
        # },
        {
            "name": "Chart generation → documentation-plugin:graph-generation skill",
            "prompt": (
                "Generate a bar chart showing monthly revenue for Q1 2026: "
                "Jan $120k, Feb $145k, Mar $190k. Save it as an image file."
            ),
            "expect_skills": ["graph-generation"],
            "expect_agents": None,
        },
        # ── media-plugin skills ─────────────────────────────────────
        {
            "name": "Image generation → media-plugin:image-generation skill",
            "prompt": (
                "Generate an image of a futuristic city skyline at sunset "
                "with flying cars and neon lights. Save it to the current directory."
            ),
            "expect_skills": ["image-generation"],
            "expect_agents": None,
        },
        {
            "name": "Icon library → media-plugin:icon-library skill",
            "prompt": (
                "Find me SVG icons for: settings gear, search magnifying glass, "
                "and a user profile avatar. Use an open-source icon library."
            ),
            "expect_skills": ["icon-library"],
            "expect_agents": None,
        },
        # ── design-plugin skills ────────────────────────────────────
        {
            "name": "Design review → design-plugin:design-review skill",
            "prompt": (
                "Review the design of this project's frontend. Check for common "
                "anti-patterns like poor contrast, inconsistent spacing, generic fonts, "
                "and lack of visual hierarchy. Give me actionable feedback."
            ),
            "expect_skills": ["design-review"],
            "expect_agents": None,
        },
        {
            "name": "Styleguide → design-plugin:styleguide skill",
            "prompt": (
                "Create a comprehensive design styleguide for a SaaS dashboard "
                "targeting enterprise developers. Include color palette, typography, "
                "spacing system, and component styles."
            ),
            "expect_skills": ["styleguide"],
            "expect_agents": None,
        },
        # ── web-design-plugin skills ────────────────────────────────
        {
            "name": "CSS architecture → web-design-plugin:css-architecture skill",
            "prompt": (
                "Set up the CSS architecture for a new React/Vite project using "
                "Tailwind CSS. Configure design tokens, custom properties, and "
                "responsive breakpoints."
            ),
            "expect_skills": ["css-architecture"],
            "expect_agents": None,
        },
        # ── Cross-plugin: agent invocations ─────────────────────────
        {
            "name": "Dead code agent → dead-code-analyzer subagent",
            "prompt": (
                "Analyze the entire codebase for dead code. Find unused functions, "
                "imports, exports, variables, types, and classes. Produce a cleanup "
                "report with confidence levels. Do not delete anything."
            ),
            "expect_skills": None,
            "expect_agents": ["dead-code-analyzer"],
        },
        # ─────────────────────────────────────────────────────────────
        # GENERAL / VAGUE PROMPTS
        #
        # These simulate how a real user would phrase requests without
        # knowing about the plugin system.  The agent must still route
        # to the correct skill/agent based on intent, not keywords.
        # ─────────────────────────────────────────────────────────────
        {
            "name": "[vague] 'clean up the code' → dead-code skill",
            "prompt": (
                "This codebase has grown organically and I'm sure there's stuff "
                "we're not using anymore. Can you go through it and tell me what "
                "can be removed?"
            ),
            "expect_skills": ["dead-code"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'are my packages outdated?' → update-dependencies skill",
            "prompt": (
                "I haven't touched the dependencies in a while. Can you check if "
                "anything is outdated and bring everything up to date?"
            ),
            "expect_skills": ["update-dependencies"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'make the repo look nice on GitHub' → update-readme skill",
            "prompt": (
                "When someone lands on this repo on GitHub it looks empty. "
                "Can you make it look presentable and professional?"
            ),
            "expect_skills": ["update-readme"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'I need slides for Monday' → pptx skill",
            "prompt": (
                "I have a meeting on Monday where I need to present our Q1 "
                "progress to leadership. Can you put together a deck I can use?"
            ),
            "expect_skills": ["pptx"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'write up a proposal' → docx skill",
            "prompt": (
                "We need a written proposal for the new caching layer. Something "
                "I can attach to the ticket and share with the team — a proper "
                "document, not just a markdown file."
            ),
            "expect_skills": ["docx"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'track our sprint budget' → xlsx skill",
            "prompt": (
                "I need a spreadsheet to track how many hours each team member "
                "spent this sprint, their rates, and the total burn. Something "
                "I can open in Excel and share with finance."
            ),
            "expect_skills": ["xlsx"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'visualize the data' → graph-generation skill",
            "prompt": (
                "We have these numbers — signups by month: Jan 320, Feb 410, "
                "Mar 580, Apr 720. I need a visual I can drop into a report."
            ),
            "expect_skills": ["graph-generation"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'make me a hero image' → image-generation skill",
            "prompt": (
                "I'm building a landing page and I need a hero image — something "
                "abstract and techy, dark background, glowing gradients. Can you "
                "create something?"
            ),
            "expect_skills": ["image-generation"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'I need some icons' → icon-library skill",
            "prompt": (
                "I'm putting together a feature list section and I need small "
                "icons for: notifications, security, and performance. SVG would "
                "be ideal."
            ),
            "expect_skills": ["icon-library"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'does our UI look good?' → design-review skill",
            "prompt": (
                "I feel like something is off about our frontend but I can't "
                "put my finger on it. Can you take a look and tell me what's "
                "wrong visually?"
            ),
            "expect_skills": ["design-review"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'define the look and feel' → styleguide skill",
            "prompt": (
                "We're starting a new project — a B2B analytics dashboard. "
                "Before we write any code, I want to nail down the visual "
                "identity: colors, fonts, spacing, the whole thing."
            ),
            "expect_skills": ["styleguide"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'set up our styles properly' → css-architecture skill",
            "prompt": (
                "We just scaffolded a React + Vite app and need to set up "
                "the styling foundation — tokens, responsive breakpoints, "
                "and a sane structure we can build on."
            ),
            "expect_skills": ["css-architecture"],
            "expect_agents": None,
        },
        {
            "name": "[vague] 'what code can I delete?' → dead-code-analyzer agent",
            "prompt": (
                "Before our next release I want to do a hygiene pass. Can you "
                "audit the codebase and give me a report of everything that's "
                "safe to remove? Don't actually change anything."
            ),
            "expect_skills": None,
            "expect_agents": ["dead-code-analyzer"],
        },
    ]

    results: list[tuple[str, bool]] = []
    for i, tc in enumerate(test_cases):
        workdir = output_dir / f"test_{i}"
        passed = await run_test(
            test_name=tc["name"],
            prompt=tc["prompt"],
            profile=profile,
            plugins=plugins,
            workdir=workdir,
            expect_skills=tc.get("expect_skills"),
            expect_agents=tc.get("expect_agents"),
        )
        results.append((tc["name"], passed))

    # ── Summary ──
    print(f"\n\n{BOLD}{'=' * 70}")
    print("  TEST SUMMARY")
    print(f"{'=' * 70}{RESET}\n")

    total = len(results)
    passed_count = sum(1 for _, p in results if p)
    failed_count = total - passed_count

    for name, passed in results:
        status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"  [{status}] {name}")

    print(
        f"\n  {BOLD}Total: {total} | Passed: {passed_count} | Failed: {failed_count}{RESET}"
    )

    if failed_count > 0:
        print(f"\n  {RED}Some tests failed. Check output above for details.{RESET}")
        sys.exit(1)
    else:
        print(f"\n  {GREEN}All tests passed!{RESET}")


if __name__ == "__main__":
    anyio.run(main)
