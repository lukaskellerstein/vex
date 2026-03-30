import React, { useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface BatchAction {
  id: string;
  type: string;
  selector?: string;
  description?: string;
  before_value?: string;
  after_value?: string;
}

interface Batch {
  id: string;
  status: string;
  page_url?: string;
  actions?: BatchAction[];
  action_count?: number;
  duration_ms?: number | null;
  cost_usd?: number | null;
  created_at: string;
  error_message?: string | null;
  agent_trace_id?: string | null;
}

interface BatchCardProps {
  batch: Batch;
  onViewTrace?: (traceId: string) => void;
}

function formatTimestamp(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "\u2014";
  return `$${usd.toFixed(3)}`;
}

function formatPagePath(url?: string): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

const STATUS_CONFIG: Record<string, { Icon: React.ElementType; color: string }> = {
  completed:  { Icon: CheckCircle2, color: "var(--status-success)" },
  failed:     { Icon: XCircle, color: "var(--status-error)" },
  running:    { Icon: Loader2, color: "var(--status-info)" },
  processing: { Icon: Loader2, color: "var(--status-info)" },
  queued:     { Icon: Clock, color: "var(--status-idle)" },
  pending:    { Icon: Clock, color: "var(--status-idle)" },
};

export function BatchCard({ batch, onViewTrace }: BatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const config = STATUS_CONFIG[batch.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.Icon;
  const isSpinning = batch.status === "running" || batch.status === "processing";
  const pagePath = formatPagePath(batch.page_url);
  const actionCount = batch.action_count ?? batch.actions?.length ?? 0;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          cursor: "pointer",
          transition: "background 0.15s",
          textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-elevated)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <StatusIcon
          size={15}
          style={{ flexShrink: 0, color: config.color }}
          className={isSpinning ? "spin" : ""}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--foreground-dim)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "120px",
              }}
            >
              {batch.id.length > 12 ? batch.id.slice(0, 12) + "\u2026" : batch.id}
            </code>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--foreground-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pagePath}
            </span>
          </div>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: "9999px",
            fontSize: "11px",
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
            background: "var(--surface-elevated)",
            color: "var(--foreground-muted)",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {actionCount} actions
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
            fontSize: "11px",
            color: "var(--foreground-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>{formatDuration(batch.duration_ms)}</span>
          <span style={{ color: "var(--foreground-disabled)" }}>&middot;</span>
          <span>{formatCost(batch.cost_usd)}</span>
        </div>

        <span style={{ fontSize: "11px", color: "var(--foreground-disabled)", flexShrink: 0 }}>
          {formatTimestamp(batch.created_at)}
        </span>

        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color: "var(--foreground-dim)",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </div>

      {/* Expanded body */}
      {expanded && (
        <div ref={bodyRef}>
          {batch.status === "failed" && batch.error_message && (
            <div
              style={{
                margin: "0 16px 4px",
                padding: "8px 12px",
                borderRadius: "var(--radius)",
                background: "hsla(0, 84%, 60%, 0.1)",
                border: "1px solid hsla(0, 84%, 60%, 0.2)",
                fontSize: "13px",
                color: "var(--status-error)",
              }}
            >
              {batch.error_message}
            </div>
          )}

          {batch.actions && batch.actions.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "4px", paddingBottom: "8px" }}>
              {batch.actions.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </div>
          )}

          {batch.agent_trace_id && onViewTrace && (
            <div
              style={{
                padding: "8px 16px 12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewTrace(batch.agent_trace_id!);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--primary-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--primary)")}
              >
                <ExternalLink size={13} />
                View agent trace
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionRow({ action }: { action: BatchAction }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "6px 16px",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
          <span style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 500 }}>
            {action.type}
          </span>
          {action.selector && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--foreground-dim)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {action.selector}
            </span>
          )}
        </div>
        {action.description && (
          <p style={{ fontSize: "12px", color: "var(--foreground-muted)", lineHeight: "1.5" }}>
            {action.description}
          </p>
        )}
        {(action.before_value || action.after_value) && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            {action.before_value && (
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--foreground-dim)",
                  background: "var(--surface-elevated)",
                  padding: "1px 6px",
                  borderRadius: "2px",
                  maxWidth: "180px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {action.before_value}
              </code>
            )}
            {action.before_value && action.after_value && (
              <span style={{ color: "var(--foreground-disabled)", fontSize: "10px" }}>&rarr;</span>
            )}
            {action.after_value && (
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--status-success)",
                  background: "hsla(142, 69%, 45%, 0.08)",
                  padding: "1px 6px",
                  borderRadius: "2px",
                  maxWidth: "180px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {action.after_value}
              </code>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
