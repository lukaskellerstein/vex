import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getProjects: () => ipcRenderer.invoke("get-projects"),
  addProject: () => ipcRenderer.invoke("add-project"),
  startDevServer: (projectId: string) =>
    ipcRenderer.invoke("start-dev-server", projectId),
  stopDevServer: (projectId: string) =>
    ipcRenderer.invoke("stop-dev-server", projectId),
  getAgents: () => ipcRenderer.invoke("get-agents"),
  getAgentLogs: (agentId: string) =>
    ipcRenderer.invoke("get-agent-logs", agentId),
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("update-config", config),
});
