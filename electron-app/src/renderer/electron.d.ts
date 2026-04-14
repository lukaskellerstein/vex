export {};

declare global {
  interface SubagentMetadata {
    id: string;
    parent_agent_id: string;
    subagent_id: string;
    subagent_type: string;
    description: string | null;
    transcript_path: string | null;
    started_at: string;
    completed_at: string | null;
  }

  interface SubagentTranscriptResponse {
    subagent: SubagentMetadata;
    steps: Array<{
      id: string;
      sequence_index: number;
      type: string;
      content: string | null;
      metadata: Record<string, unknown> | null;
      duration_ms: number | null;
      token_count: number | null;
      created_at: string;
    }>;
    prompt: string | null;
    duration_ms: number | null;
    skipped_lines?: number;
  }

  interface Window {
    electronAPI: {
      getProjects: () => Promise<any[]>;
      getProject: (projectId: string) => Promise<any>;
      createProject: (name: string, path: string) => Promise<any>;
      updateProject: (projectId: string, data: Record<string, unknown>) => Promise<any>;
      deleteProject: (projectId: string, deleteSource?: boolean) => Promise<void>;
      selectFolder: () => Promise<string | null>;
      startDevServer: (projectId: string) => Promise<any>;
      stopDevServer: (projectId: string) => Promise<any>;
      getDevServerLogs: (projectId: string, offset: number) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      getAgents: () => Promise<any[]>;
      getProjectAgents: (projectId: string) => Promise<any>;
      getBatchTasks: (projectId: string, batchId: string) => Promise<any>;
      getAgentSteps: (agentId: string) => Promise<any>;
      getAgentLogs: (agentId: string) => Promise<any[]>;
      getAgentTraceByAgent: (agentId: string) => Promise<any>;
      getAgentSubagents: (agentId: string) => Promise<SubagentMetadata[]>;
      getSubagentTranscript: (agentId: string, subagentId: string) => Promise<SubagentTranscriptResponse>;
      getNatsStatus: () => Promise<{ healthy: boolean }>;
      getConfig: () => Promise<Record<string, string>>;
      updateConfig: (config: Record<string, unknown>) => Promise<Record<string, string>>;
      cloneGithubRepo: (url: string) => Promise<{ path: string }>;
      installDependencies: (projectPath: string) => Promise<{ success: boolean }>;
      onCloneProgress: (callback: (data: { phase: string; progress: number; message: string }) => void) => () => void;
      getBatches: (projectId: string) => Promise<any[]>;
      getBatch: (projectId: string, batchId: string) => Promise<any>;
      deleteBatch: (projectId: string, batchId: string) => Promise<void>;
      stopBatch: (projectId: string, batchId: string) => Promise<any>;
      stopAgent: (agentId: string) => Promise<any>;
      continueAgent: (agentId: string, message: string) => Promise<any>;
      getAgentTrace: (batchId: string) => Promise<any>;
      getActivity: (filters?: { projectId?: string; type?: string; since?: string }) => Promise<any[]>;
      getActivityStats: (since?: string) => Promise<any>;
      getTasks: (projectId?: string) => Promise<any[]>;
      getStorageStats: () => Promise<any>;
      clearScreenshots: () => Promise<{ deleted: number }>;
      getAppInfo: () => Promise<{ version: string; electron: string; node: string; platform: string }>;
      subscribeAgentSteps: (agentId: string) => Promise<{ ok: boolean; error?: string }>;
      unsubscribeAgentSteps: (agentId: string) => Promise<{ ok: boolean }>;
      onAgentStep: (callback: (data: Record<string, unknown>) => void) => () => void;
      onAgentStatus: (callback: (data: Record<string, unknown>) => void) => () => void;
      onAgentHook: (callback: (data: Record<string, unknown>) => void) => () => void;
      // Broadcast event subscriptions
      subscribeProjectEvents: () => Promise<{ ok: boolean; error?: string }>;
      unsubscribeProjectEvents: () => Promise<{ ok: boolean }>;
      onProjectEvent: (callback: (data: Record<string, unknown>) => void) => () => void;
      subscribeBatchEvents: () => Promise<{ ok: boolean; error?: string }>;
      unsubscribeBatchEvents: () => Promise<{ ok: boolean }>;
      onBatchEvent: (callback: (data: Record<string, unknown>) => void) => () => void;
      subscribeActivityEvents: () => Promise<{ ok: boolean; error?: string }>;
      unsubscribeActivityEvents: () => Promise<{ ok: boolean }>;
      onActivityEvent: (callback: (data: Record<string, unknown>) => void) => () => void;
      // Window controls
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
