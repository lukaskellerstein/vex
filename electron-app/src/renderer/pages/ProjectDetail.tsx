import React, { useEffect, useRef, useState } from "react";
import { AgentPanel } from "../components/AgentPanel";

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  framework?: string;
  styling_approach?: string;
  package_manager?: string;
  dev_command?: string;
  dev_port?: number;
  status?: string;
  dev_server_url?: string;
  recent_batches?: Array<{ id: string; status: string; created_at: string }>;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

export function ProjectDetail({ projectId, onBack }: Props) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAgents, setShowAgents] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [portError, setPortError] = useState<string | null>(null);
  const logOffsetRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const browserOpenedRef = useRef(false);

  async function fetchProject() {
    try {
      const projects = await window.electronAPI.getProjects();
      const found = Array.isArray(projects)
        ? projects.find((p: ProjectInfo) => p.id === projectId)
        : null;
      setProject(found ?? null);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Poll logs while server is starting or running.
  useEffect(() => {
    const status = project?.status;
    if (status !== "starting" && status !== "running" && status !== "stopping") return;

    const interval = setInterval(async () => {
      try {
        const result = await window.electronAPI.getDevServerLogs(projectId, logOffsetRef.current);
        if (result?.lines?.length > 0) {
          setLogLines((prev) => [...prev, ...result.lines]);
          logOffsetRef.current = result.offset;
        }
        if (result?.portError) {
          setPortError(result.portError);
        }
        // Open browser once when URL is detected.
        if (result?.url && !browserOpenedRef.current) {
          browserOpenedRef.current = true;
          window.electronAPI.openExternal(result.url);
        }
        // Keep project status in sync.
        fetchProject();
      } catch {
        // Backend not ready yet, skip.
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  // Auto-scroll logs.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines]);

  async function handleStart() {
    // Reset log state for a new session.
    setLogLines([]);
    setPortError(null);
    logOffsetRef.current = 0;
    browserOpenedRef.current = false;
    const result = await window.electronAPI.startDevServer(projectId);
    if (result?.status === "error") {
      setLogLines([`[system] Error: ${result.detail ?? "Failed to start"}`]);
    }
    fetchProject();
  }

  async function handleStop() {
    await window.electronAPI.stopDevServer(projectId);
    browserOpenedRef.current = false;
    fetchProject();
  }

  function startRename() {
    if (!project) return;
    setEditName(project.name);
    setEditing(true);
  }

  async function submitRename() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === project?.name) {
      setEditing(false);
      return;
    }
    await window.electronAPI.updateProject(projectId, { name: trimmed });
    setEditing(false);
    fetchProject();
  }

  if (loading) return <div style={{ color: "#a0a0b8" }}>Loading...</div>;
  if (!project) return <div style={{ color: "#a0a0b8" }}>Project not found.</div>;

  const status = project.status ?? "idle";
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const isBusy = isRunning || isStarting;

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "#6c63ff",
          cursor: "pointer",
          fontSize: "14px",
          marginBottom: "16px",
        }}
      >
        &larr; Back to Projects
      </button>

      <div
        style={{
          background: "#2d2d44",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "16px",
          position: "relative",
        }}
      >
        {!editing && (
          <button
            onClick={startRename}
            title="Rename project"
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#888",
              fontSize: "14px",
              padding: "4px",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#c0c0d8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
        )}
        {editing ? (
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              style={{
                flex: 1,
                padding: "4px 8px",
                background: "#1a1a2e",
                border: "1px solid #3d3d5c",
                borderRadius: "4px",
                color: "#e0e0f0",
                fontSize: "20px",
                fontWeight: 600,
                outline: "none",
              }}
            />
            <button
              onClick={submitRename}
              style={{
                padding: "4px 12px",
                background: "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{
                padding: "4px 12px",
                background: "#3d3d5c",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>
            {project.name}
          </h2>
        )}
        <div style={{ fontSize: "13px", color: "#a0a0b8", marginBottom: "8px" }}>
          {project.path}
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {project.framework && (
            <Badge label={`Framework: ${project.framework}`} />
          )}
          {project.styling_approach && (
            <Badge label={`Styling: ${project.styling_approach}`} />
          )}
          {project.package_manager && (
            <Badge label={`PM: ${project.package_manager}`} />
          )}
          {project.dev_command && (
            <Badge label={`Cmd: ${project.dev_command}`} />
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <span style={{ fontSize: "14px" }}>Dev Server:</span>
          <span
            style={{
              color: isRunning ? "#4caf50" : isStarting ? "#ff9800" : "#888",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            {status}
          </span>
          {isRunning && project.dev_server_url ? (
            <button
              onClick={() => window.electronAPI.openExternal(project.dev_server_url!)}
              style={{
                background: "none",
                border: "none",
                color: "#6c63ff",
                cursor: "pointer",
                fontSize: "12px",
                textDecoration: "underline",
              }}
            >
              {project.dev_server_url}
            </button>
          ) : (
            !isBusy && (
              <span style={{ fontSize: "12px", color: "#666" }}>
                port {project.dev_port ?? 3000}
              </span>
            )
          )}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleStart}
            disabled={isBusy}
            style={{
              padding: "8px 16px",
              background: isBusy ? "#3d3d5c" : "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: isBusy ? "default" : "pointer",
              fontSize: "13px",
              opacity: isBusy ? 0.5 : 1,
            }}
          >
            {isStarting ? "Starting..." : "Start"}
          </button>
          <button
            onClick={handleStop}
            disabled={!isBusy}
            title="Stop dev server"
            style={{
              padding: "8px 16px",
              background: !isBusy ? "#3d3d5c" : "#f44336",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: !isBusy ? "default" : "pointer",
              fontSize: "13px",
              opacity: !isBusy ? 0.5 : 1,
            }}
          >
            Stop
          </button>
          <button
            onClick={() => {
              if (project.dev_server_url) {
                window.electronAPI.openExternal(project.dev_server_url);
              }
            }}
            disabled={!isRunning || !project.dev_server_url}
            style={{
              padding: "8px 16px",
              background: isRunning && project.dev_server_url ? "#2196f3" : "#3d3d5c",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: isRunning && project.dev_server_url ? "pointer" : "default",
              fontSize: "13px",
              opacity: isRunning && project.dev_server_url ? 1 : 0.5,
            }}
          >
            Open
          </button>
          <button
            onClick={() => setShowAgents(!showAgents)}
            style={{
              padding: "8px 16px",
              background: "#6c63ff",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            {showAgents ? "Hide Agents" : "Agent Panel"}
          </button>
        </div>

        {portError && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 14px",
              background: "#3d1c1c",
              border: "1px solid #f44336",
              borderRadius: "6px",
              color: "#f44336",
              fontSize: "13px",
            }}
          >
            {portError}
          </div>
        )}
      </div>

      {/* Terminal Output */}
      {logLines.length > 0 && (
        <div
          style={{
            background: "#1a1a2e",
            border: "1px solid #3d3d5c",
            borderRadius: "8px",
            marginBottom: "16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              background: "#2d2d44",
              borderBottom: "1px solid #3d3d5c",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#c0c0d8" }}>
              Terminal Output
            </span>
            <button
              onClick={() => { setLogLines([]); logOffsetRef.current = 0; }}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Clear
            </button>
          </div>
          <div
            style={{
              maxHeight: "300px",
              overflow: "auto",
              padding: "8px 12px",
              fontFamily: "'Fira Code', 'Consolas', monospace",
              fontSize: "12px",
              lineHeight: "1.5",
            }}
          >
            {logLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.startsWith("[err]")
                    ? "#f44336"
                    : line.startsWith("[system]")
                    ? "#ff9800"
                    : "#c0c0d8",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {project.recent_batches && project.recent_batches.length > 0 && (
        <div
          style={{
            background: "#2d2d44",
            padding: "20px",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "12px" }}>
            Recent Batches
          </h3>
          {project.recent_batches.map((batch) => (
            <div
              key={batch.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid #3d3d5c",
                fontSize: "13px",
              }}
            >
              <span>{batch.id}</span>
              <span style={{ color: "#a0a0b8" }}>{batch.status}</span>
              <span style={{ color: "#a0a0b8" }}>{batch.created_at}</span>
            </div>
          ))}
        </div>
      )}

      {showAgents && <AgentPanel />}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        background: "#3d3d5c",
        borderRadius: "4px",
        fontSize: "11px",
        color: "#c0c0d8",
      }}
    >
      {label}
    </span>
  );
}
