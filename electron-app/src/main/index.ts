import { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import net from "net";
import WebSocket from "ws";
import { ProcessManager } from "./process-manager.js";
import { DevServerManager } from "./dev-server-manager.js";
import { cloneRepo } from "./github-cloner.js";
import { installDependencies } from "./dependency-installer.js";

// Disable GPU acceleration on WSL — its virtual GPU misrenders semi-transparent surfaces
try {
  const procVersion = fs.readFileSync("/proc/version", "utf-8");
  if (/microsoft|wsl/i.test(procVersion)) {
    app.disableHardwareAcceleration();
  }
} catch {
  // Not Linux or /proc/version unreadable — no-op
}

// nats.ws expects a global WebSocket — provide it via the ws package in Node.js
(globalThis as any).WebSocket = WebSocket;

// Dynamic import after WebSocket polyfill is in place
let natsWs: typeof import("nats.ws") | null = null;
const natsWsReady = import("nats.ws").then((mod) => { natsWs = mod; });

Menu.setApplicationMenu(null);

// --- CLI argument parsing ---
// Usage: electron . --standalone --ao-port 8420 --nats-port 4222
function parseArgs() {
  const args = process.argv.slice(1); // skip electron binary
  let standalone = false;
  let dev = false;
  let aoPort = 8420;
  let natsPort = 4222;
  let vitePort = 5173;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--standalone") {
      standalone = true;
    } else if (args[i] === "--dev") {
      dev = true;
    } else if (args[i] === "--ao-port" && args[i + 1]) {
      aoPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--nats-port" && args[i + 1]) {
      natsPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--vite-port" && args[i + 1]) {
      vitePort = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { standalone, dev, aoPort, natsPort, vitePort };
}

const cliArgs = parseArgs();
const API_BASE = `http://localhost:${cliArgs.aoPort}`;

let mainWindow: BrowserWindow | null = null;
const processManager = new ProcessManager();
const devServerManager = new DevServerManager(async (projectId, status, url) => {
  try {
    const data: Record<string, unknown> = { status };
    if (url !== undefined) data.dev_server_url = url;
    if (status === "idle") data.dev_server_url = null;
    await apiPatch(`/api/projects/${projectId}`, data);
  } catch (err) {
    console.error(`Failed to update project status: ${err}`);
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: "#1a1a2e",
    icon: path.join(__dirname, "..", "..", "resources", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (cliArgs.dev) {
    mainWindow.loadURL(`http://localhost:${cliArgs.vitePort}`);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "renderer", "index.html")
    );
  }

  // Notify renderer when maximized/fullscreen state changes
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-maximized-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    if (!mainWindow?.isFullScreen()) {
      mainWindow?.webContents.send("window-maximized-changed", false);
    }
  });
  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send("window-maximized-changed", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send("window-maximized-changed", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // F12 opens DevTools
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "F12") {
      mainWindow?.webContents.toggleDevTools();
    }
  });
}

// --- Window control IPC handlers ---
ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-maximize", () => {
  if (!mainWindow) return;
  // On Linux/WSL, maximize leaves WM borders. Use fullscreen instead.
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  } else {
    mainWindow.setFullScreen(true);
  }
});
ipcMain.handle("window-close", () => mainWindow?.close());
ipcMain.handle("window-is-maximized", () =>
  (mainWindow?.isFullScreen() || mainWindow?.isMaximized()) ?? false
);

// --- API helpers ---

function apiGet(urlPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http
      .get(`${API_BASE}${urlPath}`, (res) => {
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      })
      .on("error", reject);
  });
}

function apiPost(urlPath: string, data?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : "";
    const req = http.request(
      `${API_BASE}${urlPath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function apiPatch(urlPath: string, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${API_BASE}${urlPath}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function apiDelete(urlPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${API_BASE}${urlPath}`,
      { method: "DELETE" },
      (res) => {
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 204) {
            resolve(null);
          } else {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// --- IPC handlers ---

ipcMain.handle("get-projects", async () => {
  return apiGet("/api/projects");
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Project Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("create-project", async (_event, name: string, folderPath: string) => {
  return apiPost("/api/projects", { name, path: folderPath });
});

ipcMain.handle("update-project", async (_event, projectId: string, data: Record<string, unknown>) => {
  return apiPatch(`/api/projects/${projectId}`, data);
});

ipcMain.handle("start-dev-server", async (_event, projectId: string) => {
  const project = (await apiGet(`/api/projects/${projectId}`)) as Record<string, unknown> | null;
  if (!project) return { status: "error", detail: "Project not found" };
  console.log(`[dev-server] Starting for project ${projectId}`);
  const result = await devServerManager.start({
    id: project.id as string,
    path: project.path as string,
    dev_command: project.dev_command as string | undefined,
    dev_port: project.dev_port as number | undefined,
    package_manager: project.package_manager as string | undefined,
  });
  console.log(`[dev-server] Start result:`, result);
  return result;
});

ipcMain.handle("stop-dev-server", async (_event, projectId: string) => {
  console.log(`[dev-server] Stopping project ${projectId}`);
  const result = await devServerManager.stop(projectId);
  console.log(`[dev-server] Stop result:`, result);
  return result;
});

ipcMain.handle("get-dev-server-logs", async (_event, projectId: string, offset: number) => {
  return devServerManager.getLogs(projectId, offset);
});

ipcMain.handle("open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("clone-github-repo", async (_event, url: string) => {
  return cloneRepo(url, mainWindow);
});

ipcMain.handle("install-dependencies", async (_event, projectPath: string) => {
  return installDependencies(projectPath, mainWindow);
});

ipcMain.handle("get-agents", async () => {
  return apiGet("/api/agents");
});

ipcMain.handle("get-project-agents", async (_event, projectId: string) => {
  return apiGet(`/api/projects/${projectId}/agents`);
});

ipcMain.handle("get-batch-tasks", async (_event, projectId: string, batchId: string) => {
  return apiGet(`/api/projects/${projectId}/batches/${batchId}/tasks`);
});

ipcMain.handle("get-agent-steps", async (_event, agentId: string) => {
  return apiGet(`/api/agents/${agentId}/steps`);
});

ipcMain.handle("get-agent-logs", async (_event, agentId: string) => {
  return apiGet(`/api/agents/${agentId}/logs`);
});

ipcMain.handle("get-agent-trace-by-agent", async (_event, agentId: string) => {
  return apiGet(`/api/agents/${agentId}/trace`);
});

ipcMain.handle("get-nats-status", async () => {
  if (cliArgs.standalone) {
    const healthy = await checkTcp(cliArgs.natsPort);
    return { healthy };
  }
  return { healthy: processManager.getNatsHealthy() };
});

ipcMain.handle("get-config", async () => {
  return apiGet("/api/config");
});

ipcMain.handle("update-config", async (_event, config: Record<string, unknown>) => {
  return apiPatch("/api/config", config);
});

ipcMain.handle("delete-project", async (_event, projectId: string, deleteSource: boolean = false) => {
  const qs = deleteSource ? "?delete_source=true" : "";
  return apiDelete(`/api/projects/${projectId}${qs}`);
});

ipcMain.handle("get-project", async (_event, projectId: string) => {
  return apiGet(`/api/projects/${projectId}`);
});

ipcMain.handle("get-batches", async (_event, projectId: string) => {
  return apiGet(`/api/projects/${projectId}/batches`);
});

ipcMain.handle("get-batch", async (_event, projectId: string, batchId: string) => {
  return apiGet(`/api/projects/${projectId}/batches/${batchId}`);
});

ipcMain.handle("delete-batch", async (_event, projectId: string, batchId: string) => {
  return apiDelete(`/api/projects/${projectId}/batches/${batchId}`);
});

ipcMain.handle("stop-batch", async (_event, projectId: string, batchId: string) => {
  return apiPost(`/api/projects/${projectId}/batches/${batchId}/stop`);
});

ipcMain.handle("stop-agent", async (_event, agentId: string) => {
  return apiPost(`/api/agents/${agentId}/stop`);
});

ipcMain.handle("get-agent-trace", async (_event, batchId: string) => {
  return apiGet(`/api/batches/${batchId}/trace`);
});

ipcMain.handle("get-activity", async (_event, filters?: { projectId?: string; type?: string; since?: string }) => {
  const params = new URLSearchParams();
  if (filters?.projectId) params.set("project_id", filters.projectId);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.since) params.set("since", filters.since);
  const qs = params.toString();
  return apiGet(`/api/activity${qs ? `?${qs}` : ""}`);
});

ipcMain.handle("get-activity-stats", async (_event, since?: string) => {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiGet(`/api/activity/stats${qs}`);
});

ipcMain.handle("get-tasks", async (_event, projectId?: string) => {
  const qs = projectId ? `?project_id=${projectId}` : "";
  return apiGet(`/api/tasks${qs}`);
});

ipcMain.handle("get-storage-stats", async () => {
  return apiGet("/api/storage/stats");
});

ipcMain.handle("clear-screenshots", async () => {
  return apiDelete("/api/storage/screenshots");
});

ipcMain.handle("get-app-info", async () => {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  };
});

// --- NATS WebSocket subscription bridge ---

const NATS_WS_PORT = 4223;
let natsConnection: any = null;
const natsSubscriptions = new Map<string, any>();

async function ensureNatsConnection(): Promise<any> {
  if (natsConnection && !natsConnection.isClosed()) return natsConnection;
  await natsWsReady;
  if (!natsWs) return null;
  try {
    natsConnection = await natsWs.connect({
      servers: `ws://localhost:${NATS_WS_PORT}`,
      name: "vex-electron-main",
    });
    console.log("[nats-bridge] Connected to NATS WS");
    natsConnection.closed().then((err: Error | undefined) => {
      if (err) console.warn("[nats-bridge] NATS closed with error:", err.message);
      else console.log("[nats-bridge] NATS connection closed");
      natsConnection = null;
    });
    return natsConnection;
  } catch (err: unknown) {
    console.warn("[nats-bridge] Failed to connect to NATS WS:", err);
    return null;
  }
}

function natsJsonDecode(data: Uint8Array): unknown {
  if (!natsWs) return null;
  return natsWs.JSONCodec().decode(data);
}

ipcMain.handle("subscribe-agent-steps", async (_event, agentId: string) => {
  const nc = await ensureNatsConnection();
  if (!nc) return { ok: false, error: "NATS not connected" };

  const stepSubject = `vex.agent.${agentId}.step`;
  const statusSubject = `vex.agent.${agentId}.status`;
  const hooksSubject = `vex.agent.${agentId}.hooks`;

  // Unsubscribe existing if any
  for (const subject of [stepSubject, statusSubject, hooksSubject]) {
    const existing = natsSubscriptions.get(subject);
    if (existing) {
      existing.unsubscribe();
      natsSubscriptions.delete(subject);
    }
  }

  // Subscribe to step messages
  const stepSub = nc.subscribe(stepSubject);
  natsSubscriptions.set(stepSubject, stepSub);
  (async () => {
    for await (const msg of stepSub) {
      try {
        const data = natsJsonDecode(msg.data);
        mainWindow?.webContents.send("agent-step", { agentId, ...data as object });
      } catch { /* decode error */ }
    }
  })();

  // Subscribe to status messages
  const statusSub = nc.subscribe(statusSubject);
  natsSubscriptions.set(statusSubject, statusSub);
  (async () => {
    for await (const msg of statusSub) {
      try {
        const data = natsJsonDecode(msg.data);
        mainWindow?.webContents.send("agent-status", { agentId, ...data as object });
      } catch { /* decode error */ }
    }
  })();

  // Subscribe to hook messages (SubagentStart/Stop, Skill/Agent tool use)
  const hooksSub = nc.subscribe(hooksSubject);
  natsSubscriptions.set(hooksSubject, hooksSub);
  (async () => {
    for await (const msg of hooksSub) {
      try {
        const data = natsJsonDecode(msg.data);
        mainWindow?.webContents.send("agent-hook", { agentId, ...data as object });
      } catch { /* decode error */ }
    }
  })();

  console.log(`[nats-bridge] Subscribed to ${stepSubject}, ${statusSubject}, and ${hooksSubject}`);
  return { ok: true };
});

ipcMain.handle("unsubscribe-agent-steps", async (_event, agentId: string) => {
  for (const suffix of ["step", "status", "hooks"]) {
    const subject = `vex.agent.${agentId}.${suffix}`;
    const sub = natsSubscriptions.get(subject);
    if (sub) {
      sub.unsubscribe();
      natsSubscriptions.delete(subject);
    }
  }
  console.log(`[nats-bridge] Unsubscribed from agent ${agentId}`);
  return { ok: true };
});

// --- Standalone health-check helpers ---

function checkTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.createConnection({ port }, () => {
      conn.destroy();
      resolve(true);
    });
    conn.on("error", () => resolve(false));
  });
}

function checkHttp(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    http.get(url, (res) => resolve(res.statusCode === 200)).on("error", () => resolve(false));
  });
}

// --- App lifecycle ---

async function resetAllProjectStatuses(): Promise<void> {
  try {
    const projects = (await apiGet("/api/projects")) as Array<{ id: string; status?: string }> | null;
    if (!Array.isArray(projects)) return;
    for (const p of projects) {
      if (p.status !== "idle") {
        console.log(`[dev-server] Resetting project ${p.id} to idle`);
        await apiPatch(`/api/projects/${p.id}`, { status: "idle", dev_server_url: null });
      }
    }
  } catch (err) {
    console.error("Failed to reset project statuses:", err);
  }
}

app.on("ready", async () => {
  if (cliArgs.standalone) {
    console.log(
      `[standalone] Expecting external NATS on port ${cliArgs.natsPort}, ` +
      `AgentOrchestrator on port ${cliArgs.aoPort}`
    );
    // Verify external services are reachable
    const natsOk = await checkTcp(cliArgs.natsPort);
    console.log(`[standalone] NATS: ${natsOk ? "reachable" : "NOT reachable"}`);
    const aoOk = await checkHttp(`http://localhost:${cliArgs.aoPort}/api/health`);
    console.log(`[standalone] AgentOrchestrator: ${aoOk ? "reachable" : "NOT reachable"}`);
    if (aoOk) await resetAllProjectStatuses();
  } else {
    try {
      await processManager.startAll();
      await resetAllProjectStatuses();
    } catch (err) {
      console.error("Failed to start managed processes:", err);
    }
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  // Clean up NATS subscriptions and connection
  for (const sub of natsSubscriptions.values()) {
    try { sub.unsubscribe(); } catch { /* already closed */ }
  }
  natsSubscriptions.clear();
  if (natsConnection && !natsConnection.isClosed()) {
    try { await natsConnection.drain(); } catch { /* ignore */ }
    natsConnection = null;
  }
  try {
    await devServerManager.stopAll();
  } catch (err) {
    console.error("Error stopping dev servers:", err);
  }
  if (!cliArgs.standalone) {
    try {
      await processManager.stopAll();
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
    }
  }
  app.exit(0);
});

processManager.on("log", (msg: string) => {
  console.log(msg);
});

processManager.on("error", (msg: string) => {
  console.error(msg);
});
