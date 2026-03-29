---
description: "Reference: Technology stack — Python/uv, React, TypeScript, Docker, K8s, Terraform"
---

# Reference: Technology Stack

## Frontend & UI

- Package Manager: `npm`
- Runtime: Node.js
- Framework: React
- UI Components: shadcn-ui, Radix UI primitives
- Charts: d3.js
- Animations: GSAP
- Styling: Tailwind CSS
- Type Safety: TypeScript with strict mode enabled

## Backend

**Python (preferred):**
- **CRITICAL**: Use `uv` exclusively — NEVER use `pip` directly
- Virtual Environment: `uv venv` followed by `source .venv/bin/activate`
- Dependency Management: `uv sync` (not `pip install`)
- **AVOID**: `hatchling.build` in pyproject.toml
- API Framework: FastAPI with Uvicorn
- Type Hints: Use type annotations consistently (Python 3.10+ syntax)

**Node.js** (only when justified):
- Package Manager: `npm`
- API Framework: Express.js
- Bundler: `esbuild`

**Go** (only when justified — performance-critical services, system tools)

## Scripting & Automation

- Default: Python for all scripts
- Avoid: Bash/Shell scripts (unless trivial one-liners), PowerShell

## AI & Machine Learning

- ML/DL: PyTorch (primary), avoid TensorFlow
- Model Hub: Hugging Face
- Agent Development: Claude Agent SDK (preferred), LangChain + LangGraph (alternative)

## Infrastructure & DevOps

- **Containers**: Docker, multi-stage builds, Alpine/distroless for production
- **Orchestration**: Kubernetes (GKE), Helm for templating
- **IaC**: Terraform
- **Networking**: Traefik as ingress/reverse proxy
- **OS**: Linux (Ubuntu LTS preferred)
