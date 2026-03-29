import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<any>;
      addProject: () => Promise<any>;
      startDevServer: (id: string) => Promise<any>;
      stopDevServer: (id: string) => Promise<any>;
      getAgents: () => Promise<any>;
      getAgentLogs: (id: string) => Promise<any>;
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

  async function handleAdd() {
    const result = await window.electronAPI.addProject();
    if (result) {
      fetchProjects();
    }
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
          onClick={handleAdd}
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
