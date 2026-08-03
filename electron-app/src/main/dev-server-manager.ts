/**
 * Dev-server process management for user projects.
 *
 * Electron owns the full dev server lifecycle:
 * - Start: spawns a child process in its own process group (detached)
 * - Stop: kills the process group via SIGTERM
 * - Logs: buffered in-memory (up to 2000 lines)
 * - On Electron close: all spawned servers are killed
 * - On abnormal exit (crash / force-quit): servers are orphaned, then adopted
 *   on the next launch via a persisted PID file (`~/.vex/dev-servers.json`) so
 *   the user can still stop them.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { getEnhancedPath, resolveExecutable } from "./system-path.js";

const MAX_LOG_LINES = 2000;

const PERSIST_FILE = path.join(os.homedir(), ".vex", "dev-servers.json");

const PORT_IN_USE_PATTERNS = [
  "EADDRINUSE",
  "port is already in use",
  "address already in use",
  "Port is already in use",
];

// Dev servers colour their output; strip SGR codes before matching against it.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC control character is the entire purpose
const ANSI_SGR_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(line: string): string {
  return line.replace(ANSI_SGR_PATTERN, "");
}

interface DevServer {
  process: ChildProcess | null; // null for recovered orphans (no live handle)
  pid: number | null; // child.pid (fresh) or persisted pid (recovered)
  logLines: string[];
  url: string | null;
  portError: string | null;
  recovered: boolean; // true => adopted from a previous session
  port: number | null; // for the port-listening guard
  cwd: string; // for the ps command-match guard
  command: string; // e.g. "npm run dev"
  startedAt: number; // epoch ms
}

/** Subset of DevServer persisted to disk so orphans survive an Electron restart. */
interface PersistedServer {
  pid: number | null;
  port: number | null;
  url: string | null;
  cwd: string;
  command: string;
  startedAt: number;
}

export interface ProjectInfo {
  id: string;
  path: string;
  dev_command?: string;
  dev_port?: number;
  package_manager?: string;
  framework?: string;
}

type StatusUpdater = (projectId: string, status: string, url?: string | null) => Promise<void>;

export class DevServerManager {
  private servers = new Map<string, DevServer>();
  private updateProjectStatus: StatusUpdater;

  constructor(updateProjectStatus: StatusUpdater) {
    this.updateProjectStatus = updateProjectStatus;
  }

  async start(project: ProjectInfo): Promise<{ status: string; detail?: string }> {
    if (this.servers.has(project.id)) {
      const existing = this.servers.get(project.id)!;
      return { status: "already_running", detail: existing.url ?? undefined };
    }

    const cmd = this.buildRunCommand(project);
    if (!cmd) {
      await this.updateProjectStatus(project.id, "error");
      return { status: "error", detail: "Cannot determine dev command" };
    }

    const { exe, args, env: extraEnv } = cmd;
    await this.updateProjectStatus(project.id, "starting");

    let child: ChildProcess;
    try {
      child = spawn(exe, args, {
        cwd: project.path,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          ...extraEnv,
        },
      });
    } catch (err: unknown) {
      await this.updateProjectStatus(project.id, "error");
      return { status: "error", detail: String(err) };
    }

    const server: DevServer = {
      process: child,
      pid: child.pid ?? null,
      logLines: [],
      url: null,
      portError: null,
      recovered: false,
      port: project.dev_port ?? null,
      cwd: project.path,
      command: `${exe} ${args.join(" ")}`,
      startedAt: Date.now(),
    };
    this.servers.set(project.id, server);
    this.persist();

    this.appendLog(
      server,
      `[system] Started: ${exe} ${args.join(" ")} (pid ${child.pid}) in ${project.path}`,
    );

    const handleLine = (line: string, prefix: string) => {
      if (!line) return;
      this.appendLog(server, `${prefix} ${line}`);

      if (!server.url) {
        const detected = this.detectUrl(line);
        if (detected) {
          server.url = detected;
          // Runtime URL is the source of truth — override any seeded guess.
          const detectedPort = this.parsePort(detected);
          if (detectedPort != null) server.port = detectedPort;
          this.updateProjectStatus(project.id, "running", detected);
          this.persist();
        }
      }

      if (!server.portError) {
        const portErr = this.detectPortConflict(line, project.dev_port ?? 3000);
        if (portErr) {
          server.portError = portErr;
        }
      }
    };

    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        handleLine(line, "[out]");
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        handleLine(line, "[err]");
      }
    });

    child.on("exit", (code) => {
      this.appendLog(server, `[system] Process exited with code ${code}`);
      const portError = server.portError;
      if (this.servers.has(project.id)) {
        this.servers.delete(project.id);
        this.persist();
        if (portError) {
          this.updateProjectStatus(project.id, "error");
        } else {
          this.updateProjectStatus(project.id, "idle");
        }
      }
    });

    return { status: "starting" };
  }

  async stop(projectId: string): Promise<{ status: string }> {
    const server = this.servers.get(projectId);
    if (!server) return { status: "not_running" };

    this.appendLog(server, "[system] Stopping dev server...");

    // Recovered orphans have no ChildProcess handle — kill by PID.
    if (!server.process) {
      return this.stopByPid(projectId, server);
    }

    return new Promise((resolve) => {
      const proc = server.process!;
      const forceKillTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // already dead
        }
        this.servers.delete(projectId);
        this.persist();
        this.updateProjectStatus(projectId, "idle");
        resolve({ status: "stopped" });
      }, 5000);

      proc.once("exit", () => {
        clearTimeout(forceKillTimer);
        this.appendLog(server, "[system] Dev server stopped.");
        this.servers.delete(projectId);
        this.persist();
        this.updateProjectStatus(projectId, "idle");
        resolve({ status: "stopped" });
      });

      try {
        if (proc.pid) {
          process.kill(-proc.pid, "SIGTERM");
        }
      } catch {
        try {
          proc.kill("SIGTERM");
        } catch {
          // already dead
        }
      }
    });
  }

  /**
   * Stop a recovered orphan by PID. There is no ChildProcess "exit" event to
   * await, so we signal the process group and poll for death.
   */
  private async stopByPid(projectId: string, server: DevServer): Promise<{ status: string }> {
    const finish = (): { status: string } => {
      this.servers.delete(projectId);
      this.persist();
      this.updateProjectStatus(projectId, "idle");
      return { status: "stopped" };
    };

    const pid = server.pid;
    if (pid == null) return finish();

    // Re-verify before killing to avoid killing a PID that was reused by an
    // unrelated process since the orphan was adopted.
    const adoptable = await this.isAdoptableOrphan({
      pid,
      port: server.port,
      url: server.url,
      cwd: server.cwd,
      command: server.command,
      startedAt: server.startedAt,
    });
    if (!adoptable) {
      this.appendLog(server, "[system] Recovered process no longer matches — not killing.");
      return finish();
    }

    this.killGroup(pid, "SIGTERM");
    if (await this.waitForDeath(pid, 5000)) {
      this.appendLog(server, "[system] Dev server stopped.");
      return finish();
    }

    this.killGroup(pid, "SIGKILL");
    await this.waitForDeath(pid, 1000);
    this.appendLog(server, "[system] Dev server force-stopped.");
    return finish();
  }

  getLogs(
    projectId: string,
    offset: number = 0,
  ): {
    lines: string[];
    offset: number;
    running: boolean;
    url: string | null;
    portError: string | null;
  } {
    const server = this.servers.get(projectId);
    if (!server) {
      return { lines: [], offset: 0, running: false, url: null, portError: null };
    }

    // Liveness watchdog for recovered servers: they have no ChildProcess "exit"
    // event, so detect external death on the next log poll.
    if (server.recovered && server.pid != null && !this.isProcessAlive(server.pid)) {
      this.servers.delete(projectId);
      this.persist();
      this.updateProjectStatus(projectId, "idle");
      return {
        lines: server.logLines.slice(offset),
        offset: server.logLines.length,
        running: false,
        url: null,
        portError: null,
      };
    }

    const running = server.process ? server.process.exitCode === null : server.pid != null;
    return {
      lines: server.logLines.slice(offset),
      offset: server.logLines.length,
      running,
      url: server.url,
      portError: server.portError,
    };
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((id) => this.stop(id));
    await Promise.all(promises);
  }

  /**
   * Kill every process listening on `port` so a dev server can claim it. Used
   * when a start fails because a foreign process (not tracked by VEX) holds the
   * port. Best-effort via `lsof` (macOS/Linux); never kills Electron itself.
   */
  async killPort(port: number): Promise<{ status: string; killed: number[]; detail?: string }> {
    const pids = this.findListeningPids(port).filter((pid) => pid !== process.pid);
    if (pids.length === 0) {
      return { status: "no_process", killed: [] };
    }

    for (const pid of pids) {
      this.killGroup(pid, "SIGTERM");
    }
    for (const pid of pids) {
      if (!(await this.waitForDeath(pid, 3000))) {
        this.killGroup(pid, "SIGKILL");
        await this.waitForDeath(pid, 1000);
      }
    }

    const stillBound = await this.isPortListening(port);
    return { status: stillBound ? "partial" : "killed", killed: pids };
  }

  private findListeningPids(port: number): number[] {
    const res = spawnSync("lsof", ["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    if (res.error || !res.stdout) return [];
    return res.stdout
      .split("\n")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  /**
   * Determine the port a project's dev server actually uses, so the "Free Port"
   * action targets the right one instead of the stale stored `dev_port` (often
   * a default 3000). Precedence: live runtime port > explicit flag in the start
   * command > framework default > stored dev_port > 3000.
   */
  resolveDevPort(project: ProjectInfo): number | null {
    const tracked = this.servers.get(project.id);
    if (tracked) {
      if (tracked.port != null) return tracked.port;
      if (tracked.url) {
        const p = this.parsePort(tracked.url);
        if (p != null) return p;
      }
    }

    const script = this.readDevScript(project.path) ?? project.dev_command ?? null;
    if (script) {
      const fromScript = this.parsePortFromCommand(script);
      if (fromScript != null) return fromScript;
    }

    const fromFramework = this.frameworkDefaultPort(project.framework);
    if (fromFramework != null) return fromFramework;

    return project.dev_port ?? 3000;
  }

  private readDevScript(projectPath: string): string | null {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
      const scripts = pkg.scripts ?? {};
      for (const key of ["dev", "start", "serve"]) {
        if (typeof scripts[key] === "string") return scripts[key];
      }
    } catch {
      // no package.json or parse error
    }
    return null;
  }

  private parsePortFromCommand(cmd: string): number | null {
    // PORT=NNNN env-var prefix (e.g. "PORT=4500 node server.js")
    const env = cmd.match(/\bPORT=(\d{2,5})\b/);
    if (env) return this.validPort(parseInt(env[1], 10));
    // --port NNNN | --port=NNNN | -p NNNN | -p=NNNN
    const flag = cmd.match(/(?:--port|-p)[=\s]+(\d{2,5})\b/);
    if (flag) return this.validPort(parseInt(flag[1], 10));
    return null;
  }

  private frameworkDefaultPort(framework?: string | null): number | null {
    switch ((framework ?? "").toLowerCase()) {
      case "vite":
      case "svelte": // SvelteKit dev runs on Vite
        return 5173;
      case "angular":
        return 4200;
      case "vue": // Vue CLI dev server
        return 8080;
      case "next":
      case "nextjs":
      case "next.js":
      case "nuxt":
      case "react": // CRA / react-scripts
        return 3000;
      default:
        return null; // includes "static" (OS-assigned port)
    }
  }

  private validPort(port: number): number | null {
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
  }

  /**
   * Adopt dev servers orphaned by a previous session (crash / force-quit).
   * Re-registers still-alive, verifiable orphans as "recovered" and marks their
   * projects "running" so the existing Stop button can kill them.
   *
   * Must run AFTER resetAllProjectStatuses() (which forces every project idle)
   * and requires the agent-orchestrator to be reachable (it PATCHes status).
   */
  async recoverOrphans(): Promise<void> {
    const persisted = this.readPersisted();
    const projectIds = Object.keys(persisted);
    if (projectIds.length === 0) return;

    for (const projectId of projectIds) {
      const entry = persisted[projectId];
      try {
        if (!(await this.isAdoptableOrphan(entry))) continue;

        this.servers.set(projectId, {
          process: null,
          pid: entry.pid,
          logLines: ["[system] Recovered dev server from previous session — live logs unavailable"],
          url: entry.url,
          portError: null,
          recovered: true,
          port: entry.port,
          cwd: entry.cwd,
          command: entry.command,
          startedAt: entry.startedAt,
        });
        await this.updateProjectStatus(projectId, "running", entry.url);
      } catch (err) {
        console.error(`Failed to recover dev server for ${projectId}: ${err}`);
      }
    }

    // Rewrite the file with only the adopted survivors (drops dead/invalid entries).
    this.persist();
  }

  private appendLog(server: DevServer, line: string): void {
    server.logLines.push(line);
    if (server.logLines.length > MAX_LOG_LINES) {
      server.logLines.splice(0, server.logLines.length - MAX_LOG_LINES);
    }
  }

  // --- Persistence ---------------------------------------------------------

  private persist(): void {
    try {
      const data: Record<string, PersistedServer> = {};
      for (const [id, s] of this.servers) {
        if (s.pid == null) continue;
        data[id] = {
          pid: s.pid,
          port: s.port,
          url: s.url,
          cwd: s.cwd,
          command: s.command,
          startedAt: s.startedAt,
        };
      }
      fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
      const tmp = `${PERSIST_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, PERSIST_FILE);
    } catch (err) {
      console.error(`Failed to persist dev servers: ${err}`);
    }
  }

  private readPersisted(): Record<string, PersistedServer> {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return {};
      const parsed = JSON.parse(fs.readFileSync(PERSIST_FILE, "utf8"));
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, PersistedServer>;
      }
    } catch {
      // missing or corrupt — treat as empty
    }
    return {};
  }

  // --- Orphan-adoption safety ---------------------------------------------

  /**
   * True only if the PID is alive, its recorded port is still listening, and
   * (best-effort) its command looks like a dev server. This is the guard that
   * prevents killing a PID reused by an unrelated process after a reboot.
   */
  private async isAdoptableOrphan(entry: PersistedServer): Promise<boolean> {
    if (entry.pid == null || !this.isProcessAlive(entry.pid)) return false;
    if (entry.port == null || !(await this.isPortListening(entry.port))) return false;
    return this.commandLooksLikeDevServer(entry.pid, entry.cwd);
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // signal 0 = existence check
      return true;
    } catch {
      return false;
    }
  }

  private isPortListening(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = net.createConnection({ host: "127.0.0.1", port });
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(1000);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    });
  }

  /**
   * Best-effort command check via `ps`. Returns true when the process command
   * references the project cwd or looks like a JS dev server, and also true when
   * `ps` is unavailable (Windows / failure) so we fall back to liveness+port.
   */
  private commandLooksLikeDevServer(pid: number, cwd: string): boolean {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    });
    if (result.error || result.status !== 0 || !result.stdout) return true;
    const cmd = result.stdout.trim().toLowerCase();
    if (!cmd) return true;
    if (cmd.includes(cwd.toLowerCase())) return true;
    return (
      /\b(node|npm|pnpm|yarn|bun|deno|vite|next|nuxt|astro|remix|webpack|static-server)\b/.test(
        cmd,
      ) || /\brun\s+(dev|start|serve)\b/.test(cmd)
    );
  }

  private killGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pid, signal); // negative pid = process group
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // already dead
      }
    }
  }

  private waitForDeath(pid: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        if (!this.isProcessAlive(pid)) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(poll, 250);
      };
      poll();
    });
  }

  // --- Command detection ---------------------------------------------------

  private buildRunCommand(
    project: ProjectInfo,
  ): { exe: string; args: string[]; env?: Record<string, string> } | null {
    const scriptKey = this.findScriptKey(project.path);
    if (scriptKey) {
      const pkgManager = project.package_manager ?? "npm";
      // Resolve to an absolute path so the spawn can't miss it when the GUI
      // app's PATH differs from the user's shell (nvm/fnm/`n`/asdf/volta).
      const exe = resolveExecutable(pkgManager) ?? pkgManager;
      return { exe, args: ["run", scriptKey] };
    }

    // Fallback for static sites with no runnable script: serve the folder
    // directly via the bundled static server, launched as Electron-as-Node.
    if (fs.existsSync(path.join(project.path, "index.html"))) {
      const script = path.join(__dirname, "static-server.js");
      return {
        exe: process.execPath,
        args: [script, project.path],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      };
    }

    return null;
  }

  private findScriptKey(projectPath: string): string | null {
    const pkgPath = path.join(projectPath, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const scripts = pkg.scripts ?? {};
      for (const key of ["dev", "start", "serve"]) {
        if (key in scripts) return key;
      }
    } catch {
      // no package.json or parse error
    }
    return null;
  }

  private detectUrl(line: string): string | null {
    const clean = stripAnsi(line);
    for (const token of clean.split(/\s+/)) {
      const trimmed = token.replace(/[(),;'"]/g, "");
      if (
        trimmed.startsWith("http://localhost:") ||
        trimmed.startsWith("http://127.0.0.1:") ||
        trimmed.startsWith("https://localhost:") ||
        trimmed.startsWith("https://127.0.0.1:")
      ) {
        return trimmed;
      }
    }
    const lower = clean.toLowerCase();
    if (lower.includes("ready") || lower.includes("listening") || lower.includes("started")) {
      for (const token of clean.split(/\s+/)) {
        if (/^\d+$/.test(token)) {
          const port = parseInt(token, 10);
          if (port >= 1024 && port <= 65535) {
            return `http://localhost:${port}`;
          }
        }
      }
    }
    return null;
  }

  private parsePort(url: string): number | null {
    const match = url.match(/:(\d+)/);
    if (!match) return null;
    const port = parseInt(match[1], 10);
    return port >= 1 && port <= 65535 ? port : null;
  }

  private detectPortConflict(line: string, port: number): string | null {
    const clean = stripAnsi(line);
    for (const pattern of PORT_IN_USE_PATTERNS) {
      if (clean.includes(pattern)) {
        return `Port ${port} is in use. Stop the other process first.`;
      }
    }
    return null;
  }
}
