/**
 * Resolves the user's *real* PATH for spawning child processes.
 *
 * macOS/Linux GUI apps (a packaged Electron app launched from Finder/Dock)
 * inherit a minimal PATH that omits user-local and version-manager bins
 * (nvm, fnm, `n`, asdf, volta, homebrew). Any child we spawn — the bundled
 * backend or a project's dev server (`npm run dev`) — then fails to find
 * `node`/`npm` with ENOENT.
 *
 * We recover the user's actual PATH by asking their login+interactive shell,
 * which is exactly what a terminal would see (and thus runs the same version
 * manager init). A static list of common bin dirs is merged in as a fallback.
 * The result is cached for the app lifetime.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SHELL_TIMEOUT_MS = 5000;
const DELIM = "__VEX_PATH_DELIM__";

let cachedPath: string | null = null;

/**
 * Ask the user's login+interactive shell for its PATH. This runs the user's
 * rc files (where nvm/fnm/`n`/asdf/volta export their PATH), mirroring a real
 * terminal. Returns null on Windows or if the shell call fails/times out.
 */
function resolveLoginShellPath(): string | null {
  if (process.platform === "win32") return null;

  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const out = execFileSync(
      shell,
      ["-ilc", `printf '%s' "${DELIM}$PATH${DELIM}"`],
      { encoding: "utf8", timeout: SHELL_TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] }
    );
    const parts = out.split(DELIM);
    if (parts.length >= 3) {
      const resolved = parts[1].trim();
      return resolved || null;
    }
  } catch {
    // shell missing, non-interactive, or timed out — fall back to static dirs
  }
  return null;
}

/** Common install locations, used to backfill anything the shell didn't surface. */
function commonBinDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, "n", "bin"), // `n` version manager
    path.join(home, ".volta", "bin"), // volta
    path.join(home, ".asdf", "shims"), // asdf
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
}

/**
 * The PATH to hand to spawned children: login-shell PATH first (so the user's
 * default toolchain wins, exactly as in their terminal), then common dirs, then
 * the current process PATH. Deduped, order-preserving. Cached after first call.
 */
export function getEnhancedPath(): string {
  if (cachedPath) return cachedPath;

  const segments: string[] = [];
  const loginPath = resolveLoginShellPath();
  if (loginPath) segments.push(...loginPath.split(path.delimiter));
  segments.push(...commonBinDirs());
  segments.push(...(process.env.PATH ?? "").split(path.delimiter));

  cachedPath = Array.from(new Set(segments.filter(Boolean))).join(path.delimiter);
  return cachedPath;
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a command (e.g. `npm`) to an absolute path by searching the enhanced
 * PATH. Returns null if not found. Spawning the absolute path sidesteps any
 * ambiguity in how the OS resolves a bare command name for a child process.
 */
export function resolveExecutable(command: string): string | null {
  if (command.includes(path.sep)) {
    return isExecutableFile(command) ? command : null;
  }
  const exts = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of getEnhancedPath().split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}
