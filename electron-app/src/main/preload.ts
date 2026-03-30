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
  getAgentLogs: (agentId: string) =>
    ipcRenderer.invoke("get-agent-logs", agentId),
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
});
