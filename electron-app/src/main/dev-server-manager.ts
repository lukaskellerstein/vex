/**
 * Dev-server process management for user projects.
 *
 * - Start: spawns a child process in its own process group (detached)
 * - Stop: kills the Electron-spawned process group, OR kills whatever is
 *   listening on the project's port (cross-platform via lsof/netstat)
 * - Status: simple TCP connect to the project's dev_port
 * - On Electron close: Electron-spawned servers are killed automatically
 */

import { ChildProcess, spawn, execSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";

const MAX_LOG_LINES = 2000;

interface DevServer {
  process: ChildProcess;
  logLines: string[];
  url: string | null;
}

export interface ProjectInfo {
  id: string;
  path: string;
  dev_command?: string;
  dev_port?: number;
  dev_server_url?: string;
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

  /**
   * Check if something is listening on the project's dev port.
   * Checks both the configured dev_port and the last-known URL port
   * (dev servers often auto-increment when the default port is taken).
   * Cross-platform — just TCP connects.
   */
  checkRunning(project: ProjectInfo): Promise<string | null> {
    const tracked = this.servers.get(project.id);
    if (tracked && tracked.process.exitCode === null) {
      return Promise.resolve(tracked.url);
    }

    const portsToCheck = new Set<number>();
    // Last-known URL port takes priority (it's the actual runtime port).
    if (project.dev_server_url) {
      try {
        const urlPort = parseInt(new URL(project.dev_server_url).port, 10);
        if (urlPort > 0) portsToCheck.add(urlPort);
      } catch { /* invalid URL */ }
    }
    portsToCheck.add(project.dev_port ?? 3000);

    return new Promise((resolve) => {
      let remaining = portsToCheck.size;
      let resolved = false;

      for (const port of portsToCheck) {
        const conn = net.createConnection({ port, host: "127.0.0.1" }, () => {
          conn.destroy();
          if (!resolved) {
            resolved = true;
            resolve(`http://localhost:${port}`);
          }
        });
        conn.on("error", () => {
          remaining--;
          if (remaining === 0 && !resolved) resolve(null);
        });
        conn.setTimeout(500, () => {
          conn.destroy();
          remaining--;
          if (remaining === 0 && !resolved) resolve(null);
        });
      }
    });
  }

  async start(project: ProjectInfo): Promise<{ status: string; detail?: string }> {
    if (this.servers.has(project.id)) {
      const existing = this.servers.get(project.id)!;
      return { status: "already_running", detail: existing.url ?? undefined };
    }

    // Check if already running externally.
    const externalUrl = await this.checkRunning(project);
    if (externalUrl) {
      await this.updateProjectStatus(project.id, "running", externalUrl);
      return { status: "already_running", detail: externalUrl };
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
    };
    this.servers.set(project.id, server);

    const defaultPort = project.dev_port ?? 3000;

    this.appendLog(server, `[system] Started: ${exe} ${args.join(" ")} (pid ${child.pid}) in ${project.path}`);

    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (!line) continue;
        this.appendLog(server, `[out] ${line}`);
        if (!server.url) {
          const detected = this.detectUrl(line, defaultPort);
          if (detected) {
            server.url = detected;
            this.updateProjectStatus(project.id, "running", detected);
          }
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (!line) continue;
        this.appendLog(server, `[err] ${line}`);
        if (!server.url) {
          const detected = this.detectUrl(line, defaultPort);
          if (detected) {
            server.url = detected;
            this.updateProjectStatus(project.id, "running", detected);
          }
        }
      }
    });

    child.on("exit", (code) => {
      this.appendLog(server, `[system] Process exited with code ${code}`);
      if (this.servers.has(project.id)) {
        this.servers.delete(project.id);
        this.updateProjectStatus(project.id, "idle");
      }
    });

    return { status: "starting" };
  }

  async stop(projectId: string, port: number): Promise<{ status: string }> {
    const server = this.servers.get(projectId);

    if (server) {
      // Electron-spawned: kill the process group.
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

    // Not spawned by Electron — kill whatever is on the port.
    const killed = this.killByPort(port);
    if (killed) {
      await this.updateProjectStatus(projectId, "idle");
      return { status: "stopped" };
    }

    return { status: "not_running" };
  }

  getLogs(projectId: string, offset: number = 0): {
    lines: string[];
    offset: number;
    running: boolean;
    url: string | null;
  } {
    const server = this.servers.get(projectId);
    if (!server) {
      return { lines: [], offset: 0, running: false, url: null };
    }

    return {
      lines: server.logLines.slice(offset),
      offset: server.logLines.length,
      running: server.process.exitCode === null,
      url: server.url,
    };
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map((id) => {
      const server = this.servers.get(id)!;
      // We don't know the port here, but for Electron-spawned servers
      // the first code path in stop() handles it.
      return this.stop(id, 0);
    });
    await Promise.all(promises);
  }

  /**
   * Kill whatever process is listening on the given port.
   * Cross-platform: uses lsof (Linux/Mac) or netstat (Windows).
   */
  private killByPort(port: number): boolean {
    if (port <= 0) return false;

    try {
      if (process.platform === "win32") {
        // Windows: find PID via netstat, then taskkill
        const out = execSync(
          `netstat -ano | findstr :${port} | findstr LISTENING`,
          { encoding: "utf8", timeout: 3000 }
        );
        const pids = new Set<number>();
        for (const line of out.split("\n")) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) pids.add(pid);
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, { timeout: 3000 });
          } catch { /* already dead */ }
        }
        return pids.size > 0;
      } else {
        // Linux / Mac: lsof
        const out = execSync(
          `lsof -ti :${port}`,
          { encoding: "utf8", timeout: 3000 }
        );
        const pids = out.trim().split("\n").map(Number).filter(Boolean);
        for (const pid of pids) {
          try {
            process.kill(pid, "SIGTERM");
          } catch { /* already dead */ }
        }
        return pids.length > 0;
      }
    } catch {
      return false;
    }
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

  private detectUrl(line: string, _defaultPort: number): string | null {
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
}
