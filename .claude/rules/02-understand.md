---
description: "Step 1: Understand — read code, ask questions, identify gaps before any implementation"
---

# Step 1: Understand

- Read relevant code and identify impacted areas
- Baseline the repo's existing problems: `nvim-tools --json --all` (every
  linter / formatter / type-checker finding, repo-wide) — so pre-existing
  findings are distinguishable from ones you introduce. For performance or
  RAM questions, `lukas-ps --json [name]` measures the actual process tree.
  Both: [`machine-tools.md`](machine-tools.md).
- Symbol questions (where is this defined, what breaks if I change this
  signature) belong to the `LSP` tool, not to grep — it is enabled here and
  arrives deferred: [`lsp.md`](lsp.md).
- Ask clarifying questions if requirements are ambiguous
- Identify gaps in the current design and opportunities for improvement
- Understand the requirement completely before proceeding
- **For bug reports**: reproduce the issue first — drive the running app with the
  Playwright MCP servers (`electron-playwright` on 9222, `extension-playwright`
  on 9333; see [`06-testing.md`](06-testing.md)) or read `/tmp/vex-logs/*.log` —
  to confirm the problem before attempting a fix
