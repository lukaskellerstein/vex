import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Layers, FileText, Bot, Check, AlertCircle } from "lucide-react";
import { FrameworkBadge } from "../components/projects/FrameworkBadge";
import { ProjectInfoPanel } from "../components/project-detail/ProjectInfoPanel";
import { BatchList } from "../components/project-detail/BatchList";
import { DevServerLogs } from "../components/project-detail/DevServerLogs";

interface ProjectData {
  id: string;
  name: string;
  path: string;
  framework?: string | null;
  styling_approach?: string | null;
  package_manager?: string | null;
  dev_command?: string | null;
  dev_port?: number | null;
  dev_server_url?: string | null;
  status?: string;
  pid?: number | null;
  started_at?: string | null;
}

interface AgentData {
  id: string;
  name: string;
  type: string;
  status: string;
  project_id: string;
  tasks_completed: number;
  tasks_failed: number;
  total_cost_usd: number;
  created_at: string;
}

interface AgentsSummary {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

type TabId = "batches" | "agents" | "logs";

/** Track which projects already had their browser opened (survives component remounts). */
const browserOpenedForProject = new Set<string>();

export function ProjectDetail() {
  const { id: projectId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("batches");
  const [batchCount, setBatchCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [lastBatchTime, setLastBatchTime] = useState<string | null>(null);


  // Agent state
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentsSummary>({ total: 0, running: 0, completed: 0, failed: 0 });

  async function fetchProject() {
    try {
      const projects = await window.electronAPI.getProjects();
      const found = Array.isArray(projects)
        ? projects.find((p: ProjectData) => p.id === projectId)
        : null;
      setProject(found ?? null);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBatchStats() {
    try {
      const batches = await window.electronAPI.getBatches(projectId);
      if (Array.isArray(batches)) {
        setBatchCount(batches.length);
        const totalActions = batches.reduce(
          (sum: number, b: { action_count?: number; actions?: unknown[] }) =>
            sum + (b.action_count ?? b.actions?.length ?? 0),
          0,
        );
        setActionCount(totalActions);
        if (batches.length > 0) {
          const sorted = [...batches].sort(
            (a: { created_at: string }, b: { created_at: string }) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          setLastBatchTime(sorted[0].created_at);
        }
      }
    } catch {
      // Silently handle
    }
  }

  async function fetchAgents() {
    try {
      const result = await window.electronAPI.getProjectAgents(projectId);
      if (result && Array.isArray(result.agents)) {
        setAgents(result.agents);
        setAgentSummary(result.summary ?? { total: 0, running: 0, completed: 0, failed: 0 });
      }
    } catch {
      // Silently handle
    }
  }

  useEffect(() => {
    fetchProject();
    fetchBatchStats();
    fetchAgents();
  }, [projectId]);

  // Poll project status while starting/running
  useEffect(() => {
    const status = project?.status;
    if (status !== "starting" && status !== "running" && status !== "stopping") return;

    const interval = setInterval(() => {
      fetchProject();
    }, 2000);

    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  // Poll agents every 3s when on agents tab
  useEffect(() => {
    if (activeTab !== "agents") return;
    const interval = setInterval(fetchAgents, 3000);
    return () => clearInterval(interval);
  }, [activeTab, projectId]);

  // Open browser once when URL becomes available (per project, survives remounts)
  useEffect(() => {
    if (project?.status === "running" && project.dev_server_url && !browserOpenedForProject.has(projectId)) {
      browserOpenedForProject.add(projectId);
      window.electronAPI.openExternal(project.dev_server_url);
    }
  }, [project?.status, project?.dev_server_url, projectId]);

  async function handleServerToggle() {
    if (!project) return;
    const status = project.status ?? "stopped";

    if (status === "running" || status === "starting") {
      await window.electronAPI.stopDevServer(projectId);
      browserOpenedForProject.delete(projectId);
    } else {
      browserOpenedForProject.delete(projectId);
      const result = await window.electronAPI.startDevServer(projectId);
      if (result?.status === "error") {
        console.error("Failed to start dev server:", result.detail);
      }
    }
    fetchProject();
  }

  function handleViewTrace(traceId: string) {
    navigate(`/project/${projectId}/trace/${traceId}`);
  }

  async function handleDeleteBatch(batchId: string) {
    try {
      await window.electronAPI.deleteBatch(projectId!, batchId);
    } catch {
      // Silently handle — batch list will refresh on next poll
    }
  }

  if (!projectId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--foreground-muted)" }}>No project selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--foreground-muted)" }}>Loading...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--foreground-muted)" }}>Project not found.</p>
      </div>
    );
  }

  const status = project.status ?? "stopped";
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "batches", label: "Batches", icon: <Layers size={14} /> },
    { id: "agents", label: `Agents${agentSummary.total > 0 ? ` (${agentSummary.total})` : ""}`, icon: <Bot size={14} /> },
    { id: "logs", label: "Dev Server Logs", icon: <FileText size={14} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: "48px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius)",
              marginRight: "10px",
              color: "var(--foreground-muted)",
              transition: "all 0.15s",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--foreground)";
              e.currentTarget.style.background = "var(--surface-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--foreground-muted)";
              e.currentTarget.style.background = "none";
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--foreground)",
              marginRight: "8px",
            }}
          >
            {project.name}
          </span>
          <FrameworkBadge framework={project.framework ?? null} />
        </div>

      </header>

      {/* Body: two columns */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ProjectInfoPanel
          project={project}
          batchCount={batchCount}
          actionCount={actionCount}
          lastBatchTime={lastBatchTime}
          onServerToggle={handleServerToggle}
        />

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Tab Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: "36px",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              paddingLeft: "20px",
              flexShrink: 0,
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    height: "36px",
                    padding: "0 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                    color: isActive ? "var(--foreground)" : "var(--foreground-dim)",
                    background: "none",
                    border: "none",
                    borderBottomStyle: "solid",
                    borderBottomWidth: "2px",
                    borderBottomColor: isActive ? "var(--primary)" : "transparent",
                  }}
                >
                  <span style={{ color: isActive ? "var(--primary)" : "var(--foreground-dim)" }}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {activeTab === "batches" && (
              <BatchList projectId={projectId} onViewTrace={handleViewTrace} onViewAgent={(agentId) => navigate(`/project/${projectId}/agent/${agentId}`)} onDeleteBatch={handleDeleteBatch} />
            )}
            {activeTab === "agents" && (
              <AgentsPanel
                agents={agents}
                summary={agentSummary}
                onViewAgent={(agentId) => navigate(`/project/${projectId}/agent/${agentId}`)}
              />
            )}
            {activeTab === "logs" && (
              <DevServerLogs
                projectId={projectId}
                isRunning={status === "running" || status === "starting"}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentsPanel({
  agents,
  summary,
  onViewAgent,
}: {
  agents: AgentData[];
  summary: AgentsSummary;
  onViewAgent: (agentId: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
      {/* Summary header */}
      {summary.total > 0 && (
        <div style={{ fontSize: "12px", color: "var(--foreground-dim)", marginBottom: "12px" }}>
          {summary.running > 0 && <span style={{ color: "var(--primary)" }}>{summary.running} running</span>}
          {summary.running > 0 && (summary.completed > 0 || summary.failed > 0) && ", "}
          {summary.completed > 0 && <span style={{ color: "var(--status-success)" }}>{summary.completed} completed</span>}
          {summary.completed > 0 && summary.failed > 0 && ", "}
          {summary.failed > 0 && <span style={{ color: "var(--status-error)" }}>{summary.failed} failed</span>}
        </div>
      )}

      {agents.length === 0 && (
        <p style={{ color: "var(--foreground-dim)", fontSize: "13px" }}>
          No agents yet. Submit a batch from the Chrome Extension to trigger agent processing.
        </p>
      )}

      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onViewAgent(agent.id)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "10px 12px", marginBottom: "4px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--surface-elevated)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Bot size={14} style={{ color: "var(--foreground-dim)" }} />
            <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--foreground)" }}>
              {agent.name}
            </span>
            <AgentStatusBadge status={agent.status} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AgentModelBadge type={agent.type} />
            <span style={{ fontSize: "11px", color: "var(--foreground-dim)" }}>
              {new Date(agent.created_at).toLocaleTimeString()}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  let color = "var(--foreground-dim)";
  let bg = "transparent";
  let icon: React.ReactNode = null;

  if (status === "running" || status === "starting") {
    color = "var(--primary)";
    bg = "hsla(217, 92%, 56%, 0.1)";
    icon = <Loader2 size={10} className="spin" />;
  } else if (status === "completed" || status === "stopped") {
    color = "var(--status-success)";
    bg = "hsla(142, 69%, 45%, 0.1)";
    icon = <Check size={10} />;
  } else if (status === "failed" || status === "error") {
    color = "var(--status-error)";
    bg = "hsla(0, 84%, 60%, 0.1)";
    icon = <AlertCircle size={10} />;
  }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      fontSize: "11px", fontWeight: 500, color, background: bg,
      padding: "2px 6px", borderRadius: "4px",
    }}>
      {icon}
      {status}
    </span>
  );
}

function AgentModelBadge({ type }: { type: string }) {
  const modelMap: Record<string, string> = {
    "claude-code-sdk": "Sonnet 4.5",
    "cli-wrapper": "CLI",
    "external": "External",
  };
  const label = modelMap[type] || type;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "9999px",
        fontSize: "11px",
        fontWeight: 500,
        background: "hsla(263, 82%, 57.5%, 0.08)",
        color: "var(--primary)",
        border: "1px solid hsla(263, 82%, 57.5%, 0.2)",
        flexShrink: 0,
      }}
    >
      <Bot size={10} />
      {label}
    </span>
  );
}
