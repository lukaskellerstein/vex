import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
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

function DeleteProjectDialog({
  project,
  onDelete,
  onCancel,
}: {
  project: Project;
  onDelete: (deleteSource: boolean) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";
    el.style.transition = "opacity 250ms ease-out, transform 250ms ease-out";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "scale(1)";
    });
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(13,14,20,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--glass-border)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          padding: "24px",
          width: "400px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <AlertTriangle
          size={24}
          style={{ color: "var(--status-error)", marginBottom: "12px" }}
          strokeWidth={1.5}
        />
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--foreground)",
            textAlign: "center",
            letterSpacing: "-0.02em",
            marginBottom: "8px",
          }}
        >
          Delete project &ldquo;{project.name}&rdquo;?
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "var(--foreground-muted)",
            textAlign: "center",
            lineHeight: "1.5",
            marginBottom: "6px",
          }}
        >
          This will remove the project from Vex and delete all associated data (batches, traces, screenshots).
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "var(--foreground-dim)",
            textAlign: "center",
            lineHeight: "1.4",
            marginBottom: "20px",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {project.path}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
          <button
            onClick={() => onDelete(false)}
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--primary-foreground)",
              background: "var(--status-error)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Remove from Vex
          </button>
          <button
            onClick={() => onDelete(true)}
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--primary-foreground)",
              background: "#7c2d12",
              border: "none",
              cursor: "pointer",
            }}
          >
            Delete files from disk too
          </button>
          <button
            onClick={onCancel}
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--foreground-muted)",
              background: "transparent",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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

  function handleDelete(id: string) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    setDeleteTarget(project);
  }

  async function confirmDelete(deleteSource: boolean) {
    if (!deleteTarget) return;
    try {
      await window.electronAPI.deleteProject(deleteTarget.id, deleteSource);
    } catch {
      // ignore
    }
    setDeleteTarget(null);
    fetchProjects();
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

      {deleteTarget && (
        <DeleteProjectDialog
          project={deleteTarget}
          onDelete={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
