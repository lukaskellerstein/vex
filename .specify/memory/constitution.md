<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial constitution)
  Modified principles: N/A (first version)
  Added sections:
    - Core Principles (I–VII)
    - Architecture Constraints
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - plan-template.md: ✅ compatible (Constitution Check section present)
    - spec-template.md: ✅ compatible (requirements/scenarios aligned)
    - tasks-template.md: ✅ compatible (phased structure aligned)
  Follow-up TODOs: None
-->

# Vex Constitution

## Core Principles

### I. Four-Component Architecture

Vex MUST maintain exactly four components: Electron App (desktop
shell), AgentManager (Python, REST API + state), NATS (real-time
message bus), and Chrome Extension (visual editor). All inter-component
communication MUST use REST (request/response) or NATS pub/sub
(real-time events). No component may bypass this boundary by directly
importing another component's internals.

### II. Protocol-First, Deployment-Agnostic

The protocol between components (REST endpoints, NATS subjects, data
shapes) MUST be identical across local and k8s deployment modes. Only
the deployment topology changes. New features MUST NOT introduce
protocol divergence between deployment variants.

### III. Chrome Extension as Real Browser

The Chrome Extension MUST run as a standard Manifest V3 extension in
the developer's real Chrome browser — not an embedded browser, not a
WebView, not a simulated environment. This is a core differentiator.
Any feature that would require leaving the developer's real browser
context MUST be rejected or redesigned.

### IV. Structured Actions, Not Raw DOM

Every visual edit in the Chrome Extension MUST be captured as a typed,
structured action (select, insert, editText, delete, duplicate, move,
wrap, resize, styleChange, replaceImage, generateSection, copyStyle).
Raw DOM dumps or unstructured diffs MUST NOT be sent to agents. Each
action MUST include the CSS selector, typed metadata, and screenshots
(before/after where applicable).

### V. Agent-Agnostic Orchestration

AgentManager MUST route tasks to agents based on registered
capabilities, not hardcoded agent identities. The system MUST support
adding new agent types (image generation, linting, testing) without
modifying the Chrome Extension or NATS subject hierarchy. Claude Code
is the current primary agent but MUST NOT be a privileged special case
in the orchestration layer.

### VI. Developer Edit as Sketch

The agent interpretation model treats developer edits as intent
sketches, not literal specifications. Agents MUST analyze the
project's framework, styling system, and component patterns before
applying changes. Agents MUST produce idiomatic source code (proper
components, design tokens, project conventions) — never paste raw HTML
or inline styles when the project uses a different approach.

### VII. Simplicity and YAGNI

Start simple. Do not build for hypothetical future requirements.
Prefer composition over inheritance. Keep functions small (< 20 lines
ideal, < 100 max). Remove dead code immediately. No TODO comments, no
commented-out code, no speculative abstractions. Every piece of
complexity MUST be justified by a current, concrete requirement.

## Architecture Constraints

- **State ownership**: AgentManager owns all persistent state
  (projects, agents, batches, tasks, config). No other component
  may maintain its own persistent state.
- **Storage**: SQLite locally (`~/.vex/vex.db`), PostgreSQL on k8s.
  Binary data (screenshots) stored as files in
  `~/.vex/data/{projectId}/`, referenced by path.
- **NATS WebSocket**: Chrome Extension connects to NATS via the
  native WebSocket listener. No custom WS relay.
- **Batch size limit**: 50MB per batch submission.
- **Generation timeout**: 30 seconds. Extension shows retry/cancel.
- **Port defaults**: AgentManager REST 8420, NATS 4222, NATS WS 4223.
  All configurable via Electron settings.
- **Tech stack**: TypeScript 5.x + React 18+ for Chrome Extension
  (targeting Chrome 116+). Python for AgentManager (FastAPI, uv for
  deps). Electron for desktop shell.

## Development Workflow

All code changes MUST follow the 7-step workflow defined in
`.claude/CLAUDE.md`:

1. **Understand** — Read code, reproduce bugs, identify impact.
2. **Plan** — Create and get approval (skip for trivial changes).
3. **Spec Documentation** — Update spec via `/sync-spec-kit`
   (feature branches only).
4. **Implement** — Write clean code from the start.
5. **Test** — Define DoD, test, fix, repeat. Testing is mandatory
   before reporting completion. No exceptions.
6. **Feature Documentation** — Update via `/docs-feature`
   (feature branches only).
7. **Report** — Summary of what was done, tested, and documented.

Additional workflow rules:
- Do NOT commit via git unless explicitly instructed.
- Do NOT start the UI dev server — the user runs it manually.
- Use Playwright in headless mode for UI testing against
  `http://localhost:3555`.
- Prefer editing existing files over creating new ones.

## Governance

This constitution is the authoritative source for architectural
decisions and development principles in the Vex project. All feature
specifications, implementation plans, and task lists MUST comply.

**Amendment process**:
1. Propose the change with rationale.
2. Document the amendment with version bump.
3. Update dependent templates if principles change.
4. Record the change in the Sync Impact Report.

**Versioning**: Semantic versioning (MAJOR.MINOR.PATCH).
- MAJOR: Principle removed or fundamentally redefined.
- MINOR: New principle or section added, material expansion.
- PATCH: Clarifications, wording, non-semantic refinements.

**Compliance**: All PRs and reviews MUST verify compliance with
these principles. Violations MUST be justified in the plan's
Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-03-30 | **Last Amended**: 2026-03-30
