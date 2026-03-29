---
description: "Step 4: Implement — coding rules, UI dev workflow, backend deployment, service structure"
---

# Step 4: Implement

Write clean code from the start. Follow these rules during implementation:

- Do NOT commit via `git` unless explicitly instructed by the user
- Do NOT start the UI dev server — the user runs it manually
- When creating diagrams or graphs, use `mermaid`
- Write clean code from the start — don't plan to "clean it up later"
- Refactor continuously — improve code structure immediately when you see issues
- Remove dead code — delete unused functions, variables, imports, and commented code
- After writing code: review comments, clean up imports, check for side effects

## UI Development

Use the local Vite dev server with hot reload (`http://localhost:3555`).

Before any UI work:
```bash
./ui/scripts/check-dev-server.sh
```

**If the check fails, STOP and tell the user:**
> "The UI dev server is not running. Please start it with: `cd ui && ./scripts/dev-setup.sh`"

Do NOT run `npm run dev` or `./scripts/dev-setup.sh` yourself.

Key points:
- Hot reload enabled — changes appear instantly
- No Bearer token needed for chrome-devtool — Vite proxy handles API auth
- Connects to deployed backend APIs

## Backend Services Development

Deploy directly to K8s:
```bash
cd svc/<service-name>
./scripts/release.sh    # Build + push + deploy
```

Individual steps if needed:
```bash
./scripts/build.sh      # Build Docker image
./scripts/push.sh       # Push to registry
./scripts/deploy.sh     # Deploy to K8s
```

## Service Deployment Structure

Each service has self-contained deployment:
```
svc/<service>/
├── helm/           # Helm chart
├── scripts/        # build.sh, push.sh, deploy.sh, release.sh
└── DEPLOYMENT.md   # Deployment docs
```

**Versioning**: `{git-sha}-{YYYYMMDD-HHMMSS}` (e.g., `fd0a4c3-20251214-225109`)
