import { ChildProcess, execSync, spawn } from "child_process";
import { EventEmitter } from "events";
import { app } from "electron";
import path from "path";
import net from "net";
import fs from "fs";
import http from "http";
import os from "os";

interface ManagedProcess {
  process: ChildProcess;
  name: string;
  restartCount: number;
}

const MAX_RESTART_ATTEMPTS = 3;
const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_MAX_RETRIES = 30;
const NATS_HEALTH_MAX_RETRIES = 10;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000;
const TMP_DIR = path.join(os.tmpdir(), "vex");
const NATS_PID_FILE = path.join(TMP_DIR, "nats.pid");
const NATS_CONF_FILE = path.join(TMP_DIR, "nats.conf");
const NATS_VERSION = "2.10.25";

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();
  private natsHealthy = false;

  getNatsHealthy(): boolean {
    return this.natsHealthy;
  }

  async startAll(): Promise<void> {
    await this.cleanupOrphanedNats();
    await this.startNats();
    await this.startAgentManager();
    await this.waitForAgentManagerHealth();
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.processes.keys()).map((name) =>
      this.stopProcess(name)
    );
    await Promise.all(stopPromises);
    this.removeNatsPidFile();
    this.natsHealthy = false;
  }

  async restartProcess(name: string): Promise<void> {
    const managed = this.processes.get(name);
    if (managed && managed.restartCount >= MAX_RESTART_ATTEMPTS) {
      this.emit(
        "error",
        `Process "${name}" exceeded max restart attempts (${MAX_RESTART_ATTEMPTS})`
      );
      return;
    }

    await this.stopProcess(name);

    if (name === "nats-server") {
      await this.startNats();
    } else if (name === "agent-manager") {
      await this.startAgentManager();
      await this.waitForAgentManagerHealth();
    }

    const updated = this.processes.get(name);
    if (updated) {
      updated.restartCount = (managed?.restartCount ?? 0) + 1;
    }
  }

  // --- Generate NATS config file (WebSocket requires config, not CLI flags) ---
  private writeNatsConfig(): void {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const config = [
      "listen: 0.0.0.0:4222",
      "max_payload: 8388608",
      "",
      "websocket {",
      '  listen: "0.0.0.0:4223"',
      "  no_tls: true",
      "}",
    ].join("\n");
    fs.writeFileSync(NATS_CONF_FILE, config);
  }

  // --- T011: Resolve bundled NATS binary by platform ---
  private resolveNatsBinary(): string | null {
    const platform = process.platform; // "linux", "darwin", "win32"
    const arch = process.arch;         // "x64", "arm64"

    let dirName: string;
    let binaryName = "nats-server";

    if (platform === "linux") {
      dirName = "linux-amd64";
    } else if (platform === "darwin" && arch === "arm64") {
      dirName = "darwin-arm64";
    } else if (platform === "darwin") {
      dirName = "darwin-x64";
    } else if (platform === "win32") {
      dirName = "win32-x64";
      binaryName = "nats-server.exe";
    } else {
      return null;
    }

    // In production (packaged): bin/ is shipped via extraResources under resourcesPath
    if (app.isPackaged) {
      const packagedPath = path.join(process.resourcesPath, "bin", dirName, binaryName);
      if (fs.existsSync(packagedPath)) {
        return packagedPath;
      }
    }

    // In development: bin/ is next to src/ in electron-app/
    const devPath = path.resolve(__dirname, "..", "..", "bin", dirName, binaryName);
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    // Fallback: check PATH
    try {
      const cmd = platform === "win32" ? "where nats-server" : "which nats-server";
      const result = execSync(cmd, { stdio: "pipe" }).toString().trim();
      if (result) return result;
    } catch {
      // not on PATH
    }

    return null;
  }

  // --- T007: Port availability check ---
  private checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
  }

  // --- T008: PID file management ---
  private writeNatsPidFile(pid: number): void {
    try {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      fs.writeFileSync(NATS_PID_FILE, String(pid));
    } catch (err) {
      this.emit("log", `Warning: Could not write NATS PID file: ${err}`);
    }
  }

  private removeNatsPidFile(): void {
    try {
      if (fs.existsSync(NATS_PID_FILE)) {
        fs.unlinkSync(NATS_PID_FILE);
      }
    } catch {
      // ignore
    }
  }

  // --- T009: Orphan cleanup ---
  private async cleanupOrphanedNats(): Promise<void> {
    try {
      if (!fs.existsSync(NATS_PID_FILE)) return;

      const pidStr = fs.readFileSync(NATS_PID_FILE, "utf8").trim();
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) {
        this.removeNatsPidFile();
        return;
      }

      // Check if process is alive
      try {
        process.kill(pid, 0); // signal 0 = check existence
        this.emit("log", `Killing orphaned NATS process (PID ${pid})`);
        process.kill(pid, "SIGTERM");
        // Wait briefly for it to die
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          process.kill(pid, 0);
          // Still alive — force kill
          process.kill(pid, "SIGKILL");
        } catch {
          // Dead after SIGTERM — good
        }
      } catch {
        // Process doesn't exist — stale PID file
      }

      this.removeNatsPidFile();
    } catch (err) {
      this.emit("log", `Warning: Orphan cleanup failed: ${err}`);
      this.removeNatsPidFile();
    }
  }

  // --- T010: TCP health check for NATS ---
  private waitForNatsHealth(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const check = () => {
        attempts++;
        const conn = net.createConnection({ port }, () => {
          conn.destroy();
          this.natsHealthy = true;
          this.emit("log", "NATS health check passed");
          resolve();
        });
        conn.on("error", () => {
          if (attempts < NATS_HEALTH_MAX_RETRIES) {
            setTimeout(check, HEALTH_POLL_INTERVAL_MS);
          } else {
            this.natsHealthy = false;
            reject(new Error("NATS health check timed out"));
          }
        });
      };

      check();
    });
  }

  private async startNats(): Promise<void> {
    // Resolve bundled binary (platform-specific)
    const natsBinary = this.resolveNatsBinary();
    if (!natsBinary) {
      const msg =
        `NATS server binary (v${NATS_VERSION}) not found.\n` +
        "Expected bundled binary in electron-app/bin/<platform>/ — " +
        "the distribution may be incomplete.";
      this.emit("error", msg);
      throw new Error("nats-server binary not found");
    }

    this.emit("log", `Using NATS binary: ${natsBinary}`);

    // Check port available
    const portFree = await this.checkPortAvailable(4222);
    if (!portFree) {
      const msg =
        "Port 4222 is already in use. Another NATS instance or process may be running.\n" +
        "  Check with: lsof -i :4222\n" +
        "  Kill it with: kill <pid>";
      this.emit("error", msg);
      throw new Error("Port 4222 already in use");
    }

    // Write config file (WebSocket requires config, not CLI flags)
    this.writeNatsConfig();

    return new Promise((resolve, reject) => {
      const child = spawn(
        natsBinary,
        ["-c", NATS_CONF_FILE],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      this.trackProcess("nats-server", child);

      // T008: Write PID file
      if (child.pid) {
        this.writeNatsPidFile(child.pid);
      }

      // T010: TCP health check instead of blind setTimeout
      this.waitForNatsHealth(4222).then(resolve).catch(reject);
    });
  }

  private async startAgentManager(): Promise<void> {
    const portFree = await this.checkPortAvailable(8420);
    if (!portFree) {
      const msg =
        "Port 8420 is already in use. A previous AgentManager may still be running.\n" +
        "  Check with: lsof -i :8420\n" +
        "  Kill it with: kill <pid>";
      this.emit("error", msg);
      throw new Error("Port 8420 already in use");
    }

    return new Promise((resolve) => {
      const { pythonBin, cwd, env } = this.resolveAgentManagerRuntime();

      this.emit("log", `Using Python: ${pythonBin}`);

      const child = spawn(
        pythonBin,
        ["-m", "uvicorn", "agent_orchestrator.main:app", "--port", "8420"],
        { cwd, env, stdio: ["ignore", "pipe", "pipe"] }
      );

      this.trackProcess("agent-manager", child);
      resolve();
    });
  }

  /**
   * Resolve how to launch the Agent Orchestrator.
   * - Packaged: bundled standalone Python + AO source shipped via extraResources.
   * - Dev: the agent-orchestrator/.venv interpreter next to the source tree.
   */
  private resolveAgentManagerRuntime(): {
    pythonBin: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
  } {
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: this.buildChildPath() };

    if (app.isPackaged) {
      const aoDir = path.join(process.resourcesPath, "agent-orchestrator");
      const pythonName = process.platform === "win32" ? "python.exe" : "python3";
      const pythonBin = path.join(
        process.resourcesPath,
        "python",
        process.platform === "win32" ? "" : "bin",
        pythonName
      );
      // AO is shipped as source (not installed) so config.json resolves relative
      // to src/agent_orchestrator/.../claude_code_sdk.py (parents[3]/config.json).
      env.PYTHONPATH = path.join(aoDir, "src");
      return { pythonBin, cwd: aoDir, env };
    }

    const cwd = path.resolve(__dirname, "..", "..", "..", "agent-orchestrator");
    const venvPython = path.join(cwd, ".venv", "bin", "python");
    const pythonBin = fs.existsSync(venvPython) ? venvPython : "python";
    return { pythonBin, cwd, env };
  }

  /**
   * macOS/Linux GUI apps launch with a minimal PATH that omits user-local bins.
   * The bundled backend spawns the `claude` CLI via claude-agent-sdk, so we
   * prepend the common install locations to the child's PATH.
   */
  private buildChildPath(): string {
    const home = os.homedir();
    const extra = [
      path.join(home, ".local", "bin"),
      path.join(home, ".npm-global", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ];
    const current = process.env.PATH ?? "";
    const merged = [...extra, ...current.split(path.delimiter)].filter(Boolean);
    return Array.from(new Set(merged)).join(path.delimiter);
  }

  private waitForAgentManagerHealth(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const poll = () => {
        attempts++;
        const req = http.get("http://localhost:8420/api/health", (res) => {
          if (res.statusCode === 200) {
            this.emit("log", "AgentManager health check passed");
            resolve();
          } else if (attempts < HEALTH_MAX_RETRIES) {
            setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
          } else {
            reject(new Error("AgentManager health check timed out"));
          }
        });

        req.on("error", () => {
          if (attempts < HEALTH_MAX_RETRIES) {
            setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
          } else {
            reject(new Error("AgentManager health check timed out"));
          }
        });

        req.end();
      };

      poll();
    });
  }

  private trackProcess(name: string, child: ChildProcess): void {
    const managed: ManagedProcess = { process: child, name, restartCount: 0 };
    this.processes.set(name, managed);

    child.stdout?.on("data", (data: Buffer) => {
      this.emit("log", `[${name}] ${data.toString().trim()}`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      this.emit("log", `[${name}:err] ${data.toString().trim()}`);
    });

    child.on("exit", (code, signal) => {
      this.emit(
        "log",
        `[${name}] exited with code=${code} signal=${signal}`
      );
      this.processes.delete(name);

      if (name === "nats-server") {
        this.natsHealthy = false;
        this.removeNatsPidFile();
        // Emit crash event for UI notification
        this.emit("nats-crash", { code, signal });
      }
    });
  }

  private stopProcess(name: string): Promise<void> {
    return new Promise((resolve) => {
      const managed = this.processes.get(name);
      if (!managed) {
        resolve();
        return;
      }

      const { process: child } = managed;

      const forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
        this.processes.delete(name);
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

      child.once("exit", () => {
        clearTimeout(forceKillTimer);
        this.processes.delete(name);
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(forceKillTimer);
        this.processes.delete(name);
        resolve();
      }
    });
  }
}
