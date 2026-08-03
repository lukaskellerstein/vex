import { Bot, CheckCircle2, DollarSign, Layers, XCircle } from "lucide-react";
import type React from "react";

export interface ActivityStatsData {
  completed_batches: number;
  failed_batches: number;
  total_actions: number;
  active_agents: number;
  total_cost_usd: number;
}

interface ActivityStatsProps {
  stats: ActivityStatsData;
}

export function ActivityStats({ stats }: ActivityStatsProps) {
  return (
    <div
      style={{
        height: "52px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: "32px",
        flexShrink: 0,
      }}
    >
      <StatItem
        icon={<CheckCircle2 size={14} strokeWidth={1.5} />}
        iconColor="var(--status-success)"
        value={String(stats.completed_batches)}
        label="Completed"
      />
      <Divider />
      <StatItem
        icon={<XCircle size={14} strokeWidth={1.5} />}
        iconColor="var(--status-error)"
        value={String(stats.failed_batches)}
        label="Failed"
      />
      <Divider />
      <StatItem
        icon={<Layers size={14} strokeWidth={1.5} />}
        iconColor="var(--status-warning)"
        value={String(stats.total_actions)}
        label="Actions"
      />
      <Divider />
      <StatItem
        icon={<Bot size={14} strokeWidth={1.5} />}
        iconColor="var(--status-success)"
        value={String(stats.active_agents)}
        label="Active agents"
      />
      <Divider />
      <StatItem
        icon={<DollarSign size={14} strokeWidth={1.5} />}
        iconColor="var(--foreground-muted)"
        value={`$${stats.total_cost_usd.toFixed(2)}`}
        label="Total cost"
      />
    </div>
  );
}

interface StatItemProps {
  icon: React.ReactNode;
  iconColor: string;
  value: string;
  label: string;
}

function StatItem({ icon, iconColor, value, label }: StatItemProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ flexShrink: 0, display: "flex", color: iconColor }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--foreground)",
            fontFamily: "var(--font-ui)",
            lineHeight: 1.2,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--foreground-dim)",
            fontFamily: "var(--font-ui)",
            lineHeight: 1.3,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>;
}
