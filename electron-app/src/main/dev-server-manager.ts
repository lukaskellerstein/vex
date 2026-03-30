/**
 * Dev-server process management for user projects.
 *
 * Electron owns the full dev server lifecycle:
 * - Start: spawns a child process in its own process group (detached)
 * - Stop: kills the process group via SIGTERM
 * - Logs: buffered in-memory (up to 2000 lines)
 * - On Electron close: all spawned servers are killed
 * - On Electron restart: clean slate — everything is idle
 */

import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";

const MAX_LOG_LINES = 2000;

const PORT_IN_USE_PATTERNS = [
  "EADDRINUSE",
  "port is already in use",
  "address already in use",
  "Port is already in use",
];

interface DevServer {
  process: ChildProcess;
  logLines: string[];
  url: string | null;
  portError: string | null;
}

export interface ProjectInfo {
  id: string;
  path: string;
  dev_command?: string;
  dev_port?: number;
  package_manager?: string;
}

type StatusUpdater = (
  projectId: string,
  status: string,
  url?: string | null
) => Promise<void>;

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

    const [exe, args] = cmd;
    await this.updateProjectStatus(project.id, "starting");

    let child: ChildProcess;
    try {
      child = spawn(exe, args, {
        cwd: project.path,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      });
    } catch (err: unknown) {
      await this.updateProjectStatus(project.id, "error");
      return { status: "error", detail: String(err) };
    }

    const server: DevServer = {
      process: child,
      logLines: [],
      url: null,
      portError: null,
    };
    this.servers.set(project.id, server);

    this.appendLog(server, `[system] Started: ${exe} ${args.join(" ")} (pid ${child.pid}) in ${project.path}`);

    const handleLine = (line: string, prefix: string) => {
      if (!line) return;
      this.appendLog(server, `${prefix} ${line}`);

      if (!server.url) {
        const detected = this.detectUrl(line);
        if (detected) {
          server.url = detected;
          this.updateProjectStatus(project.id, "running", detected);
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

    return new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        try {
          server.process.kill("SIGKILL");
        } catch {
          // already dead
        }
        this.servers.delete(projectId);
        this.updateProjectStatus(projectId, "idle");
        resolve({ status: "stopped" });
      }, 5000);

      server.process.once("exit", () => {
        clearTimeout(forceKillTimer);
        this.appendLog(server, "[system] Dev server stopped.");
        this.servers.delete(projectId);
        this.updateProjectStatus(projectId, "idle");
        resolve({ status: "stopped" });
      });

      try {
        if (server.process.pid) {
          process.kill(-server.process.pid, "SIGTERM");
        }
      } catch {
        try {
          server.process.kill("SIGTERM");
        } catch {
          // already dead
        }
      }
    });
  }

  getLogs(projectId: string, offset: number = 0): {
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

    return {
      lines: server.logLines.slice(offset),
      offset: server.logLines.length,
      running: server.process.exitCode === null,
      url: server.url,
      portError: server.portError,
    };
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((id) => this.stop(id));
    await Promise.all(promises);
  }

  private appendLog(server: DevServer, line: string): void {
    server.logLines.push(line);
    if (server.logLines.length > MAX_LOG_LINES) {
      server.logLines.splice(0, server.logLines.length - MAX_LOG_LINES);
    }
  }

  private buildRunCommand(project: ProjectInfo): [string, string[]] | null {
    if (!project.dev_command) return null;
    const pkgManager = project.package_manager ?? "npm";
    const scriptKey = this.findScriptKey(project.path);
    if (!scriptKey) return null;
    return [pkgManager, ["run", scriptKey]];
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
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
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

  private detectPortConflict(line: string, port: number): string | null {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    for (const pattern of PORT_IN_USE_PATTERNS) {
      if (clean.includes(pattern)) {
        return `Port ${port} is in use. Stop the other process first.`;
      }
    }
    return null;
  }
}
