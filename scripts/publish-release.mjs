#!/usr/bin/env node
/**
 * publish-release.mjs — build both Vex deliverables and publish them as a
 * single GitHub Release:
 *
 *   - electron-app  -> Vex-<electron-version>-arm64.dmg  (macOS desktop app)
 *   - chrome-extension -> vex-extension-<ext-version>.zip (unpacked, zipped)
 *
 * The release is tagged v<electron-app version> (the desktop app drives the
 * product version); each asset keeps its own component version in its filename.
 * Binaries are too large / not worth committing, so they live on GitHub
 * Releases — users download from the Releases tab, no build required.
 *
 * Usage:
 *   node scripts/publish-release.mjs              # build both, then publish
 *   node scripts/publish-release.mjs --skip-build # publish already-built assets
 *   node scripts/publish-release.mjs --dry-run    # build + list assets, no publish
 *
 * Requires: gh CLI authenticated (`gh auth login`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "electron-app");
const extDir = join(root, "chrome-extension");

const skipBuild = process.argv.includes("--skip-build");
const dryRun = process.argv.includes("--dry-run");

const log = (msg) => console.log(`[publish-release] ${msg}`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

// --- Versions ---
const electronVersion = readJson(join(electronDir, "package.json")).version;
const tag = `v${electronVersion}`;

// --- Build ---
if (!skipBuild) {
  log(`Building desktop app (npm run dist:mac)...`);
  run("npm", ["run", "dist:mac"], electronDir);
  log(`Building chrome extension release (npm run release)...`);
  run("npm", ["run", "release"], extDir);
}

// Chrome version comes from the built manifest (source of truth for the zip).
const extManifest = join(extDir, "dist", "manifest.json");
if (!existsSync(extManifest)) {
  throw new Error(`No built extension manifest at ${extManifest} — build first.`);
}
const extVersion = readJson(extManifest).version;

// --- Collect assets ---
const dmgDir = join(electronDir, "release");
const dmgs = existsSync(dmgDir)
  ? readdirSync(dmgDir).filter((f) => f.endsWith(".dmg")).map((f) => join(dmgDir, f))
  : [];
const extZip = join(extDir, "releases", `vex-extension-${extVersion}.zip`);

const assets = [...dmgs];
if (existsSync(extZip)) assets.push(extZip);

if (dmgs.length === 0) throw new Error(`No .dmg in ${dmgDir} — run without --skip-build.`);
if (!existsSync(extZip)) throw new Error(`No extension zip at ${extZip} — run without --skip-build.`);

log(`Tag: ${tag}`);
log(`Assets:\n  ${assets.map((a) => a.split("/").pop()).join("\n  ")}`);

if (dryRun) {
  log("Dry run — skipping GitHub publish.");
  process.exit(0);
}

// --- Publish ---
const notes = [
  `**Vex ${electronVersion}**`,
  "",
  "| Component | Version | Asset |",
  "|---|---|---|",
  `| Desktop app (macOS arm64) | ${electronVersion} | \`${dmgs[0].split("/").pop()}\` |`,
  `| Chrome extension | ${extVersion} | \`vex-extension-${extVersion}.zip\` |`,
  "",
  "### Install the desktop app",
  "1. Download the `.dmg`, open it, drag **Vex** to **Applications**.",
  "2. First launch: right-click **Vex** → **Open** (unsigned build).",
  "",
  "The app starts NATS + the backend itself — no `dev-setup.sh` needed.",
  "Requires the `claude` CLI installed and authenticated.",
  "",
  "### Install the chrome extension",
  "1. Download and unzip `vex-extension-*.zip`.",
  "2. Open `chrome://extensions`, enable **Developer mode**.",
  "3. **Load unpacked** → select the unzipped folder.",
].join("\n");

let exists = true;
try {
  execFileSync("gh", ["release", "view", tag], { cwd: root, stdio: "ignore" });
} catch {
  exists = false;
}

if (exists) {
  log(`Release ${tag} exists — uploading assets (--clobber)...`);
  run("gh", ["release", "upload", tag, ...assets, "--clobber"], root);
} else {
  log(`Creating release ${tag}...`);
  run("gh", ["release", "create", tag, ...assets, "--title", `Vex ${electronVersion}`, "--notes", notes], root);
}

log(`Done. https://github.com/lukaskellerstein/vex/releases/tag/${tag}`);
