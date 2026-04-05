import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  Square,
  Ban,
  Wrench,
  Plug,
  Sparkles,
  GitFork,
  AlertTriangle,
  Send,
  MessageCircle,
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
  status: "running" | "completed" | "failed" | "stopped" | "cancelled" | "error";
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  total_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  prompt: string | null;
  steps: AgentStep[];
  created_at: string;
  completed_at: string | null;
}

interface MultiTraceResponse {
  agent_id: string;
  traces: TraceData[];
}

/** Merge multiple traces into a single TraceData with turn separator steps injected. */
function mergeTraces(traces: TraceData[]): TraceData {
  if (traces.length === 0) throw new Error("No traces to merge");
  if (traces.length === 1) {
    const t = traces[0];
    if (t.prompt) {
      const promptStep: AgentStep = {
        id: "turn-prompt-0",
        sequence_index: 0,
        type: "user_message" as AgentStep["type"],
        content: t.prompt,
        metadata: null,
        duration_ms: null,
        token_count: null,
        created_at: t.created_at,
      };
      return { ...t, steps: [promptStep, ...t.steps.map((s, i) => ({ ...s, sequence_index: i + 1 }))] };
    }
    return t;
  }

  const allSteps: AgentStep[] = [];
  let totalDuration = 0;
  let totalCost = 0;
  let totalTokensAcc = 0;
  let inputTokensAcc = 0;
  let outputTokensAcc = 0;

  for (let i = 0; i < traces.length; i++) {
    const t = traces[i];
    if (t.prompt) {
      // Insert prompt as a user_message step before each turn's steps
      allSteps.push({
        id: `turn-prompt-${i}`,
        sequence_index: allSteps.length,
        type: "user_message" as AgentStep["type"],
        content: t.prompt,
        metadata: null,
        duration_ms: null,
        token_count: null,
        created_at: t.created_at,
      });
    }
    for (const step of t.steps) {
      allSteps.push({ ...step, sequence_index: allSteps.length });
    }
    if (t.total_duration_ms) totalDuration += t.total_duration_ms;
    if (t.total_cost_usd) totalCost += t.total_cost_usd;
    if (t.total_tokens) totalTokensAcc += t.total_tokens;
    if (t.input_tokens) inputTokensAcc += t.input_tokens;
    if (t.output_tokens) outputTokensAcc += t.output_tokens;
  }

  const last = traces[traces.length - 1];
  return {
    ...last,
    id: traces[0].id,
    steps: allSteps,
    total_duration_ms: totalDuration || null,
    total_cost_usd: totalCost || null,
    total_tokens: totalTokensAcc || null,
    input_tokens: inputTokensAcc || null,
    output_tokens: outputTokensAcc || null,
    created_at: traces[0].created_at,
  };
}

/* ─── Helpers ────────────────────────────────────── */

function formatDuration(ms: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m ${sec}s`;
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
  error: {
    icon: XCircle,
    iconColor: "var(--status-error)",
    label: "Error",
    bg: "color-mix(in srgb, var(--status-error) 10%, transparent)",
    fg: "var(--status-error)",
    border: "color-mix(in srgb, var(--status-error) 20%, transparent)",
  },
  created: {
    icon: Loader2,
    iconColor: "var(--foreground-dim)",
    label: "Created",
    bg: "color-mix(in srgb, var(--foreground-dim) 8%, transparent)",
    fg: "var(--foreground-dim)",
    border: "color-mix(in srgb, var(--foreground-dim) 20%, transparent)",
  },
  unknown: {
    icon: XCircle,
    iconColor: "var(--foreground-dim)",
    label: "Unknown",
    bg: "color-mix(in srgb, var(--foreground-dim) 8%, transparent)",
    fg: "var(--foreground-dim)",
    border: "color-mix(in srgb, var(--foreground-dim) 20%, transparent)",
  },
};

/** Convert a live step from NATS/steps API into the AgentStep shape used by the UI. */
function liveStepToAgentStep(step: Record<string, unknown>, index: number): AgentStep {
  const knownKeys = new Set(["type", "content", "timestamp", "status", "index", "duration_ms", "token_count"]);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step)) {
    if (!knownKeys.has(k) && v != null) meta[k] = v;
  }
  return {
    id: `live-${index}`,
    sequence_index: index,
    type: (step.type as AgentStep["type"]) ?? "text",
    content: (step.content as string) ?? null,
    metadata: Object.keys(meta).length > 0 ? meta : null,
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
  const [agentStatus, setAgentStatus] = useState<"running" | "completed" | "failed" | "stopped" | "cancelled" | "error" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

      // Handle multi-trace response from updated API
      if (data.traces && Array.isArray(data.traces)) {
        const resp = data as MultiTraceResponse;
        if (resp.traces.length === 0) return null;
        return mergeTraces(resp.traces);
      }

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
        // Terminal or unknown status with no trace — show error instead of infinite spinner
        const terminalStatuses = ["completed", "failed", "stopped", "cancelled", "error", "unknown"];
        if (terminalStatuses.includes(stepsData.status)) {
          setError(
            stepsData.status === "unknown"
              ? "This agent has no execution trace. It may have been interrupted by a server restart."
              : `Agent ${stepsData.status}, but no detailed trace is available.`
          );
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
    if (!agentStatus || agentStatus === "running") return;
    // Skip only if trace exists AND no live steps (no continuation happened)
    if (trace && liveSteps.length === 0) return;
    let cancelled = false;

    // Small delay to let the backend persist the trace
    const timer = setTimeout(async () => {
      const persisted = await fetchPersistedTrace();
      if (cancelled) return;
      if (persisted) {
        setTrace(persisted);
        setLiveSteps([]);
      }
    }, 1500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [agentStatus, trace, liveSteps.length, fetchPersistedTrace]);

  // Main mount effect
  useEffect(() => {
    if (!traceId && !agentId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function init() {
      // Try fetching persisted trace first
      const persisted = await fetchPersistedTrace();
      if (cancelled) return;

      if (persisted) {
        setTrace(persisted);
        setLoading(false);

        // Poll for status changes — detect when agent resumes via continuation
        if (agentId) {
          pollTimer = setInterval(async () => {
            if (cancelled) return;
            try {
              const stepsData = await window.electronAPI.getAgentSteps(agentId);
              if (cancelled) return;
              if (stepsData?.status === "running") {
                // Agent resumed — stop polling, keep trace, subscribe to live steps
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
                setAgentStatus("running");
                setLiveSteps([]);
                await subscribeToAgent(agentId);
              }
            } catch { /* agent endpoint not available */ }
          }, 3000);
        }
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
      if (pollTimer) clearInterval(pollTimer);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [traceId, agentId, fetchPersistedTrace, subscribeToAgent]);

  // Determine what to display (must be before early returns to keep hook order stable)
  // agentStatus "running" overrides trace status (agent resumed via continuation)
  const displayStatus = (agentStatus === "running" ? "running" : null) ?? trace?.status ?? agentStatus ?? "running";
  // When continuing, append live steps after existing trace steps
  const displaySteps = trace?.steps && liveSteps.length > 0
    ? [...trace.steps, ...liveSteps]
    : trace?.steps ?? liveSteps;
  const agentName = trace?.agent_name ?? (agentId ? `agent-${agentId}` : "Agent");
  const agentModel = trace?.agent_model ?? "claude-sonnet-4-5";

  const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.running;
  const StatusIcon = statusCfg.icon;
  const isRunning = displayStatus === "running";

  // Live elapsed duration timer (ticks every second while running)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  useEffect(() => {
    if (!isRunning || displaySteps.length === 0) {
      setElapsedMs(null);
      return;
    }
    const startTime = new Date(displaySteps[0].created_at).getTime();
    const tick = () => setElapsedMs(Date.now() - startTime);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, displaySteps.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute real stats from steps
  const stats = useMemo(() => {
    const tools = new Set<string>();
    const mcpServers = new Set<string>();
    const subagents = new Set<string>();
    const skills = new Set<string>();
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let errorCount = 0;
    let liveCostUsd = 0;

    for (const step of displaySteps) {
      if (step.token_count) totalTokens += step.token_count;
      if (step.type === "tool_error" || step.type === "error") errorCount++;

      // Accumulate per-step cost from metadata
      if (step.metadata && typeof step.metadata.cost_usd === "number") {
        liveCostUsd = step.metadata.cost_usd;
      }

      // Extract input/output tokens from completed step metadata
      if (step.type === "completed" && step.metadata) {
        const meta = step.metadata;
        if (typeof meta.input_tokens === "number") inputTokens = meta.input_tokens;
        if (typeof meta.output_tokens === "number") outputTokens = meta.output_tokens;
      }

      if (step.type === "tool_call" || step.type === "tool_use") {
        const toolName = step.metadata?.tool_name as string | undefined;
        if (!toolName) continue;

        if (toolName.startsWith("mcp__")) {
          // e.g. "mcp__vex-chrome__click" → server = "vex-chrome"
          const parts = toolName.split("__");
          if (parts.length >= 2) mcpServers.add(parts[1]);
        } else if (toolName === "Skill") {
          try {
            const parsed = JSON.parse(step.content ?? "");
            if (parsed?.skill) skills.add(parsed.skill);
          } catch { /* content might not be JSON */ }
        } else if (toolName === "Agent") {
          try {
            const parsed = JSON.parse(step.content ?? "");
            const name = parsed?.description || parsed?.subagent_type || "agent";
            subagents.add(name);
          } catch { /* content might not be JSON */ }
        }
        tools.add(toolName);
      } else if (step.type === "subagent_spawn") {
        const name = (step.metadata?.subagent_name as string) || (step.metadata?.subagent_id as string);
        if (name) subagents.add(name);
      } else if (step.type === "skill_invoke") {
        const name = step.metadata?.skill_name as string;
        if (name) skills.add(name);
      }
    }

    // Prefer trace-level token counts, fall back to step-level extraction
    const finalInput = trace?.input_tokens ?? (inputTokens > 0 ? inputTokens : null);
    const finalOutput = trace?.output_tokens ?? (outputTokens > 0 ? outputTokens : null);

    return {
      inputTokens: finalInput,
      outputTokens: finalOutput,
      liveCostUsd: liveCostUsd > 0 ? liveCostUsd : null,
      toolCount: tools.size,
      mcpCount: mcpServers.size,
      subagentCount: subagents.size,
      skillCount: skills.size,
      errorCount,
    };
  }, [displaySteps, trace?.input_tokens, trace?.output_tokens]);

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

  async function handleStopAgent() {
    if (!agentId) return;
    try {
      await window.electronAPI.stopAgent(agentId);
      setAgentStatus("stopped");
    } catch {
      // Status will update via NATS
    }
  }

  async function handleContinue() {
    if (!agentId || !followUpMessage.trim() || isSending) return;
    const msg = followUpMessage.trim();
    setIsSending(true);
    setSendError(null);
    try {
      await window.electronAPI.continueAgent(agentId, msg);
      setFollowUpMessage("");

      // Build a user_message step from the follow-up text
      const promptStep: AgentStep = {
        id: `user-msg-${Date.now()}`,
        sequence_index: displaySteps.length,
        type: "user_message" as AgentStep["type"],
        content: msg,
        metadata: null,
        duration_ms: null,
        token_count: null,
        created_at: new Date().toISOString(),
      };

      // Preserve current steps (from trace or live), append the prompt
      const currentSteps = [...displaySteps, promptStep];
      setTrace(null);
      setLiveSteps(currentSteps);
      setAgentStatus("running");

      // Re-subscribe to NATS — new steps will append after the prompt
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Subscribe, but don't clear steps on reconnect
      await window.electronAPI.subscribeAgentSteps(agentId);

      const removeStepListener = window.electronAPI.onAgentStep((data) => {
        if (data.agentId !== agentId) return;
        const idx = typeof data.index === "number" ? data.index : -1;
        const step = liveStepToAgentStep(data, idx >= 0 ? idx : Date.now());
        setLiveSteps((prev) => [...prev, step]);
      });

      const removeStatusListener = window.electronAPI.onAgentStatus((data) => {
        if (data.agentId !== agentId) return;
        const status = data.status as "completed" | "failed" | "stopped" | "cancelled";
        if (["completed", "failed", "stopped", "cancelled"].includes(status)) {
          setAgentStatus(status);
        }
      });

      const removeHookListener = window.electronAPI.onAgentHook((data) => {
        if (data.agentId !== agentId) return;
        const hookStep = hookEventToStep(data);
        if (hookStep) setLiveSteps((prev) => [...prev, hookStep]);
      });

      cleanupRef.current = () => {
        removeStepListener();
        removeStatusListener();
        removeHookListener();
        window.electronAPI.unsubscribeAgentSteps(agentId);
      };
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to continue agent");
    } finally {
      setIsSending(false);
    }
  }

  const isTerminal = ["completed", "failed", "stopped"].includes(displayStatus);
  const showFollowUpBar = isTerminal && !!agentId;

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
            flexWrap: "wrap",
          }}
        >
          <MetricItem icon={<Clock size={12} />} label="duration" value={formatDuration(trace?.total_duration_ms ?? elapsedMs)} />
          <Separator />
          <MetricItem icon={<DollarSign size={12} />} label="cost" value={formatCost(trace?.total_cost_usd ?? stats.liveCostUsd)} />
          <Separator />
          <MetricItem icon={<Hash size={12} />} label="in" value={formatTokens(stats.inputTokens)} />
          <Separator />
          <MetricItem icon={<Hash size={12} />} label="out" value={formatTokens(stats.outputTokens)} />
          <Separator />
          <MetricItem icon={<Layers size={12} />} label="steps" value={String(displaySteps.length)} />
          <Separator />
          <MetricItem icon={<Wrench size={12} />} label="tools" value={String(stats.toolCount)} />
          <Separator />
          <MetricItem icon={<Plug size={12} />} label="mcp" value={String(stats.mcpCount)} />
          <Separator />
          <MetricItem icon={<GitFork size={12} />} label="subagents" value={String(stats.subagentCount)} />
          <Separator />
          <MetricItem icon={<Sparkles size={12} />} label="skills" value={String(stats.skillCount)} />
          <Separator />
          <MetricItem icon={<AlertTriangle size={12} />} label="errors" value={String(stats.errorCount)} highlight={stats.errorCount > 0 ? "error" : undefined} />
        </div>
      </header>

      {/* ─── Body ────────────────────────────────── */}
      {isRunning && displaySteps.length === 0 ? (
        <AgentWorkingAnimation />
      ) : (
        <AgentStepList steps={displaySteps} status={displayStatus} />
      )}

      {/* ─── Follow-up input bar ─────────────── */}
      {showFollowUpBar && (
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "12px 20px",
          }}
        >
          {sendError && (
            <div
              style={{
                marginBottom: "8px",
                padding: "6px 12px",
                borderRadius: "var(--radius)",
                background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
                color: "var(--status-error)",
                fontSize: "12px",
              }}
            >
              {sendError}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                value={followUpMessage}
                onChange={(e) => setFollowUpMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleContinue();
                  }
                }}
                placeholder="Send a follow-up message..."
                disabled={isSending}
                rows={1}
                style={{
                  width: "100%",
                  resize: "none",
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  outline: "none",
                  opacity: isSending ? 0.5 : 1,
                }}
              />
            </div>
            <button
              onClick={handleContinue}
              disabled={isSending || !followUpMessage.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px 16px",
                borderRadius: "var(--radius)",
                background: isSending || !followUpMessage.trim()
                  ? "var(--surface-elevated)"
                  : "var(--primary)",
                color: isSending || !followUpMessage.trim()
                  ? "var(--foreground-dim)"
                  : "var(--primary-foreground)",
                border: "none",
                cursor: isSending || !followUpMessage.trim() ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 500,
                transition: "background 0.15s",
              }}
            >
              {isSending ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Send size={14} />
              )}
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
          <div
            style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "var(--foreground-dim)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <MessageCircle size={10} />
            Continue this conversation — the agent will have full context of its prior work
          </div>
        </div>
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
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: "error";
}) {
  const color = highlight === "error" ? "var(--status-error)" : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: color ?? "var(--foreground-muted)" }}>
      <span style={{ color: color ?? "var(--foreground-dim)", display: "flex" }}>{icon}</span>
      <span style={{ color: color ?? "var(--foreground-dim)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Separator() {
  return (
    <span style={{ color: "var(--foreground-dim)", userSelect: "none" }}>|</span>
  );
}

