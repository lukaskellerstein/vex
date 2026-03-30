import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Square, Loader2, Layers, FileText } from "lucide-react";
import { FrameworkBadge } from "../components/projects/FrameworkBadge";
import { StatusIndicator } from "../components/projects/StatusIndicator";
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

type TabId = "batches" | "logs";

export function ProjectDetail() {
  const { id: projectId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("batches");
  const [batchCount, setBatchCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [lastBatchTime, setLastBatchTime] = useState<string | null>(null);
  const browserOpenedRef = useRef(false);

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

  useEffect(() => {
    fetchProject();
    fetchBatchStats();
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

  // Open browser once when URL becomes available
  useEffect(() => {
    if (project?.status === "running" && project.dev_server_url && !browserOpenedRef.current) {
      browserOpenedRef.current = true;
      window.electronAPI.openExternal(project.dev_server_url);
    }
  }, [project?.status, project?.dev_server_url]);

  async function handleServerToggle() {
    if (!project) return;
    const status = project.status ?? "stopped";

    if (status === "running" || status === "starting") {
      await window.electronAPI.stopDevServer(projectId);
      browserOpenedRef.current = false;
    } else {
      browserOpenedRef.current = false;
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

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <StatusIndicator status={status} showLabel />
          <ServerHeaderButton status={status} onToggle={handleServerToggle} />
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
              <BatchList projectId={projectId} onViewTrace={handleViewTrace} />
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

function ServerHeaderButton({ status, onToggle }: { status: string; onToggle: () => void }) {
  const btnBase: React.CSSProperties = {
    height: "30px",
    padding: "0 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    borderRadius: "var(--radius)",
    fontSize: "13px",
    fontWeight: 600,
    transition: "all 0.15s",
    cursor: "pointer",
    border: "none",
  };

  if (status === "stopped" || status === "idle" || status === "error") {
    return (
      <button
        onClick={onToggle}
        style={{
          ...btnBase,
          background: "hsla(142, 69%, 45%, 0.1)",
          border: "1px solid hsla(142, 69%, 45%, 0.3)",
          color: "var(--status-success)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 12px hsla(142, 69%, 45%, 0.25)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
      >
        <Play size={14} />
        Start Server
      </button>
    );
  }

  if (status === "starting") {
    return (
      <button
        disabled
        style={{
          ...btnBase,
          background: "hsla(38, 92%, 50%, 0.1)",
          border: "1px solid hsla(38, 92%, 50%, 0.3)",
          color: "var(--status-warning)",
          opacity: 0.8,
          cursor: "not-allowed",
        }}
      >
        <Loader2 size={14} className="spin" />
        Starting...
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      style={{
        ...btnBase,
        background: "hsla(0, 84%, 60%, 0.1)",
        border: "1px solid hsla(0, 84%, 60%, 0.3)",
        color: "var(--status-error)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 12px hsla(0, 84%, 60%, 0.25)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <Square size={14} />
      Stop Server
    </button>
  );
}
