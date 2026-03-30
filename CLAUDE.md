# vex Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-30

## Active Technologies
- TypeScript 5.x (Electron app, Chrome extension), Python 3.11+ (agent-orchestrator) + Electron 30, React 18, FastAPI, uvicorn, nats-py 2.9, claude-agent-sdk 0.1.52+, GSAP (animations), CodeMirror (editor) (003-full-run-with-extension-fixes)
- SQLite (`~/.vex/vex.db`), file-based screenshots (`~/.vex/data/`) (003-full-run-with-extension-fixes)
- TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator) + Electron 30, React 18.3, FastAPI 0.115+, child_process (Node.js built-in) (004-dev-server-github-onboarding)
- SQLite via aiosqlite (`~/.vex/vex.db`), file-based screenshots (`~/.vex/data/`) (004-dev-server-github-onboarding)
- TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator) + React 18.3, React Router v6 (new), Lucide React (new), FastAPI 0.115+, aiosqlite (005-design-ui-overhaul)
- SQLite (`~/.vex/vex.db`) — add 3 new tables (activity_events, agent_traces, trace_steps), extend 2 tables (batches, agents) (005-design-ui-overhaul)

- TypeScript 5.x (Electron app), Python 3.11+ (agent-orchestrator) + Electron 30, React 18, FastAPI, uvicorn, nats-py 2.9, claude-agent-sdk 0.1.52+ (002-first-full-run)

## Project Structure

```text
src/
tests/
```

## Commands

cd src [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] pytest [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] ruff check .

## Code Style

TypeScript 5.x (Electron app), Python 3.11+ (agent-orchestrator): Follow standard conventions

## Recent Changes
- 005-design-ui-overhaul: Added TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator) + React 18.3, React Router v6 (new), Lucide React (new), FastAPI 0.115+, aiosqlite
- 004-dev-server-github-onboarding: Added TypeScript 5.7+ (Electron app), Python 3.11+ (Agent Orchestrator) + Electron 30, React 18.3, FastAPI 0.115+, child_process (Node.js built-in)
- 003-full-run-with-extension-fixes: Added TypeScript 5.x (Electron app, Chrome extension), Python 3.11+ (agent-orchestrator) + Electron 30, React 18, FastAPI, uvicorn, nats-py 2.9, claude-agent-sdk 0.1.52+, GSAP (animations), CodeMirror (editor)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
