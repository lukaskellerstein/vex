import React from "react";
import { FolderOpen, Plus } from "lucide-react";

interface ProjectEmptyStateProps {
  onAddProject: () => void;
}

export function ProjectEmptyState({ onAddProject }: ProjectEmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "fade-in-up 0.3s ease-out",
        }}
      >
        {/* Icon */}
        <FolderOpen
          size={48}
          strokeWidth={1.2}
          style={{ color: "var(--foreground-dim)", marginBottom: "16px" }}
        />

        {/* Heading */}
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 600,
            color: "var(--foreground)",
            marginBottom: "8px",
          }}
        >
          No projects yet
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "14px",
            color: "var(--foreground-muted)",
            marginBottom: "24px",
            lineHeight: 1.5,
            maxWidth: "320px",
          }}
        >
          Add your first project to start building with AI-powered visual editing.
        </p>

        {/* CTA button */}
        <button
          onClick={onAddProject}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            height: "36px",
            padding: "0 20px",
            borderRadius: "var(--radius)",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)",
            color: "var(--primary-foreground)",
            fontSize: "13px",
            fontWeight: 600,
            transition: "transform 150ms ease-out, box-shadow 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(124, 58, 237, 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <Plus size={16} strokeWidth={1.5} />
          Add Project
        </button>
      </div>
    </div>
  );
}
