# Releases

Vex ships two deliverables, both published as assets on the same
**[GitHub Release](https://github.com/lukaskellerstein/vex/releases)** — no build
step required to install.

| Component | Asset | Install |
|---|---|---|
| Desktop app (macOS arm64) | `Vex-<version>-arm64.dmg` | Open dmg → drag **Vex** to Applications → first launch right-click **Open** |
| Chrome extension | `vex-extension-<version>.zip` | Unzip → `chrome://extensions` → Developer mode → **Load unpacked** |

Releases are tagged `v<desktop-app version>` (the desktop app drives the product
version); each asset keeps its own component version in its filename. Chrome
blocks side-loading packaged `.crx` files from outside the Web Store, so
"Load unpacked" is the supported install path for the extension.

The desktop app starts NATS and the backend itself — `./dev-setup.sh` is only for
development. Runtime requirement: the **`claude` CLI** must be installed and
authenticated.

## Publishing a new release (maintainer)

Requires the `gh` CLI authenticated (`gh auth login`).

```bash
# From the repo root — builds the dmg + the extension zip, then publishes both
node scripts/publish-release.mjs

node scripts/publish-release.mjs --skip-build   # publish already-built assets
node scripts/publish-release.mjs --dry-run      # build + list assets, no publish
```

Bump `version` in `electron-app/package.json` (and the extension version in
`chrome-extension/manifest.json`) before publishing. The release is tagged from
the desktop app version.

Build artifacts (`electron-app/release/`, `electron-app/python-dist/`,
`chrome-extension/releases/`) are gitignored — they are produced on demand and
uploaded, never committed.
