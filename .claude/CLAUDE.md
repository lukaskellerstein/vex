# WORKFLOW — MANDATORY FOR ANY PROMPT THAT RESULTS IN CODE CHANGES

**If you are going to use the Edit or Write tool, you MUST complete all applicable steps below before reporting completion.** This applies to every type of work: bug fixes, features, refactoring, config changes — no exceptions.

Execute these steps in order. Do NOT skip steps. Each step's detailed procedure
is in the linked `rules/` file — already loaded into context, no need to open it.

1. **Understand** → [`rules/02-understand.md`](rules/02-understand.md) — Read relevant code, ask clarifying questions, identify gaps and opportunities. For bugs: reproduce the issue first.
2. **Plan** → [`rules/03-plan.md`](rules/03-plan.md) — Create a plan, get user approval, iterate if needed *(skip for trivial changes)*
3. **Spec Documentation** → [`rules/04-spec-documentation.md`](rules/04-spec-documentation.md) — Update spec via `/sync-spec-kit` *(skip on `main` branch or trivial changes)*
4. **Implement** → [`rules/05-implement.md`](rules/05-implement.md) — Write the code
5. **Test** → [`rules/06-testing.md`](rules/06-testing.md) — Define DoD checklist, test, fix, repeat until it works
6. **Feature Documentation** → [`rules/07-feature-documentation.md`](rules/07-feature-documentation.md) — Update docs via `/update-feature-docs` *(skip on `main` branch or trivial changes)*
7. **Report** → [`rules/08-report.md`](rules/08-report.md) — Short summary: what was done, what was tested, whether docs were updated

The step numbers above are the workflow order; the `rules/` filenames keep their
own numbering (`02`–`08`), which is why step 4 is `05-implement.md`. Reference
files, outside the flow: [`rules/01-project-config.md`](rules/01-project-config.md),
[`rules/09-code-quality.md`](rules/09-code-quality.md),
[`rules/10-tech-stack.md`](rules/10-tech-stack.md),
[`rules/11-communication.md`](rules/11-communication.md),
[`rules/12-security.md`](rules/12-security.md),
[`rules/machine-tools.md`](rules/machine-tools.md) (the `nvim-tools` and
`lukas-ps` CLIs — pre-approved, read-only).

**NEVER report completion without first testing.** If you write code and stop without verifying it works, you have failed. Testing is YOUR responsibility — the user should never need to ask you to test.

**Trivial changes** (typo, one-line fix, config tweak): skip steps 2, 3, and 6. State what you'll do and proceed.

**On `main` branch**: skip steps 3 and 6 — spec and feature docs are tied to feature branches only.

## Vex at a glance

- **Three components, one repo.** `electron-app/` (Electron 30 + React 18 + Vite 6,
  ships as `vex-desktop`), `chrome-extension/` (Manifest V3, React, `nats.ws`), and
  `agent-orchestrator/` (Python 3.11 + FastAPI + Claude Agent SDK). They talk over
  NATS, not HTTP.
- **Run everything with `./dev-setup.sh`** from the repo root — one foreground
  process per component with prefixed output, `Ctrl+C` stops all of them.
  `--with-chrome` also launches Chrome for extension testing.
- **Ports:** agent-orchestrator `8420`, NATS TCP `4222`, NATS WebSocket `4223`,
  Electron remote debugging `9222`, extension debugging `9333`. The last two are
  what the Playwright MCP servers attach to.
- **State lives outside the repo.** SQLite at `~/.vex/vex.db` (WAL mode) and
  screenshots under `~/.vex/data/{projectId}/`. Deleting or re-cloning the repo does
  not reset it, and a schema change has to cope with a database that already exists.
- **Package managers are not interchangeable.** Python is `uv`, *never* `pip`.
  JavaScript is `npm`. See [`rules/10-tech-stack.md`](rules/10-tech-stack.md).
- **Releasing** bumps `electron-app/package.json` (that version drives the
  `v<version>` tag) plus the `chrome-extension` version, then
  `node scripts/publish-release.mjs`. [`RELEASES.md`](../RELEASES.md) is the source
  of truth.
- **API keys arrive from the environment** — `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
  `ELEVENLABS_API_KEY`, delivered by `~/Projects/.envrc`. There is no `.env` in this
  repo and none should be created with a value in it —
  [`rules/12-security.md`](rules/12-security.md).

Full facts → [`rules/01-project-config.md`](rules/01-project-config.md); stack and
conventions → [`rules/10-tech-stack.md`](rules/10-tech-stack.md).

## Standing authorizations — do NOT ask before doing these

These actions are pre-approved. Run them yourself when the situation calls for it.

### Read-only inspection (always safe)

- Reading any file in this repo, `git status`, `git diff`, `git log`, `git show`.
- `python3 .claude/hooks/dev-env.py status` — what is holding the dev ports and who
  started it.
- `lsof -i :8420 -i :4222 -i :4223 -i :9222 -i :9333`.
- `npm run typecheck` in `chrome-extension/`; `npx tsc --noEmit` in `electron-app/`,
  which has a `tsconfig.json` but no `typecheck` script.
- `uv run pytest` in `agent-orchestrator/`, including a single test or `-k` filter.
- Read-only `SELECT`s against `~/.vex/vex.db` (`sqlite3 ~/.vex/vex.db '.tables'`).

This machine's own `nvim-tools` and `lukas-ps` are pre-approved too, and are
documented once in [`rules/machine-tools.md`](rules/machine-tools.md) — do not
restate them here. What is specific to Vex: `dev-setup.sh` runs five processes at
once, so `lukas-ps --json` is how you find which of them is actually holding the
RAM rather than guessing from `ps`.

### Pre-approved mutations

- Editing and creating files under `electron-app/src/`, `chrome-extension/src/`,
  `agent-orchestrator/src/`, and their test directories.
- `uv sync` / `uv add <pkg>` in `agent-orchestrator/`; `npm install` in
  `electron-app/` or `chrome-extension/`.
- `npm run build` in either JS package.
- `python3 .claude/hooks/dev-env.py start` / `stop` — scoped to this repo's own dev
  environment and its five ports, nothing else.

### Requires confirmation — always ask first

- `node scripts/publish-release.mjs`, and any version bump in
  `electron-app/package.json` or the extension manifest — these publish to users.
- `python3 .claude/hooks/dev-env.py start --force`. Without `--force` it refuses a
  busy port on purpose; with it, it evicts whatever is there, which may be another
  agent's session or the user's own.
- Anything that deletes, migrates or rewrites `~/.vex/vex.db` or `~/.vex/data/`.
  That is real user state, it is outside this repo, and there is no backup.
- Adding anything to `electron-app/bin/` — those are the vendored multi-platform
  `nats-server` binaries and each one is ~15 MB of permanent git history.
- `git push`, `git push --force`, branch deletes — **never commit unless the user
  explicitly asks**.
- Anything touching secrets, TLS material, tokens, or credential files. A secret
  never enters this repo in plaintext; if one must be versioned at all it is
  SOPS+age — [`rules/12-security.md`](rules/12-security.md).

When in doubt: ask. Vex drives a real browser and writes real code into the user's
own project directories, `~/.vex/vex.db` is live state that outlives any clone of
this repo, and a published release goes straight to installed desktop apps.
