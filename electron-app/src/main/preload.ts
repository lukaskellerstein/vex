import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getProjects: () => ipcRenderer.invoke("get-projects"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  createProject: (name: string, path: string) =>
    ipcRenderer.invoke("create-project", name, path),
  updateProject: (projectId: string, data: Record<string, unknown>) =>
    ipcRenderer.invoke("update-project", projectId, data),
  startDevServer: (projectId: string) =>
    ipcRenderer.invoke("start-dev-server", projectId),
  stopDevServer: (projectId: string) =>
    ipcRenderer.invoke("stop-dev-server", projectId),
  getDevServerLogs: (projectId: string, offset: number) =>
    ipcRenderer.invoke("get-dev-server-logs", projectId, offset),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  getAgents: () => ipcRenderer.invoke("get-agents"),
  getProjectAgents: (projectId: string) =>
    ipcRenderer.invoke("get-project-agents", projectId),
  getBatchTasks: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("get-batch-tasks", projectId, batchId),
  getAgentSteps: (agentId: string) =>
    ipcRenderer.invoke("get-agent-steps", agentId),
  getAgentLogs: (agentId: string) =>
    ipcRenderer.invoke("get-agent-logs", agentId),
  getAgentTraceByAgent: (agentId: string) =>
    ipcRenderer.invoke("get-agent-trace-by-agent", agentId),
  getNatsStatus: () => ipcRenderer.invoke("get-nats-status"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("update-config", config),
  cloneGithubRepo: (url: string) =>
    ipcRenderer.invoke("clone-github-repo", url),
  installDependencies: (projectPath: string) =>
    ipcRenderer.invoke("install-dependencies", projectPath),
  onCloneProgress: (callback: (data: { phase: string; progress: number; message: string }) => void) => {
    const handler = (_event: unknown, data: { phase: string; progress: number; message: string }) => callback(data);
    ipcRenderer.on("clone-progress", handler);
    return () => ipcRenderer.removeListener("clone-progress", handler);
  },
  deleteProject: (projectId: string, deleteSource: boolean = false) =>
    ipcRenderer.invoke("delete-project", projectId, deleteSource),
  getProject: (projectId: string) =>
    ipcRenderer.invoke("get-project", projectId),
  getBatches: (projectId: string) =>
    ipcRenderer.invoke("get-batches", projectId),
  getBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("get-batch", projectId, batchId),
  deleteBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("delete-batch", projectId, batchId),
  stopBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("stop-batch", projectId, batchId),
  stopAgent: (agentId: string) =>
    ipcRenderer.invoke("stop-agent", agentId),
  getAgentTrace: (batchId: string) =>
    ipcRenderer.invoke("get-agent-trace", batchId),
  getActivity: (filters?: { projectId?: string; type?: string; since?: string }) =>
    ipcRenderer.invoke("get-activity", filters),
  getActivityStats: (since?: string) =>
    ipcRenderer.invoke("get-activity-stats", since),
  getTasks: (projectId?: string) =>
    ipcRenderer.invoke("get-tasks", projectId),
  getStorageStats: () => ipcRenderer.invoke("get-storage-stats"),
  clearScreenshots: () => ipcRenderer.invoke("clear-screenshots"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  subscribeAgentSteps: (agentId: string) =>
    ipcRenderer.invoke("subscribe-agent-steps", agentId),
  unsubscribeAgentSteps: (agentId: string) =>
    ipcRenderer.invoke("unsubscribe-agent-steps", agentId),
  onAgentStep: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("agent-step", handler);
    return () => ipcRenderer.removeListener("agent-step", handler);
  },
  onAgentStatus: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("agent-status", handler);
    return () => ipcRenderer.removeListener("agent-status", handler);
  },
  onAgentHook: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("agent-hook", handler);
    return () => ipcRenderer.removeListener("agent-hook", handler);
  },
  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onMaximizedChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window-maximized-changed", handler);
    return () => ipcRenderer.removeListener("window-maximized-changed", handler);
  },
});
