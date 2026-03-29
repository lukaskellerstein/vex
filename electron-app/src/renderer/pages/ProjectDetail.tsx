import React, { useEffect, useState } from "react";
import { AgentPanel } from "../components/AgentPanel";

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  framework?: string;
  styling?: string;
  package_manager?: string;
  dev_server_status?: string;
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

  async function handleStart() {
    await window.electronAPI.startDevServer(projectId);
    fetchProject();
  }

  async function handleStop() {
    await window.electronAPI.stopDevServer(projectId);
    fetchProject();
  }

  if (loading) return <div style={{ color: "#a0a0b8" }}>Loading...</div>;
  if (!project) return <div style={{ color: "#a0a0b8" }}>Project not found.</div>;

  const isRunning = project.dev_server_status === "running";

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
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>
          {project.name}
        </h2>
        <div style={{ fontSize: "13px", color: "#a0a0b8", marginBottom: "8px" }}>
          {project.path}
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {project.framework && (
            <Badge label={`Framework: ${project.framework}`} />
          )}
          {project.styling && (
            <Badge label={`Styling: ${project.styling}`} />
          )}
          {project.package_manager && (
            <Badge label={`PM: ${project.package_manager}`} />
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
              color: isRunning ? "#4caf50" : "#888",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            {project.dev_server_status ?? "idle"}
          </span>
          {isRunning && project.dev_server_url && (
            <span style={{ fontSize: "12px", color: "#6c63ff" }}>
              {project.dev_server_url}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleStart}
            disabled={isRunning}
            style={{
              padding: "8px 16px",
              background: isRunning ? "#3d3d5c" : "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: isRunning ? "default" : "pointer",
              fontSize: "13px",
              opacity: isRunning ? 0.5 : 1,
            }}
          >
            Start
          </button>
          <button
            onClick={handleStop}
            disabled={!isRunning}
            style={{
              padding: "8px 16px",
              background: !isRunning ? "#3d3d5c" : "#f44336",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: !isRunning ? "default" : "pointer",
              fontSize: "13px",
              opacity: !isRunning ? 0.5 : 1,
            }}
          >
            Stop
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
      </div>

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
