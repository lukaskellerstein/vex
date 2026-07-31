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

Two Playwright MCP servers are configured in `.mcp.json`, each attaching to a different CDP endpoint:

| MCP Server | CDP Port | Target | Use For |
|---|---|---|---|
| `electron-playwright` | 9222 | Electron app | Electron UI changes (renderer pages, dialogs, IPC-driven UI) |
| `extension-playwright` | 9333 | Chrome browser | Chrome Extension changes (content scripts, popup, extension pages) |

Both servers expose the same tools — the only difference is which browser they attach to. Common ones:

| Task | Tool |
|---|---|
| Navigate | `browser_navigate` |
| Inspect the page | `browser_snapshot` (accessibility tree) |
| Screenshot | `browser_take_screenshot` |
| Click | `browser_click` |
| Type into a field | `browser_type` / `browser_fill_form` |
| Run JS | `browser_evaluate` |
| Read console | `browser_console_messages` |
| Read network | `browser_network_requests` |

**How to choose:**
- Changing Electron renderer code → use `electron-playwright` (prefix: `mcp__electron-playwright__`)
- Changing Chrome Extension code → use `extension-playwright` (prefix: `mcp__extension-playwright__`)
- Changing backend code with UI impact → use whichever MCP matches the affected UI

Both servers run in **attach mode** (`--cdp-endpoint`): they connect to a browser that `dev-setup.sh` already started and never launch one themselves. If the target port has nothing listening, the server fails to connect — start the dev environment first.

**After restarting the dev environment**, the first MCP call fails with `Target page, context or browser has been closed` — the server is still holding the CDP connection to the browser that just died. It reconnects on its own; simply retry the same call once.

## 5c. Test

**Electron UI changes** — use `electron-playwright` MCP (CDP port 9222):
1. Ensure the dev environment is up — see [Starting it](05-implement.md) in Step 4: run
   `python3 .claude/hooks/dev-env.py status`, then `start` if nothing is running, or ask
   the user first if something already is.
2. Use `mcp__electron-playwright__*` tools to verify the change is visible and functional.

**Chrome Extension changes** — use `extension-playwright` MCP (CDP port 9333):
1. Same check as above. `dev-env.py start` includes `--with-chrome` by default, so 9333 is
   up unless you passed `--no-chrome`.
2. Use `mcp__extension-playwright__*` tools to verify the change is visible and functional.

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
