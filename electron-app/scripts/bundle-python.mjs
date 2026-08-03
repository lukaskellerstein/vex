#!/usr/bin/env node
/**
 * bundle-python.mjs — stage a self-contained Python runtime for packaging.
 *
 * Produces electron-app/python-dist/ containing a relocatable CPython
 * (python-build-standalone, managed via uv) with the agent-orchestrator's
 * dependencies installed. electron-builder ships this tree under
 * Resources/python/ so the packaged app runs the backend without any
 * system Python.
 *
 * The AO is installed for its dependency closure, but at runtime the source
 * tree (Resources/agent-orchestrator/src) shadows it via PYTHONPATH so that
 * config.json resolution (parents[3]/config.json) keeps working.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, globSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PYTHON_VERSION = "3.11";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const electronDir = resolve(scriptDir, "..");
const aoDir = resolve(electronDir, "..", "agent-orchestrator");
const outDir = join(electronDir, "python-dist");

function run(cmd, args, opts = {}) {
  const out = execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });
  return typeof out === "string" ? out.trim() : "";
}

function log(msg) {
  console.log(`[bundle-python] ${msg}`);
}

// --- Locate (installing if needed) a uv-managed standalone CPython ---
log(`Ensuring CPython ${PYTHON_VERSION} is available via uv...`);
run("uv", ["python", "install", PYTHON_VERSION], { stdio: "inherit" });

// uv may report an alias dir (cpython-3.11-…) whose entries symlink into the
// concrete patch-version dir. Resolve the real executable so we copy the
// actual install, not a tree of symlinks pointing back into uv's cache.
const reportedExe = run("uv", ["python", "find", PYTHON_VERSION]);
if (!existsSync(reportedExe)) {
  throw new Error(`uv reported a Python path that does not exist: ${reportedExe}`);
}
const pythonExe = realpathSync(reportedExe);
// Standalone layout: <root>/bin/python3.11 — the relocatable root is two levels up.
const standaloneRoot = dirname(dirname(pythonExe));
log(`Using standalone CPython at: ${standaloneRoot}`);

// --- Copy the standalone interpreter into python-dist/ ---
log(`Staging interpreter into ${outDir}`);
rmSync(outDir, { recursive: true, force: true });
cpSync(standaloneRoot, outDir, { recursive: true, dereference: false });

// Drop the PEP 668 marker so uv/pip will install into the copied tree
// (the original is flagged "externally managed by uv").
for (const marker of globSync(join(outDir, "lib", "python*", "EXTERNALLY-MANAGED"))) {
  rmSync(marker, { force: true });
}

// uv copies the python/python3 aliases as ABSOLUTE symlinks back into its
// cache; only python3.11 is a real binary. Re-point the aliases at the local
// real binary so the bundled interpreter resolves its prefix to python-dist.
for (const alias of ["python", "python3"]) {
  const link = join(outDir, "bin", alias);
  rmSync(link, { force: true });
  symlinkSync("python3.11", link);
}

const bundledPython = join(outDir, "bin", "python3");
if (!existsSync(bundledPython)) {
  throw new Error(`Bundled python not found at ${bundledPython}`);
}
const version = run(bundledPython, ["--version"]);
log(`Bundled interpreter: ${version}`);

// --- Install agent-orchestrator dependencies into the bundled interpreter ---
log("Installing agent-orchestrator dependencies (uv pip install)...");
run("uv", ["pip", "install", "--python", bundledPython, aoDir], { stdio: "inherit" });

log("Done. python-dist/ is ready for packaging.");
