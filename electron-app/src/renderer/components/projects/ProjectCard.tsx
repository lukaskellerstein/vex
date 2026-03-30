import React, { useState } from "react";
import { FolderOpen, Play, Square, Trash2, Clock } from "lucide-react";
import { FrameworkBadge } from "./FrameworkBadge";
import { StatusIndicator } from "./StatusIndicator";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    path: string;
    framework?: string;
    status?: string;
    lastActivityAt?: string;
  };
  onClick: (id: string) => void;
  onToggleServer?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function formatLastActivity(isoString?: string): string {
  if (!isoString) return "";
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function truncatePath(p: string, maxLen = 45): string {
  if (p.length <= maxLen) return p;
  return "..." + p.slice(p.length - maxLen + 3);
}

export function ProjectCard({ project, onClick, onToggleServer, onDelete }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const isRunning = project.status === "running";

  return (
    <div
      className="project-card"
      onClick={() => onClick(project.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        border: `1px solid ${hovered ? "var(--border-bright)" : "var(--border)"}`,
        borderRadius: "8px",
        padding: "16px",
        minHeight: "148px",
        cursor: "pointer",
        position: "relative",
        transition: "transform 200ms ease-out, border-color 150ms ease-out, box-shadow 200ms ease-out",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header: name + status */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 80px)",
          }}
          title={project.name}
        >
          {project.name}
        </span>
        <StatusIndicator status={project.status || "idle"} />
      </div>

      {/* Framework badge */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
        <FrameworkBadge framework={project.framework || null} />
      </div>

      {/* Path */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "10px" }}>
        <FolderOpen size={12} strokeWidth={1.5} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
        <span
          style={{
            fontSize: "11px",
            color: "var(--foreground-dim)",
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={project.path}
        >
          {truncatePath(project.path)}
        </span>
      </div>

      {/* Footer: last activity + quick actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        {/* Last activity */}
        {project.lastActivityAt && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Clock size={12} strokeWidth={1.5} style={{ color: "var(--foreground-disabled)" }} />
            <span style={{ fontSize: "11px", color: "var(--foreground-dim)" }}>
              {formatLastActivity(project.lastActivityAt)}
            </span>
          </div>
        )}

        {/* Quick actions - visible on hover */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms ease-out",
            marginLeft: "auto",
          }}
        >
          <button
            onClick={() => onToggleServer?.(project.id)}
            aria-label={isRunning ? "Stop server" : "Start server"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              borderRadius: "var(--radius)",
              color: "var(--foreground-muted)",
              transition: "color 150ms, background 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--foreground)";
              e.currentTarget.style.background = "var(--surface-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--foreground-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {isRunning ? <Square size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
          </button>

          <button
            onClick={() => onDelete?.(project.id)}
            aria-label="Delete project"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              borderRadius: "var(--radius)",
              color: "var(--foreground-muted)",
              transition: "color 150ms, background 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--status-error)";
              e.currentTarget.style.background = "var(--surface-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--foreground-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
