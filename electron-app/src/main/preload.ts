import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getProjects: () => ipcRenderer.invoke("get-projects"),
  getModels: () => ipcRenderer.invoke("get-models"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  createProject: (name: string, path: string) => ipcRenderer.invoke("create-project", name, path),
  updateProject: (projectId: string, data: Record<string, unknown>) =>
    ipcRenderer.invoke("update-project", projectId, data),
  startDevServer: (projectId: string) => ipcRenderer.invoke("start-dev-server", projectId),
  stopDevServer: (projectId: string) => ipcRenderer.invoke("stop-dev-server", projectId),
  getDevServerLogs: (projectId: string, offset: number) =>
    ipcRenderer.invoke("get-dev-server-logs", projectId, offset),
  killProjectPort: (projectId: string) => ipcRenderer.invoke("kill-project-port", projectId),
  resolveDevPort: (projectId: string) => ipcRenderer.invoke("resolve-dev-port", projectId),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  getAgents: () => ipcRenderer.invoke("get-agents"),
  getProjectAgents: (projectId: string) => ipcRenderer.invoke("get-project-agents", projectId),
  getBatchTasks: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("get-batch-tasks", projectId, batchId),
  getAgentSteps: (agentId: string) => ipcRenderer.invoke("get-agent-steps", agentId),
  getAgentLogs: (agentId: string) => ipcRenderer.invoke("get-agent-logs", agentId),
  getAgentTraceByAgent: (agentId: string) =>
    ipcRenderer.invoke("get-agent-trace-by-agent", agentId),
  getAgentSubagents: (agentId: string) => ipcRenderer.invoke("get-agent-subagents", agentId),
  getSubagentTranscript: (agentId: string, subagentId: string) =>
    ipcRenderer.invoke("get-subagent-transcript", agentId, subagentId),
  getNatsStatus: () => ipcRenderer.invoke("get-nats-status"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config: Record<string, unknown>) => ipcRenderer.invoke("update-config", config),
  cloneGithubRepo: (url: string) => ipcRenderer.invoke("clone-github-repo", url),
  installDependencies: (projectPath: string) =>
    ipcRenderer.invoke("install-dependencies", projectPath),
  onCloneProgress: (
    callback: (data: { phase: string; progress: number; message: string }) => void,
  ) => {
    const handler = (_event: unknown, data: { phase: string; progress: number; message: string }) =>
      callback(data);
    ipcRenderer.on("clone-progress", handler);
    return () => ipcRenderer.removeListener("clone-progress", handler);
  },
  deleteProject: (projectId: string, deleteSource: boolean = false) =>
    ipcRenderer.invoke("delete-project", projectId, deleteSource),
  getProject: (projectId: string) => ipcRenderer.invoke("get-project", projectId),
  getBatches: (projectId: string) => ipcRenderer.invoke("get-batches", projectId),
  getBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("get-batch", projectId, batchId),
  deleteBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("delete-batch", projectId, batchId),
  stopBatch: (projectId: string, batchId: string) =>
    ipcRenderer.invoke("stop-batch", projectId, batchId),
  stopAgent: (agentId: string) => ipcRenderer.invoke("stop-agent", agentId),
  continueAgent: (agentId: string, message: string) =>
    ipcRenderer.invoke("continue-agent", agentId, message),
  getAgentTrace: (batchId: string) => ipcRenderer.invoke("get-agent-trace", batchId),
  getActivity: (filters?: { projectId?: string; type?: string; since?: string }) =>
    ipcRenderer.invoke("get-activity", filters),
  getActivityStats: (since?: string) => ipcRenderer.invoke("get-activity-stats", since),
  getTasks: (projectId?: string) => ipcRenderer.invoke("get-tasks", projectId),
  getStorageStats: () => ipcRenderer.invoke("get-storage-stats"),
  clearScreenshots: () => ipcRenderer.invoke("clear-screenshots"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  subscribeAgentSteps: (agentId: string) => ipcRenderer.invoke("subscribe-agent-steps", agentId),
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
  // Broadcast event subscriptions
  subscribeProjectEvents: () => ipcRenderer.invoke("subscribe-project-events"),
  unsubscribeProjectEvents: () => ipcRenderer.invoke("unsubscribe-project-events"),
  onProjectEvent: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("project-event", handler);
    return () => ipcRenderer.removeListener("project-event", handler);
  },
  subscribeBatchEvents: () => ipcRenderer.invoke("subscribe-batch-events"),
  unsubscribeBatchEvents: () => ipcRenderer.invoke("unsubscribe-batch-events"),
  onBatchEvent: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("batch-event", handler);
    return () => ipcRenderer.removeListener("batch-event", handler);
  },
  subscribeActivityEvents: () => ipcRenderer.invoke("subscribe-activity-events"),
  unsubscribeActivityEvents: () => ipcRenderer.invoke("unsubscribe-activity-events"),
  onActivityEvent: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_event: unknown, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on("activity-event", handler);
    return () => ipcRenderer.removeListener("activity-event", handler);
  },
  onNatsReconnected: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("nats-reconnected", handler);
    return () => ipcRenderer.removeListener("nats-reconnected", handler);
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
