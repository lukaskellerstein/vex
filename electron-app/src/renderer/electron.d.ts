export {};

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<any[]>;
      getProject: (projectId: string) => Promise<any>;
      createProject: (name: string, path: string) => Promise<any>;
      updateProject: (projectId: string, data: Record<string, unknown>) => Promise<any>;
      deleteProject: (projectId: string) => Promise<void>;
      selectFolder: () => Promise<string | null>;
      startDevServer: (projectId: string) => Promise<any>;
      stopDevServer: (projectId: string) => Promise<any>;
      getDevServerLogs: (projectId: string, offset: number) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      getAgents: () => Promise<any[]>;
      getAgentLogs: (agentId: string) => Promise<any[]>;
      getNatsStatus: () => Promise<{ healthy: boolean }>;
      getConfig: () => Promise<Record<string, string>>;
      updateConfig: (config: Record<string, unknown>) => Promise<Record<string, string>>;
      cloneGithubRepo: (url: string) => Promise<{ path: string }>;
      installDependencies: (projectPath: string) => Promise<{ success: boolean }>;
      onCloneProgress: (callback: (data: { phase: string; progress: number; message: string }) => void) => () => void;
      getBatches: (projectId: string) => Promise<any[]>;
      getBatch: (projectId: string, batchId: string) => Promise<any>;
      getAgentTrace: (batchId: string) => Promise<any>;
      getActivity: (filters?: { projectId?: string; type?: string; since?: string }) => Promise<any[]>;
      getActivityStats: (since?: string) => Promise<any>;
      getTasks: (projectId?: string) => Promise<any[]>;
      getStorageStats: () => Promise<any>;
      clearScreenshots: () => Promise<{ deleted: number }>;
      getAppInfo: () => Promise<{ version: string; electron: string; node: string; platform: string }>;
    };
  }
}
