import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import http from "http";

interface ManagedProcess {
  process: ChildProcess;
  name: string;
  restartCount: number;
}

const MAX_RESTART_ATTEMPTS = 3;
const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_MAX_RETRIES = 30;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000;

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();

  async startAll(): Promise<void> {
    await this.startNats();
    await this.startAgentManager();
    await this.waitForAgentManagerHealth();
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.processes.keys()).map((name) =>
      this.stopProcess(name)
    );
    await Promise.all(stopPromises);
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

  private startNats(): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn(
        "nats-server",
        ["-p", "4222", "--websocket_port", "4223", "--websocket_no_tls"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      this.trackProcess("nats-server", child);

      // Give NATS a moment to bind its port
      setTimeout(resolve, 500);
    });
  }

  private startAgentManager(): Promise<void> {
    return new Promise((resolve) => {
      const cwd = path.resolve(__dirname, "..", "..", "..", "agent-orchestrator");

      const child = spawn(
        "python",
        ["-m", "uvicorn", "agent_orchestrator.main:app", "--port", "8420"],
        { cwd, stdio: ["ignore", "pipe", "pipe"] }
      );

      this.trackProcess("agent-manager", child);

      // Resolve immediately; health check handles readiness
      resolve();
    });
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
