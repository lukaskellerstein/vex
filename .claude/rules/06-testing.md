---
description: "Step 5: Testing — define DoD, test with MCP tools against Electron (9222) and Chrome (9333), fix and repeat until passing"
---

# Step 5: Testing

**Every code change must be tested before reporting completion. No exceptions.**

## 5a. Define your Definition of Done

Before testing, **write out your DoD checklist in the conversation** so the user can see what you intend to verify. Example:

> **Definition of Done for this task:**
> - [ ] The new button appears on the project detail page
> - [ ] Clicking the button triggers the expected action
> - [ ] Status bar reflects the correct state

## 5b. MCP Servers & CDP Ports

Two chrome-devtools MCP servers are configured in `.mcp.json`, each targeting a different CDP port:

| MCP Server | CDP Port | Target | Use For |
|---|---|---|---|
| `electron-chrome` | 9222 | Electron app | Electron UI changes (renderer pages, dialogs, IPC-driven UI) |
| `extension-chrome` | 9333 | Chrome browser | Chrome Extension changes (content scripts, popup, extension pages) |

Both servers expose the same tools (`take_snapshot`, `take_screenshot`, `click`, `evaluate_script`, `fill`, `navigate_page`, etc.) — the only difference is which browser they connect to.

**How to choose:**
- Changing Electron renderer code → use `electron-chrome` (prefix: `mcp__electron-chrome__`)
- Changing Chrome Extension code → use `extension-chrome` (prefix: `mcp__extension-chrome__`)
- Changing backend code with UI impact → use whichever MCP matches the affected UI

## 5c. Test

**Electron UI changes** — use `electron-chrome` MCP (CDP port 9222):
1. Ensure `dev-setup.sh` is running.
2. Use `mcp__electron-chrome__*` tools to verify the change is visible and functional.

**Chrome Extension changes** — use `extension-chrome` MCP (CDP port 9333):
1. Ensure `dev-setup.sh` is running (Chrome must be started with `--remote-debugging-port=9333`).
2. Use `mcp__extension-chrome__*` tools to verify the change is visible and functional.

**Agent Orchestrator changes** — test via HTTP:
1. Verify the AO is running: `curl http://localhost:8420/api/health`
2. Test affected endpoints with `curl` or the appropriate MCP (if the change has UI impact).

**NATS / messaging changes** — verify connectivity:
1. Check NATS is running on port 4222.
2. Verify the AO connects to NATS (check AO startup logs for NATS connection message).
3. If the change affects the Chrome extension, test via the extension's NATS WebSocket connection on port 4223.

**Non-testable changes** (docs, config, build scripts): explicitly state why no runtime test is needed.

## 5d. Fix and repeat

If a test fails: fix the issue, then retest. Repeat until all DoD items pass. If you encounter a problem that you repeatedly cannot resolve, ask the user for help.

## 5e. Process log reading

`dev-setup.sh` writes each process's output to log files under `/tmp/vex-logs/`:
- `/tmp/vex-logs/nats.log` — NATS server
- `/tmp/vex-logs/ao.log` — Agent Orchestrator
- `/tmp/vex-logs/electron.log` — Electron app
- `/tmp/vex-logs/chrome.log` — Chrome browser

Use the `Read` tool to inspect these logs when debugging. Logs are truncated on each `dev-setup.sh` restart, so they always reflect the current session.
