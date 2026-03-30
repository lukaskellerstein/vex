---
description: "Step 5: Testing — define DoD, test with chrome-devtools MCP against Electron app, fix and repeat until passing"
---

# Step 5: Testing

**Every code change must be tested before reporting completion. No exceptions.**

## 5a. Define your Definition of Done

Before testing, **write out your DoD checklist in the conversation** so the user can see what you intend to verify. Example:

> **Definition of Done for this task:**
> - [ ] The new button appears on the project detail page
> - [ ] Clicking the button triggers the expected action
> - [ ] Status bar reflects the correct state

## 5b. Test

**UI changes** — use chrome-devtools MCP against the Electron app (`http://localhost:9222`):
1. Ensure `dev-setup.sh` is running (Electron must be started with `--remote-debugging-port=9222`).
2. Use chrome-devtools MCP tools (take_snapshot, take_screenshot, click, evaluate_script, etc.) to verify the change is visible and functional.

**Agent Orchestrator changes** — test via HTTP:
1. Verify the AO is running: `curl http://localhost:8420/api/health`
2. Test affected endpoints with `curl` or the chrome-devtools MCP (if the change has UI impact).

**NATS / messaging changes** — verify connectivity:
1. Check NATS is running on port 4222.
2. Verify the AO connects to NATS (check AO startup logs for NATS connection message).
3. If the change affects the Chrome extension, test via the extension's NATS WebSocket connection on port 4223.

**Non-testable changes** (docs, config, build scripts): explicitly state why no runtime test is needed.

## 5c. Fix and repeat

If a test fails: fix the issue, then retest. Repeat until all DoD items pass. If you encounter a problem that you repeatedly cannot resolve, ask the user for help.

## 5d. Process log reading

`dev-setup.sh` writes each process's output to log files under `/tmp/vex-logs/`:
- `/tmp/vex-logs/nats.log` — NATS server
- `/tmp/vex-logs/ao.log` — Agent Orchestrator
- `/tmp/vex-logs/electron.log` — Electron app

Use the `Read` tool to inspect these logs when debugging. Logs are truncated on each `dev-setup.sh` restart, so they always reflect the current session.
