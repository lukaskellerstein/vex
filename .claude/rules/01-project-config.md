---
description: Project configuration — URLs, paths, namespaces, credentials
---

# Project Config

- **Project**: FinanceServer — a trading platform with UI dashboard, backend services, and K8s-based infrastructure
- **Server SSH**: `ssh trader@192.168.5.55` (K8s cluster host)
- **Kubectl**: `kubectl XXX` (direnv auto-sets `KUBECONFIG` to the microk8s-trader context when you `cd` into this project — no `--context` flag needed. See `.envrc` in project root.)
- **Domain (production)**: `kellytrade.org` (UI: `https://www.kellytrade.org`, API: `api.kellytrade.org`, wildcard: `*.kellytrade.org`)
- **Local dev URL**: `http://localhost:3555`
- **K8s namespace**: `trading-svc`
- **Cloudflare config**: `/etc/cloudflared/config.yml` on server
- **Token file**: `claude_tokens.md` (contains `CLAUDE_SERVICE_TOKEN` and `CLAUDE_TOKEN_EXPIRES`)
- **UI directory**: `ui/`
