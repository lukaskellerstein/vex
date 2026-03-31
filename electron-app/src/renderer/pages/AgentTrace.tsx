import React, { useEffect, useState, useRef, useCallback } from "react";
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
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  Square,
  Ban,
} from "lucide-react";
import { AgentStepList } from "../components/project-detail/AgentStepList";
import type { AgentStep } from "../components/project-detail/AgentStepItem";
import { AgentWorkingAnimation } from "../components/project-detail/AgentWorkingAnimation";
import { hookEventToStep } from "../utils/hook-steps";

/* ─── Types ──────────────────────────────────────── */

interface TraceData {
  id: string;
  batch_id: string;
  agent_id: string;
  agent_name: string;
  agent_model: string;
  status: "running" | "completed" | "failed" | "stopped" | "cancelled";
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  total_tokens: number | null;
  prompt: string | null;
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
  stopped: {
    icon: Ban,
    iconColor: "var(--status-warning)",
    label: "Stopped",
    bg: "color-mix(in srgb, var(--status-warning) 10%, transparent)",
    fg: "var(--status-warning)",
    border: "color-mix(in srgb, var(--status-warning) 20%, transparent)",
  },
  cancelled: {
    icon: Ban,
    iconColor: "var(--status-warning)",
    label: "Cancelled",
    bg: "color-mix(in srgb, var(--status-warning) 10%, transparent)",
    fg: "var(--status-warning)",
    border: "color-mix(in srgb, var(--status-warning) 20%, transparent)",
  },
};

/** Convert a live step from NATS/steps API into the AgentStep shape used by the UI. */
function liveStepToAgentStep(step: Record<string, unknown>, index: number): AgentStep {
  return {
    id: `live-${index}`,
    sequence_index: index,
    type: (step.type as AgentStep["type"]) ?? "text",
    content: (step.content as string) ?? null,
    metadata: step.tool_name ? { tool_name: step.tool_name } : null,
    duration_ms: (step.duration_ms as number) ?? null,
    token_count: (step.token_count as number) ?? null,
    created_at: (step.timestamp as string) ?? new Date().toISOString(),
  };
}

/* ─── Component ──────────────────────────────────── */

export function AgentTrace() {
  const { id: projectId, traceId, agentId } = useParams<{ id: string; traceId: string; agentId: string }>();
  const navigate = useNavigate();
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [agentStatus, setAgentStatus] = useState<"running" | "completed" | "failed" | "stopped" | "cancelled" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Fetch the final persisted trace (for completed/failed agents or by traceId)
  const fetchPersistedTrace = useCallback(async () => {
    try {
      let data;
      if (traceId) {
        data = await window.electronAPI.getAgentTrace(traceId);
      } else if (agentId) {
        data = await window.electronAPI.getAgentTraceByAgent(agentId);
      }
      if (!data || data.detail) return null;
      return data as TraceData;
    } catch {
      return null;
    }
  }, [traceId, agentId]);

  // Subscribe to NATS for live steps
  const subscribeToAgent = useCallback(async (aid: string) => {
    // First, try to load any steps already accumulated
    try {
      const stepsData = await window.electronAPI.getAgentSteps(aid);
      if (stepsData?.steps?.length > 0) {
        setLiveSteps(stepsData.steps.map((s: Record<string, unknown>, i: number) => liveStepToAgentStep(s, i)));
      }
      if (stepsData?.status && stepsData.status !== "running") {
        // Agent already finished — fetch persisted trace
        const persisted = await fetchPersistedTrace();
        if (persisted) {
          setTrace(persisted);
          setAgentStatus(persisted.status);
          setLoading(false);
          return;
        }
      }
    } catch { /* steps endpoint might 404 if agent hasn't started */ }

    setAgentStatus("running");
    setLoading(false);

    // Subscribe via NATS
    await window.electronAPI.subscribeAgentSteps(aid);

    const removeStepListener = window.electronAPI.onAgentStep((data) => {
      if (data.agentId !== aid) return;
      const idx = typeof data.index === "number" ? data.index : -1;
      const step = liveStepToAgentStep(data, idx >= 0 ? idx : Date.now());
      setLiveSteps((prev) => {
        // Deduplicate by index
        if (idx >= 0) {
          const existing = prev.findIndex((s) => s.sequence_index === idx);
          if (existing >= 0) return prev;
        }
        return [...prev, step];
      });
    });

    const removeStatusListener = window.electronAPI.onAgentStatus((data) => {
      if (data.agentId !== aid) return;
      const status = data.status as "completed" | "failed" | "stopped" | "cancelled";
      if (status === "completed" || status === "failed" || status === "stopped" || status === "cancelled") {
        setAgentStatus(status);
      }
    });

    const removeHookListener = window.electronAPI.onAgentHook((data) => {
      if (data.agentId !== aid) return;
      const hookStep = hookEventToStep(data);
      if (!hookStep) return;
      setLiveSteps((prev) => [...prev, hookStep]);
    });

    cleanupRef.current = () => {
      removeStepListener();
      removeStatusListener();
      removeHookListener();
      window.electronAPI.unsubscribeAgentSteps(aid);
    };
  }, [fetchPersistedTrace]);

  // When status changes to completed/failed, fetch the full persisted trace
  useEffect(() => {
    if (!agentStatus || agentStatus === "running" || trace) return;
    let cancelled = false;

    // Small delay to let the backend persist the trace
    const timer = setTimeout(async () => {
      const persisted = await fetchPersistedTrace();
      if (cancelled) return;
      if (persisted) {
        setTrace(persisted);
      }
    }, 1500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [agentStatus, trace, fetchPersistedTrace]);

  // Main mount effect
  useEffect(() => {
    if (!traceId && !agentId) return;
    let cancelled = false;

    async function init() {
      // Try fetching persisted trace first
      const persisted = await fetchPersistedTrace();
      if (cancelled) return;

      if (persisted) {
        setTrace(persisted);
        setLoading(false);
        return;
      }

      // No persisted trace — agent is likely still running. Subscribe to NATS.
      if (agentId) {
        await subscribeToAgent(agentId);
      } else {
        setError("Trace not found");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [traceId, agentId, fetchPersistedTrace, subscribeToAgent]);

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

  // Error state (only if no live data either)
  if (error && !agentStatus) {
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

  // Determine what to display
  const displayStatus = trace?.status ?? agentStatus ?? "running";
  const displaySteps = trace?.steps ?? liveSteps;
  const agentName = trace?.agent_name ?? (agentId ? `agent-${agentId.slice(0, 8)}` : "Agent");
  const agentModel = trace?.agent_model ?? "claude-sonnet-4-5";

  const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.running;
  const StatusIcon = statusCfg.icon;
  const isRunning = displayStatus === "running";

  async function handleStopAgent() {
    if (!agentId) return;
    try {
      await window.electronAPI.stopAgent(agentId);
      setAgentStatus("stopped");
    } catch {
      // Status will update via NATS
    }
  }

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

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Bot size={16} style={{ color: "var(--primary)" }} />
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--foreground)",
                }}
              >
                {agentName}
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
                {agentModel}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isRunning && (
              <button
                onClick={handleStopAgent}
                title="Stop agent"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                  background: "hsla(0, 84%, 60%, 0.08)",
                  border: "1px solid hsla(0, 84%, 60%, 0.2)",
                  borderRadius: "9999px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--status-error)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "hsla(0, 84%, 60%, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "hsla(0, 84%, 60%, 0.08)")}
              >
                <Square size={8} fill="currentColor" />
                Stop
              </button>
            )}

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
                  ...(isRunning ? { animation: "spin 1s linear infinite" } : {}),
                }}
              />
              {statusCfg.label}
            </span>
          </div>
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
          <MetricItem icon={<Clock size={12} />} label="duration" value={formatDuration(trace?.total_duration_ms ?? null)} />
          <Separator />
          <MetricItem icon={<DollarSign size={12} />} label="cost" value={formatCost(trace?.total_cost_usd ?? null)} />
          <Separator />
          <MetricItem icon={<Hash size={12} />} label="tokens" value={formatTokens(trace?.total_tokens ?? null)} />
          <Separator />
          <MetricItem icon={<Layers size={12} />} label="steps" value={String(displaySteps.length)} />
        </div>
      </header>

      {/* ─── Prompt (collapsible) ────────────────── */}
      {trace?.prompt && (
        <div
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--primary) 4%, var(--background))",
          }}
        >
          <button
            onClick={() => setPromptExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "10px 20px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--foreground-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <MessageSquare size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
            <span>Prompt</span>
            {promptExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {promptExpanded && (
            <div
              style={{
                padding: "0 20px 14px 41px",
                fontSize: "13px",
                lineHeight: "1.5",
                color: "var(--foreground-muted)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <PromptContent text={trace.prompt} />
            </div>
          )}
        </div>
      )}

      {/* ─── Body ────────────────────────────────── */}
      {isRunning && displaySteps.length === 0 ? (
        <AgentWorkingAnimation />
      ) : (
        <AgentStepList steps={displaySteps} status={displayStatus} />
      )}

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

/* ─── Screenshot path detection & inline preview ── */

const SCREENSHOT_BASE = "http://localhost:8420/api/storage/screenshot?path=";
const SCREENSHOT_PATH_RE = /`([^`]+\.(?:png|jpg|jpeg))`/i;

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "50%",
          width: "36px",
          height: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#fff",
        }}
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt="Screenshot full size"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          borderRadius: "8px",
          cursor: "default",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

function PromptContent({ text }: { text: string }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const lines = text.split("\n");

  return (
    <>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {lines.map((line, i) => {
        const match = SCREENSHOT_PATH_RE.exec(line);
        if (!match) return <div key={i}>{line || "\u00A0"}</div>;

        const filePath = match[1];
        const imgUrl = `${SCREENSHOT_BASE}${encodeURIComponent(filePath)}`;

        return (
          <div key={i}>
            <div>{line}</div>
            <img
              src={imgUrl}
              alt={filePath}
              onClick={() => setLightboxSrc(imgUrl)}
              style={{
                maxWidth: "400px",
                maxHeight: "300px",
                marginTop: "6px",
                marginBottom: "8px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                cursor: "zoom-in",
                display: "block",
              }}
            />
          </div>
        );
      })}
    </>
  );
}
