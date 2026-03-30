import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<any>;
      selectFolder: () => Promise<string | null>;
      createProject: (name: string, path: string) => Promise<any>;
      updateProject: (id: string, data: Record<string, unknown>) => Promise<any>;
      startDevServer: (id: string) => Promise<any>;
      stopDevServer: (id: string) => Promise<any>;
      getDevServerLogs: (id: string, offset: number) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      getAgents: () => Promise<any>;
      getAgentLogs: (id: string) => Promise<any>;
      getNatsStatus: () => Promise<any>;
      getConfig: () => Promise<any>;
      updateConfig: (config: Record<string, unknown>) => Promise<any>;
    };
  }
}

interface Project {
  id: string;
  name: string;
  path: string;
  framework?: string;
  status?: string;
}

interface Props {
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  running: "#4caf50",
  idle: "#888",
  error: "#f44336",
};

export function ProjectList({ onSelect }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  async function fetchProjects() {
    try {
      const data = await window.electronAPI.getProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function handleSelectFolder() {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setPendingPath(path);
      // Pre-fill with folder name as suggestion.
      const parts = path.split("/");
      setProjectName(parts[parts.length - 1] || "");
    }
  }

  async function handleCreateProject() {
    if (!pendingPath || !projectName.trim()) return;
    const result = await window.electronAPI.createProject(projectName.trim(), pendingPath);
    if (result) {
      setPendingPath(null);
      setProjectName("");
      fetchProjects();
    }
  }

  function handleCancelAdd() {
    setPendingPath(null);
    setProjectName("");
  }

  function truncatePath(p: string, maxLen = 50): string {
    if (p.length <= maxLen) return p;
    return "..." + p.slice(p.length - maxLen + 3);
  }

  if (loading) {
    return <div style={{ color: "#a0a0b8" }}>Loading projects...</div>;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 600 }}>Projects</h2>
        <button
          onClick={handleSelectFolder}
          style={{
            padding: "8px 16px",
            background: "#6c63ff",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Add Project
        </button>
      </div>

      {pendingPath && (
        <div
          style={{
            background: "#2d2d44",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#a0a0b8", marginBottom: "8px" }}>
            {pendingPath}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              placeholder="Project name"
              autoFocus
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "#1a1a2e",
                border: "1px solid #3d3d5c",
                borderRadius: "6px",
                color: "#e0e0f0",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim()}
              style={{
                padding: "8px 16px",
                background: projectName.trim() ? "#4caf50" : "#3d3d5c",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: projectName.trim() ? "pointer" : "default",
                fontSize: "13px",
              }}
            >
              Create
            </button>
            <button
              onClick={handleCancelAdd}
              style={{
                padding: "8px 16px",
                background: "#3d3d5c",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div style={{ color: "#a0a0b8", textAlign: "center", marginTop: "60px" }}>
          No projects yet. Click "Add Project" to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onSelect(project.id)}
              style={{
                background: "#2d2d44",
                padding: "16px",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#363652")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#2d2d44")
              }
            >
              <div>
                <div style={{ fontSize: "16px", fontWeight: 500 }}>
                  {project.name}
                </div>
                <div style={{ fontSize: "12px", color: "#a0a0b8", marginTop: "4px" }}>
                  {truncatePath(project.path)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {project.framework && (
                  <span
                    style={{
                      padding: "3px 8px",
                      background: "#3d3d5c",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#c0c0d8",
                    }}
                  >
                    {project.framework}
                  </span>
                )}
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: statusColors[project.status ?? "idle"] ?? "#888",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
