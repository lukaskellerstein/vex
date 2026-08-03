import { CheckCircle, GitFork, Loader2 } from "lucide-react";

interface SubagentInfo {
  id: string;
  subagent_id: string;
  subagent_type: string;
  description: string | null;
  started_at: string;
  completed_at: string | null;
}

interface SubagentListProps {
  subagents: SubagentInfo[];
  onSubagentClick: (subagent: SubagentInfo) => void;
}

export function SubagentList({ subagents, onSubagentClick }: SubagentListProps) {
  if (subagents.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 20px 12px",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--foreground-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        <GitFork size={11} />
        Subagents
      </span>

      {subagents.map((sub) => {
        const isRunning = sub.completed_at == null;
        const label = sub.description
          ? `${sub.subagent_type}: ${sub.description.length > 40 ? sub.description.slice(0, 40) + "..." : sub.description}`
          : sub.subagent_type;

        return (
          <button
            key={sub.id}
            onClick={() => onSubagentClick(sub)}
            title={sub.description ?? sub.subagent_type}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: "var(--surface-elevated)",
              color: "var(--foreground-muted)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--primary)";
              e.currentTarget.style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--foreground-muted)";
            }}
          >
            {isRunning ? (
              <Loader2
                size={10}
                style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }}
              />
            ) : (
              <CheckCircle size={10} style={{ color: "var(--status-success)" }} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
