import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import http from "http";
import { ProcessManager } from "./process-manager.js";

const API_BASE = "http://localhost:8420";

let mainWindow: BrowserWindow | null = null;
const processManager = new ProcessManager();

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

ipcMain.handle("add-project", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Project Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  return apiPost("/api/projects", { path: folderPath });
});

ipcMain.handle("start-dev-server", async (_event, projectId: string) => {
  return apiPost(`/api/projects/${projectId}/start`);
});

ipcMain.handle("stop-dev-server", async (_event, projectId: string) => {
  return apiPost(`/api/projects/${projectId}/stop`);
});

ipcMain.handle("get-agents", async () => {
  return apiGet("/api/agents");
});

ipcMain.handle("get-agent-logs", async (_event, agentId: string) => {
  return apiGet(`/api/agents/${agentId}/logs`);
});

ipcMain.handle("get-config", async () => {
  return apiGet("/api/config");
});

ipcMain.handle("update-config", async (_event, config: Record<string, unknown>) => {
  return apiPatch("/api/config", config);
});

// --- App lifecycle ---

app.on("ready", async () => {
  try {
    await processManager.startAll();
  } catch (err) {
    console.error("Failed to start managed processes:", err);
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
    await processManager.stopAll();
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
  }
  app.exit(0);
});

processManager.on("log", (msg: string) => {
  console.log(msg);
});

processManager.on("error", (msg: string) => {
  console.error(msg);
});
