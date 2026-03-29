---
description: "Step 5: Testing — define DoD, test with chrome-devtool/K8s, fix and repeat until passing"
---

# Step 5: Testing

**Every code change must be tested before reporting completion. No exceptions.**

## 5a. Define your Definition of Done

Before testing, **write out your DoD checklist in the conversation** so the user can see what you intend to verify. Example:

> **Definition of Done for this task:**
> - [ ] The new button appears on the dashboard page
> - [ ] Clicking the button opens the modal
> - [ ] The modal displays the correct data
> - [ ] Browser closed after testing

## 5b. Test

**UI changes** — use chrome-devtool MCP against the local dev server (`http://localhost:3555`):
1. Run `./ui/scripts/check-dev-server.sh` first. If it fails, STOP and ask the user to start it.
2. Open a chrome-devtool browser, navigate to the relevant page, and verify the change is visible and functional.
3. **Close the browser when done.**

**Backend / service changes** — deploy to K8s, then verify:
1. If the change has UI impact: test via chrome-devtool against the local dev server or production URL.
2. If the change has no UI impact (backtesting, optimization, WFO, etc.): use `svc/test` to run the appropriate comparison/integration test and monitor per the K8s jobs protocol.

**Non-testable changes** (docs, config, IaC only): explicitly state why no runtime test is needed.

## 5c. Fix and repeat

If a test fails: fix the issue, then retest. Repeat until all DoD items pass. If you encounter a problem that you repeatedly cannot resolve, ask the user for help.

## 5d. Always close chrome-devtool browsers when done

## Chrome-devtool Authentication (Deployed Services Only)

Use Bearer token auth when testing deployed production services:

1. Read `CLAUDE_SERVICE_TOKEN` from token file
2. Set auth header BEFORE navigation (via chrome-devtool MCP's `evaluate_script` or equivalent)
3. Navigate to the target URL
4. Close browser when done

Important:
- Token stored in token file (check CLAUDE_TOKEN_EXPIRES)
- If expired, regenerate using curl command in that file
- Never try interactive login — use Bearer token only
- Works for ALL production services (UI, Temporal, Traefik, Flower)

## K8s Jobs Monitoring Protocol

When running `svc/test/scripts/run-compare-test.sh`:

**DO NOT just run the script and set a long timeout!** Jobs often fail within 20-60 seconds.

**MANDATORY Protocol:**
1. Run the script and note the JOB_NAME from output
2. **Every 30 seconds**, check pod status and logs:
   ```bash
   kubectl get pods -n trading-svc | grep backtest-compare
   kubectl logs job/<JOB_NAME> -n trading-svc --tail=30
   ```
3. If pod shows `Error`, `CrashLoopBackOff`, or logs contain exceptions → **STOP and investigate immediately**
4. Do NOT wait for timeout if errors are visible

See `svc/test/README.md` for full monitoring protocol.
