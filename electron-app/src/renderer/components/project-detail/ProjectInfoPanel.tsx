import React from "react";
import {
  FolderOpen,
  ExternalLink,
  Hash,
  Terminal,
  Cpu,
  Clock,
  Play,
  Square,
  Loader2,
} from "lucide-react";
import { FrameworkBadge } from "../projects/FrameworkBadge";
import { StatusIndicator } from "../projects/StatusIndicator";

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

interface ProjectInfoPanelProps {
  project: ProjectData;
  batchCount: number;
  actionCount: number;
  lastBatchTime: string | null;
  onServerToggle: () => void;
}

function formatUptime(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const sectionLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  color: "var(--foreground-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "6px",
};

const metaRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2px 0",
};

const metaLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--foreground-dim)",
};

const metaValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  fontWeight: 500,
  padding: "1px 6px",
  borderRadius: "2px",
  background: "var(--surface-elevated)",
  color: "var(--foreground-muted)",
};

const serverRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "3px 0",
};

const serverLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  color: "var(--foreground-dim)",
};

const serverValue: React.CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  color: "var(--foreground-muted)",
};

export function ProjectInfoPanel({
  project,
  batchCount,
  actionCount,
  lastBatchTime,
  onServerToggle,
}: ProjectInfoPanelProps) {
  const status = project.status ?? "stopped";
  const isRunning = status === "running";
  const isStarting = status === "starting";

  return (
    <div
      style={{
        width: "var(--panel-left-width)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        scrollbarWidth: "thin",
        scrollbarColor: "var(--border-bright) var(--border)",
      }}
    >
      {/* Project Identity */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
        <p style={sectionLabel}>Project Name</p>
        <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)", marginBottom: "16px" }}>
          {project.name}
        </p>

        <p style={sectionLabel}>Path</p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--foreground-muted)",
            wordBreak: "break-all",
            lineHeight: "1.5",
            marginBottom: "16px",
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
          }}
        >
          <FolderOpen size={13} style={{ flexShrink: 0, marginTop: "2px", color: "var(--foreground-dim)" }} />
          {project.path}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={metaRow}>
            <span style={metaLabel}>Framework</span>
            <FrameworkBadge framework={project.framework ?? null} />
          </div>
          {project.styling_approach && project.styling_approach !== "unknown" && (
            <div style={metaRow}>
              <span style={metaLabel}>Styling</span>
              <span style={metaValue}>{project.styling_approach}</span>
            </div>
          )}
          <div style={metaRow}>
            <span style={metaLabel}>Package Manager</span>
            <span style={metaValue}>{project.package_manager ?? "npm"}</span>
          </div>
        </div>
      </div>

      {/* Dev Server */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={sectionLabel}>Dev Server</span>
          <StatusIndicator status={status} showLabel />
        </div>

        <ServerToggleButton status={status} onClick={onServerToggle} />

        {isRunning && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
            {project.dev_server_url && (
              <div style={serverRow}>
                <ExternalLink size={12} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
                <span style={serverLabel}>URL</span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.electronAPI.openExternal(project.dev_server_url!);
                  }}
                  style={{
                    ...serverValue,
                    color: "var(--primary)",
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  {project.dev_server_url}
                </a>
              </div>
            )}
            <div style={serverRow}>
              <Hash size={12} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
              <span style={serverLabel}>Dev Port</span>
              <span style={serverValue}>{project.dev_port ?? "—"}</span>
            </div>
            <div style={serverRow}>
              <Terminal size={12} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
              <span style={serverLabel}>Dev Command</span>
              <span style={serverValue}>
                {project.dev_command ?? (project.framework === "static" ? "built-in static server" : "npm run dev")}
              </span>
            </div>
            {project.pid && (
              <div style={serverRow}>
                <Cpu size={12} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
                <span style={serverLabel}>PID</span>
                <span style={{ ...serverValue, color: "var(--foreground-dim)" }}>{project.pid}</span>
              </div>
            )}
            {project.started_at && (
              <div style={serverRow}>
                <Clock size={12} style={{ color: "var(--foreground-dim)", flexShrink: 0 }} />
                <span style={serverLabel}>Uptime</span>
                <span style={serverValue}>{formatUptime(project.started_at)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: "16px 20px" }}>
        <p style={{ ...sectionLabel, marginBottom: "12px" }}>Stats</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={metaRow}>
            <span style={{ fontSize: "13px", color: "var(--foreground-dim)" }}>Total Batches</span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>{batchCount}</span>
          </div>
          <div style={metaRow}>
            <span style={{ fontSize: "13px", color: "var(--foreground-dim)" }}>Total Actions</span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>{actionCount}</span>
          </div>
          <div style={metaRow}>
            <span style={{ fontSize: "13px", color: "var(--foreground-dim)" }}>Last Batch</span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
              {lastBatchTime ? formatRelativeTime(lastBatchTime) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServerToggleButton({ status, onClick }: { status: string; onClick: () => void }) {
  if (status === "stopped" || status === "idle" || status === "error") {
    return (
      <button
        onClick={onClick}
        style={{
          width: "100%",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          borderRadius: "var(--radius)",
          fontSize: "13px",
          fontWeight: 600,
          background: "hsla(142, 69%, 45%, 0.1)",
          border: "1px solid hsla(142, 69%, 45%, 0.3)",
          color: "var(--status-success)",
          cursor: "pointer",
          transition: "box-shadow 0.15s",
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
          width: "100%",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          borderRadius: "var(--radius)",
          fontSize: "13px",
          fontWeight: 600,
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
      onClick={onClick}
      style={{
        width: "100%",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        borderRadius: "var(--radius)",
        fontSize: "13px",
        fontWeight: 600,
        background: "hsla(0, 84%, 60%, 0.1)",
        border: "1px solid hsla(0, 84%, 60%, 0.3)",
        color: "var(--status-error)",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 12px hsla(0, 84%, 60%, 0.25)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <Square size={14} />
      Stop Server
    </button>
  );
}
