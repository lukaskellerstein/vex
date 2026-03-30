import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "path";
import http from "http";
import net from "net";
import { ProcessManager } from "./process-manager.js";
import { DevServerManager } from "./dev-server-manager.js";
import { cloneRepo } from "./github-cloner.js";
import { installDependencies } from "./dependency-installer.js";

Menu.setApplicationMenu(null);

// --- CLI argument parsing ---
// Usage: electron . --standalone --ao-port 8420 --nats-port 4222
function parseArgs() {
  const args = process.argv.slice(1); // skip electron binary
  let standalone = false;
  let aoPort = 8420;
  let natsPort = 4222;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--standalone") {
      standalone = true;
    } else if (args[i] === "--ao-port" && args[i + 1]) {
      aoPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--nats-port" && args[i + 1]) {
      natsPort = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { standalone, aoPort, natsPort };
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
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "index.html")
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

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

ipcMain.handle("get-agent-logs", async (_event, agentId: string) => {
  return apiGet(`/api/agents/${agentId}/logs`);
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
