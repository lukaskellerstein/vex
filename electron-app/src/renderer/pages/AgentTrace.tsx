import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Hash,
  Layers,
  CheckCircle,
  XCircle,
  Loader2,
  Bot,
} from "lucide-react";
import { AgentStepList } from "../components/project-detail/AgentStepList";
import type { AgentStep } from "../components/project-detail/AgentStepItem";

/* ─── Types ──────────────────────────────────────── */

interface TraceData {
  id: string;
  batch_id: string;
  agent_id: string;
  agent_name: string;
  agent_model: string;
  status: "running" | "completed" | "failed";
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  total_tokens: number | null;
  steps: AgentStep[];
  created_at: string;
  completed_at: string | null;
}

/* ─── Helpers ────────────────────────────────────── */

function formatDuration(ms: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number | null): string {
  if (usd == null) return "--";
  return `$${usd.toFixed(3)}`;
}

function formatTokens(n: number | null): string {
  if (n == null) return "--";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle; iconColor: string; label: string; bg: string; fg: string; border: string }
> = {
  completed: {
    icon: CheckCircle,
    iconColor: "var(--status-success)",
    label: "Completed",
    bg: "color-mix(in srgb, var(--status-success) 10%, transparent)",
    fg: "var(--status-success)",
    border: "color-mix(in srgb, var(--status-success) 20%, transparent)",
  },
  failed: {
    icon: XCircle,
    iconColor: "var(--status-error)",
    label: "Failed",
    bg: "color-mix(in srgb, var(--status-error) 10%, transparent)",
    fg: "var(--status-error)",
    border: "color-mix(in srgb, var(--status-error) 20%, transparent)",
  },
  running: {
    icon: Loader2,
    iconColor: "var(--primary)",
    label: "Running",
    bg: "color-mix(in srgb, var(--primary) 8%, transparent)",
    fg: "var(--primary)",
    border: "color-mix(in srgb, var(--primary) 20%, transparent)",
  },
};

/* ─── Component ──────────────────────────────────── */

export function AgentTrace() {
  const { id: projectId, traceId } = useParams<{ id: string; traceId: string }>();
  const navigate = useNavigate();
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;

    async function fetchTrace() {
      try {
        const data = await (window as any).electronAPI.getAgentTrace(traceId);
        if (cancelled) return;
        if (!data || data.detail) {
          setError(data?.detail ?? "Trace not found");
        } else {
          setTrace(data);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Failed to load trace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTrace();
    return () => { cancelled = true; };
  }, [traceId]);

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "12px",
          color: "var(--foreground-dim)",
        }}
      >
        <Loader2
          size={20}
          style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }}
        />
        <span style={{ fontSize: "14px" }}>Loading trace...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error / 404 state
  if (error || !trace) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "12px",
          color: "var(--foreground-dim)",
        }}
      >
        <XCircle size={40} style={{ color: "var(--status-error)" }} />
        <p style={{ fontSize: "14px", color: "var(--foreground-muted)" }}>
          {error ?? "Trace not found"}
        </p>
        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: "8px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "var(--radius)",
            fontSize: "13px",
            color: "var(--foreground-muted)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            background: "var(--surface)",
          }}
        >
          <ArrowLeft size={14} />
          Go back
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[trace.status] ?? STATUS_CONFIG.completed;
  const StatusIcon = statusCfg.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ─── Header ──────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: "48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Back button */}
            <button
              onClick={() => navigate(-1)}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius)",
                color: "var(--foreground-muted)",
                transition: "all 0.15s",
                cursor: "pointer",
                background: "none",
                border: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--foreground)";
                e.currentTarget.style.background = "var(--surface-elevated)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--foreground-muted)";
                e.currentTarget.style.background = "none";
              }}
            >
              <ArrowLeft size={16} />
            </button>

            {/* Agent info */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Bot size={16} style={{ color: "var(--primary)" }} />
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--foreground)",
                }}
              >
                {trace.agent_name}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: "var(--radius)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  background: "var(--surface-elevated)",
                  color: "var(--foreground-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {trace.agent_model}
              </span>
            </div>
          </div>

          {/* Status badge */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 500,
              background: statusCfg.bg,
              color: statusCfg.fg,
              border: `1px solid ${statusCfg.border}`,
            }}
          >
            <StatusIcon
              size={11}
              style={{
                color: statusCfg.iconColor,
                ...(trace.status === "running" ? { animation: "spin 1s linear infinite" } : {}),
              }}
            />
            {statusCfg.label}
          </span>
        </div>

        {/* Metrics row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "0 20px 12px",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
          }}
        >
          <MetricItem icon={<Clock size={12} />} label="duration" value={formatDuration(trace.total_duration_ms)} />
          <Separator />
          <MetricItem icon={<DollarSign size={12} />} label="cost" value={formatCost(trace.total_cost_usd)} />
          <Separator />
          <MetricItem icon={<Hash size={12} />} label="tokens" value={formatTokens(trace.total_tokens)} />
          <Separator />
          <MetricItem icon={<Layers size={12} />} label="steps" value={String(trace.steps.length)} />
        </div>
      </header>

      {/* ─── Body ────────────────────────────────── */}
      <AgentStepList steps={trace.steps} status={trace.status} />

      {/* Spin keyframes (shared) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Small helpers ──────────────────────────────── */

function MetricItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--foreground-muted)" }}>
      <span style={{ color: "var(--foreground-dim)", display: "flex" }}>{icon}</span>
      <span style={{ color: "var(--foreground-dim)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Separator() {
  return (
    <span style={{ color: "var(--foreground-dim)", userSelect: "none" }}>|</span>
  );
}
