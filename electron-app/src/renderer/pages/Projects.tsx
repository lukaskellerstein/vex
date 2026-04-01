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
  agentCount?: number;
  agentRunningSeconds?: number;
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

const FAKE_PROJECTS: Project[] = [
  { id: "fake-1", name: "acme-dashboard", path: "/home/lukas/Projects/acme-dashboard", framework: "Next.js", status: "running", lastActivityAt: "2026-03-31T09:12:00Z", agentCount: 3, agentRunningSeconds: 252 },
  { id: "fake-2", name: "design-system", path: "/home/lukas/Projects/design-system", framework: "React + Storybook", status: "running", lastActivityAt: "2026-03-31T10:05:00Z", agentCount: 2, agentRunningSeconds: 723 },
  { id: "fake-3", name: "shopfront-web", path: "/home/lukas/Projects/shopfront-web", framework: "Nuxt", status: "running", lastActivityAt: "2026-03-31T08:30:00Z", agentCount: 5, agentRunningSeconds: 107 },
  { id: "fake-4", name: "portfolio-site", path: "/home/lukas/Projects/portfolio-site", framework: "Astro", status: "stopped", lastActivityAt: "2026-03-29T14:20:00Z", agentCount: 0 },
  { id: "fake-5", name: "admin-panel", path: "/home/lukas/Projects/admin-panel", framework: "Angular", status: "running", lastActivityAt: "2026-03-28T11:00:00Z", agentCount: 1, agentRunningSeconds: 511 },
  { id: "fake-6", name: "landing-page-v2", path: "/home/lukas/Projects/landing-page-v2", framework: "Svelte", status: "stopped", lastActivityAt: "2026-03-27T16:30:00Z", agentCount: 0 },
  { id: "fake-7", name: "blog-platform", path: "/home/lukas/Projects/blog-platform", framework: "Remix", status: "running", lastActivityAt: "2026-03-26T09:15:00Z", agentCount: 4, agentRunningSeconds: 1338 },
  { id: "fake-8", name: "docs-site", path: "/home/lukas/Projects/docs-site", framework: "VitePress", status: "stopped", lastActivityAt: "2026-03-25T20:00:00Z", agentCount: 0 },
  { id: "fake-9", name: "crm-frontend", path: "/home/lukas/Projects/crm-frontend", framework: "Vue.js", status: "stopped", lastActivityAt: "2026-03-24T13:45:00Z", agentCount: 0 },
  { id: "fake-10", name: "booking-app", path: "/home/lukas/Projects/booking-app", framework: "SolidJS", status: "running", lastActivityAt: "2026-03-23T18:00:00Z", agentCount: 2, agentRunningSeconds: 45 },
];

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
      const real = Array.isArray(data) ? data : [];
      setProjects([...real, ...FAKE_PROJECTS]);
    } catch {
      setProjects(FAKE_PROJECTS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
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
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      background: "radial-gradient(ellipse at 20% 0%, hsla(263, 60%, 20%, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, hsla(217, 60%, 15%, 0.3) 0%, transparent 50%), radial-gradient(ellipse at 95% 95%, hsla(160, 50%, 14%, 0.35) 0%, transparent 45%), var(--background)",
    }}>
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
