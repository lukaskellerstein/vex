#!/usr/bin/env node
/**
 * make-release.mjs — build the extension and stage a versioned, ready-to-load
 * copy under chrome-extension/releases/.
 *
 * Output per version (version read from the built dist/manifest.json):
 *   releases/vex-extension-<version>/      <- unpacked, load directly via
 *                                             chrome://extensions "Load unpacked"
 *   releases/vex-extension-<version>.zip   <- same, zipped for download
 *
 * These artifacts are committed to the repo so users can install without
 * building. Run this whenever you cut a new extension version.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(scriptDir, "..");
const distDir = join(extDir, "dist");
const releasesDir = join(extDir, "releases");

function log(msg) {
  console.log(`[make-release] ${msg}`);
}

log("Building extension (npm run build)...");
execFileSync("npm", ["run", "build"], { cwd: extDir, stdio: "inherit" });

if (!existsSync(join(distDir, "manifest.json"))) {
  throw new Error(`No manifest at ${join(distDir, "manifest.json")} — build failed?`);
}
const version = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8")).version;
if (!version) throw new Error("Could not read version from built manifest.json");

const name = `vex-extension-${version}`;
const outDir = join(releasesDir, name);

mkdirSync(releasesDir, { recursive: true });
rmSync(outDir, { recursive: true, force: true });
cpSync(distDir, outDir, { recursive: true });
log(`Staged unpacked release: releases/${name}/`);

const zipPath = `${outDir}.zip`;
rmSync(zipPath, { force: true });
// -j would flatten; we want the files at the zip root, so zip from inside outDir.
execFileSync("zip", ["-rq", zipPath, "."], { cwd: outDir, stdio: "inherit" });
log(`Staged zip: releases/${name}.zip`);

log(`Done. Commit releases/${name}/ and releases/${name}.zip`);
