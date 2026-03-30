import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { ProjectCard } from "../components/projects/ProjectCard";
import { ProjectListHeader } from "../components/projects/ProjectListHeader";
import { ProjectEmptyState } from "../components/projects/ProjectEmptyState";

interface Project {
  id: string;
  name: string;
  path: string;
  framework?: string;
  status?: string;
  lastActivityAt?: string;
}

type ViewMode = "grid" | "list";

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

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

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.framework && p.framework.toLowerCase().includes(q)) ||
        p.path.toLowerCase().includes(q),
    );
  }, [projects, searchQuery]);

  async function handleToggleServer(id: string) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    try {
      if (project.status === "running") {
        await window.electronAPI.stopDevServer(id);
      } else {
        await window.electronAPI.startDevServer(id);
      }
      fetchProjects();
    } catch {
      // Server toggle failed silently; refresh to show current state
      fetchProjects();
    }
  }

  async function handleDelete(id: string) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    const confirmed = window.confirm(`Delete project "${project.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await window.electronAPI.updateProject(id, { deleted: true });
      fetchProjects();
    } catch {
      fetchProjects();
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--foreground-muted)",
        }}
      >
        Loading projects...
      </div>
    );
  }

  const hasProjects = projects.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {hasProjects ? (
        <>
          <ProjectListHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onAddProject={() => setShowAddDialog(true)}
          />

          <div style={{ flex: 1, overflow: "auto" }}>
            {filtered.length > 0 ? (
              <div
                style={
                  viewMode === "grid"
                    ? {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "16px",
                        padding: "20px",
                      }
                    : {
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "20px",
                      }
                }
              >
                {filtered.map((project, index) => (
                  <div
                    key={project.id}
                    style={{
                      animation: `fade-in-up 0.3s ease-out ${index * 0.04}s both`,
                    }}
                  >
                    <ProjectCard
                      project={project}
                      onClick={(id) => navigate(`/project/${id}`)}
                      onToggleServer={handleToggleServer}
                      onDelete={handleDelete}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  textAlign: "center",
                  padding: "0 32px",
                }}
              >
                <p style={{ fontSize: "14px", color: "var(--foreground-dim)" }}>
                  No projects match &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <ProjectEmptyState onAddProject={() => setShowAddDialog(true)} />
      )}

      {showAddDialog && (
        <AddProjectDialog
          onClose={() => setShowAddDialog(false)}
          onProjectCreated={() => {
            setShowAddDialog(false);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}
