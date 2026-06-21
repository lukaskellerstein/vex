---
description: Project configuration — URLs, paths, namespaces, credentials
---

# Project Config

- **Project**: Vex — Visual editing in the browser. AI-powered code changes in your codebase.
- **Run**: `<PROJECT_ROOT>/.dev-setup.sh`
- **Release**: bump `electron-app/package.json` version (drives the `v<version>` tag) + the `chrome-extension` version, then `node scripts/publish-release.mjs`. Full process in [`RELEASES.md`](../../RELEASES.md) (source of truth).
