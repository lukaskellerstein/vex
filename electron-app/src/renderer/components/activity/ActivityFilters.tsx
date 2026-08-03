import { ChevronDown, Search, X } from "lucide-react";
import type React from "react";

export type EventTypeFilter = "all" | "batch" | "task" | "agent" | "server";

export interface ActivityFiltersState {
  projectId: string;
  eventType: EventTypeFilter;
  search: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ActivityFiltersProps {
  filters: ActivityFiltersState;
  onFiltersChange: (filters: ActivityFiltersState) => void;
  projects: ProjectOption[];
  resultCount: number;
}

export function ActivityFilters({
  filters,
  onFiltersChange,
  projects,
  resultCount,
}: ActivityFiltersProps) {
  const isFiltered =
    filters.projectId !== "all" || filters.eventType !== "all" || filters.search !== "";

  function handleClear() {
    onFiltersChange({ projectId: "all", eventType: "all", search: "" });
  }

  return (
    <div
      style={{
        height: "44px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexShrink: 0,
      }}
    >
      {/* Project filter */}
      <span style={labelStyle}>Project:</span>
      <SelectWrapper>
        <select
          value={filters.projectId}
          onChange={(e) => onFiltersChange({ ...filters, projectId: e.target.value })}
          style={{ ...selectStyle, minWidth: "160px" }}
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          style={{
            position: "absolute",
            right: 8,
            pointerEvents: "none",
            color: "var(--foreground-muted)",
          }}
        />
      </SelectWrapper>

      {/* Event type filter */}
      <span style={labelStyle}>Type:</span>
      <SelectWrapper>
        <select
          value={filters.eventType}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              eventType: e.target.value as EventTypeFilter,
            })
          }
          style={{ ...selectStyle, minWidth: "140px" }}
        >
          <option value="all">All Types</option>
          <option value="batch">Batch Events</option>
          <option value="task">Task Events</option>
          <option value="agent">Agent Events</option>
          <option value="server">Server Events</option>
        </select>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          style={{
            position: "absolute",
            right: 8,
            pointerEvents: "none",
            color: "var(--foreground-muted)",
          }}
        />
      </SelectWrapper>

      {/* Text search */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search
          size={14}
          strokeWidth={1.5}
          style={{
            position: "absolute",
            left: 8,
            pointerEvents: "none",
            color: "var(--foreground-dim)",
          }}
        />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search events..."
          style={{
            height: "28px",
            width: "200px",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            paddingLeft: "28px",
            paddingRight: "10px",
            fontSize: "12px",
            fontFamily: "var(--font-ui)",
            color: "var(--foreground)",
            outline: "none",
          }}
        />
      </div>

      {/* Clear filters */}
      {isFiltered && (
        <button
          onClick={handleClear}
          style={{
            marginLeft: "auto",
            height: "26px",
            padding: "0 8px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "transparent",
            cursor: "pointer",
            fontSize: "12px",
            fontFamily: "var(--font-ui)",
            color: "var(--foreground-muted)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            transition: "color 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--status-error)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--foreground-muted)";
          }}
        >
          <X size={12} strokeWidth={1.5} />
          Clear
        </button>
      )}

      {/* Result count */}
      <span
        style={{
          marginLeft: isFiltered ? "0" : "auto",
          fontSize: "11px",
          fontFamily: "var(--font-ui)",
          color: "var(--foreground-dim)",
          flexShrink: 0,
        }}
      >
        {resultCount} events
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  color: "var(--foreground-dim)",
  fontFamily: "var(--font-ui)",
  letterSpacing: "0.06em",
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  height: "28px",
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0 28px 0 10px",
  fontSize: "12px",
  fontFamily: "var(--font-ui)",
  color: "var(--foreground-muted)",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  cursor: "pointer",
};

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>{children}</div>
  );
}
