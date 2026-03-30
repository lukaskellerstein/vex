import React from "react";
import { Search, Grid3X3, List, Plus } from "lucide-react";

type ViewMode = "grid" | "list";

interface ProjectListHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAddProject: () => void;
}

export function ProjectListHeader({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onAddProject,
}: ProjectListHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "48px",
        padding: "0 20px",
        flexShrink: 0,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Left: Search + View Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Search input */}
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            strokeWidth={1.5}
            style={{
              position: "absolute",
              left: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--foreground-dim)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "240px",
              height: "32px",
              paddingLeft: "28px",
              paddingRight: "12px",
              fontSize: "13px",
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--foreground)",
            }}
          />
        </div>

        {/* View toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            padding: "2px",
            borderRadius: "var(--radius)",
            background: "var(--surface-elevated)",
          }}
        >
          <ViewToggleButton
            active={viewMode === "grid"}
            onClick={() => onViewModeChange("grid")}
            label="Grid view"
          >
            <Grid3X3 size={16} strokeWidth={1.5} />
          </ViewToggleButton>
          <ViewToggleButton
            active={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
            label="List view"
          >
            <List size={16} strokeWidth={1.5} />
          </ViewToggleButton>
        </div>
      </div>

      {/* Right: Add Project */}
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
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "26px",
        height: "26px",
        borderRadius: "var(--radius)",
        background: active ? "var(--surface-hover)" : "transparent",
        color: active ? "var(--foreground)" : "var(--foreground-dim)",
        transition: "color 150ms, background 150ms",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "var(--foreground-muted)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--foreground-dim)";
      }}
    >
      {children}
    </button>
  );
}
