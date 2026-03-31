import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowLeft,
  Bot,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  DollarSign,
  Brain,
  Wrench,
  MessageSquare,
  AlertTriangle,
  GitBranch,
  Sparkles,
  FileCode,
} from "lucide-react";
import type { AgentStep, StepType } from "../components/project-detail/AgentStepItem";

/* ─── Types ──────────────────────────────────────── */

interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  total_cost_usd?: number;
}

interface LiveAgent {
  info: AgentInfo;
  steps: AgentStep[];
  status: "running" | "completed" | "failed";
}

/* ─── Helpers ────────────────────────────────────── */

function liveStepToAgentStep(step: Record<string, unknown>, index: number): AgentStep {
  return {
    id: `live-${index}`,
    sequence_index: index,
    type: (step.type as StepType) ?? "text",
    content: (step.content as string) ?? null,
    metadata: step.tool_name ? { tool_name: step.tool_name } : null,
    duration_ms: (step.duration_ms as number) ?? null,
    token_count: (step.token_count as number) ?? null,
    created_at: (step.timestamp as string) ?? new Date().toISOString(),
  };
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "--";
  return `$${usd.toFixed(3)}`;
}

const STEP_ICONS: Partial<Record<StepType, React.ElementType>> = {
  thinking: Brain,
  text: MessageSquare,
  tool_call: Wrench,
  tool_use: Wrench,
  tool_result: FileCode,
  diff: FileCode,
  subagent_spawn: GitBranch,
  subagent_result: GitBranch,
  skill_invoke: Sparkles,
  skill_result: Sparkles,
  error: AlertTriangle,
  completed: CheckCircle,
  progress: MessageSquare,
};

function stepOneLiner(step: AgentStep): string {
  if (step.type === "tool_call" || step.type === "tool_use") {
    const toolName = (step.metadata as any)?.tool_name;
    return toolName ? `Using ${toolName}` : "Tool call";
  }
  if (step.type === "thinking") return "Thinking...";
  if (step.type === "completed") return "Done";
  if (step.type === "error") return step.content?.slice(0, 80) ?? "Error";
  if (step.type === "diff") return "Applying changes";
  if (step.type === "subagent_spawn") return "Spawning subagent";
  if (step.type === "skill_invoke") return "Invoking skill";
  if (step.content) return step.content.slice(0, 100);
  return step.type;
}

const STATUS_GLOW: Record<string, { color: string; shadow: string; border: string; bg: string }> = {
  running: {
    color: "var(--primary)",
    shadow: "0 0 20px hsla(263, 82%, 57.5%, 0.4), 0 0 60px hsla(263, 82%, 57.5%, 0.15)",
    border: "hsla(263, 82%, 57.5%, 0.5)",
    bg: "hsla(263, 82%, 57.5%, 0.03)",
  },
  completed: {
    color: "var(--status-success)",
    shadow: "0 0 12px hsla(142, 69%, 45%, 0.2)",
    border: "hsla(142, 69%, 45%, 0.35)",
    bg: "hsla(142, 69%, 45%, 0.02)",
  },
  failed: {
    color: "var(--status-error)",
    shadow: "0 0 12px hsla(0, 84%, 60%, 0.2)",
    border: "hsla(0, 84%, 60%, 0.35)",
    bg: "hsla(0, 84%, 60%, 0.02)",
  },
};

/* ─── Background Canvas ──────────────────────────── */

function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const primary = getComputedStyle(canvas).getPropertyValue("--primary").trim() || "#a78bfa";

    // Floating nodes
    const nodeCount = 40;
    const nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1.5 + Math.random() * 2,
      });
    }

    let time = 0;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.005;

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      }

      // Draw connections
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.08;
            ctx.strokeStyle = `${primary}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const pulse = 0.3 + Math.sin(time * 2 + n.x * 0.01) * 0.2;
        ctx.fillStyle = `${primary}${Math.round(pulse * 255).toString(16).padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

/* ─── Agent Card ─────────────────────────────────── */

function AgentCard({
  agent,
  index,
  onViewAgent,
}: {
  agent: LiveAgent;
  index: number;
  onViewAgent: (agentId: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const prevStepCountRef = useRef(0);
  const glowTlRef = useRef<gsap.core.Timeline | null>(null);

  const glow = STATUS_GLOW[agent.status] ?? STATUS_GLOW.running;
  const isRunning = agent.status === "running";

  // GSAP entrance animation
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    gsap.fromTo(
      card,
      { opacity: 0, y: 40, scale: 0.95, rotateX: 8 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        rotateX: 0,
        duration: 0.6,
        delay: index * 0.12,
        ease: "power3.out",
      },
    );
  }, [index]);

  // Breathing glow for running agents
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !isRunning) {
      if (glowTlRef.current) {
        glowTlRef.current.kill();
        glowTlRef.current = null;
      }
      return;
    }

    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(card, {
      boxShadow: glow.shadow.replace("0.4", "0.7").replace("0.15", "0.3"),
      duration: 1.5,
      ease: "sine.inOut",
    }).to(card, {
      boxShadow: glow.shadow,
      duration: 1.5,
      ease: "sine.inOut",
    });
    glowTlRef.current = tl;

    return () => {
      tl.kill();
    };
  }, [isRunning, glow.shadow]);

  // Animate new steps
  useEffect(() => {
    if (agent.steps.length <= prevStepCountRef.current) {
      prevStepCountRef.current = agent.steps.length;
      return;
    }

    const container = cardRef.current?.querySelector(".agent-steps-feed");
    if (container) {
      const newItems = Array.from(container.children).slice(prevStepCountRef.current);
      if (newItems.length > 0) {
        gsap.fromTo(
          newItems,
          { opacity: 0, x: -16 },
          { opacity: 1, x: 0, duration: 0.35, ease: "power2.out", stagger: 0.04 },
        );
      }
    }

    prevStepCountRef.current = agent.steps.length;

    // Auto-scroll
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agent.steps.length]);

  // Status change flash
  const prevStatusRef = useRef(agent.status);
  useEffect(() => {
    if (prevStatusRef.current === agent.status) return;
    prevStatusRef.current = agent.status;

    const card = cardRef.current;
    if (!card) return;

    const flashColor =
      agent.status === "completed"
        ? "hsla(142, 69%, 45%, 0.15)"
        : agent.status === "failed"
          ? "hsla(0, 84%, 60%, 0.15)"
          : "transparent";

    gsap.fromTo(
      card,
      { backgroundColor: flashColor },
      { backgroundColor: glow.bg, duration: 0.8, ease: "power2.out" },
    );
  }, [agent.status, glow.bg]);

  const StatusIcon = isRunning ? Loader2 : agent.status === "completed" ? CheckCircle : XCircle;
  const recentSteps = agent.steps.slice(-20);

  return (
    <div
      ref={cardRef}
      onClick={() => onViewAgent(agent.info.id)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        borderRadius: "12px",
        border: `1px solid ${glow.border}`,
        background: glow.bg,
        backdropFilter: "blur(12px)",
        boxShadow: glow.shadow,
        overflow: "hidden",
        cursor: "pointer",
        opacity: 0,
        transition: "border-color 0.3s",
        minHeight: "280px",
        maxHeight: "420px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = glow.color;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = glow.border;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${glow.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <Bot size={16} style={{ color: glow.color, flexShrink: 0 }} />
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {agent.info.name || `Agent ${agent.info.id.slice(0, 8)}`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <StatusIcon
            size={12}
            style={{
              color: glow.color,
              ...(isRunning ? { animation: "spin 1s linear infinite" } : {}),
            }}
          />
          <span style={{ fontSize: "11px", fontWeight: 500, color: glow.color }}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Steps Feed */}
      <div
        className="agent-steps-feed"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-bright) transparent",
        }}
      >
        {recentSteps.length === 0 && isRunning && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "8px",
              color: "var(--foreground-dim)",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--primary)",
                animation: "pulse-dot 1.5s ease-in-out infinite",
              }}
            />
            Waiting for steps...
          </div>
        )}

        {recentSteps.map((step) => {
          const Icon = STEP_ICONS[step.type] ?? MessageSquare;
          const isError = step.type === "error";

          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "4px 14px",
                fontSize: "11px",
                lineHeight: "1.4",
                color: isError ? "var(--status-error)" : "var(--foreground-muted)",
              }}
            >
              <Icon
                size={11}
                style={{
                  flexShrink: 0,
                  marginTop: "2px",
                  color: isError
                    ? "var(--status-error)"
                    : step.type === "thinking"
                      ? "var(--primary)"
                      : "var(--foreground-dim)",
                }}
              />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {stepOneLiner(step)}
              </span>
            </div>
          );
        })}
        <div ref={stepsEndRef} />
      </div>

      {/* Card Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderTop: `1px solid ${glow.border}`,
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--foreground-dim)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <Layers size={9} /> {agent.steps.length} steps
          </span>
          {agent.info.total_cost_usd != null && (
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <DollarSign size={9} /> {formatCost(agent.info.total_cost_usd)}
            </span>
          )}
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <Clock size={9} />
          {new Date(agent.info.created_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────── */

export function AgentsLiveGrid() {
  const { id: projectId = "", batchId = "" } = useParams<{ id: string; batchId: string }>();
  const navigate = useNavigate();
  const [liveAgents, setLiveAgents] = useState<Map<string, LiveAgent>>(new Map());
  const [loading, setLoading] = useState(true);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  // Fetch agents for this batch, subscribe to NATS for running ones
  const initAgents = useCallback(async () => {
    try {
      // Get batch tasks to find agent IDs
      const tasksResult = await window.electronAPI.getBatchTasks(projectId, batchId);
      if (!tasksResult?.tasks?.length) {
        setLoading(false);
        return;
      }

      // Get project agents for full info
      const agentsResult = await window.electronAPI.getProjectAgents(projectId);
      const allAgents: AgentInfo[] = agentsResult?.agents ?? [];

      // Build unique agent map from tasks
      const agentIds = new Set<string>();
      for (const task of tasksResult.tasks) {
        if (task.agent_id) agentIds.add(task.agent_id);
      }

      const agentMap = new Map<string, LiveAgent>();

      for (const aid of agentIds) {
        const info = allAgents.find((a) => a.id === aid) ?? {
          id: aid,
          name: `Agent ${aid.slice(0, 8)}`,
          type: "unknown",
          status: "running",
          created_at: new Date().toISOString(),
        };

        // Try to load existing steps
        let steps: AgentStep[] = [];
        let status: "running" | "completed" | "failed" = "running";
        try {
          const stepsData = await window.electronAPI.getAgentSteps(aid);
          if (stepsData?.steps?.length > 0) {
            steps = stepsData.steps.map((s: Record<string, unknown>, i: number) =>
              liveStepToAgentStep(s, i),
            );
          }
          if (stepsData?.status && stepsData.status !== "running") {
            status = stepsData.status as "completed" | "failed";
          }
        } catch {
          /* agent might not have steps yet */
        }

        // Also check info status
        if (info.status === "completed" || info.status === "stopped") status = "completed";
        if (info.status === "failed" || info.status === "error") status = "failed";

        // Try loading persisted trace for completed agents
        if (status !== "running") {
          try {
            const trace = await window.electronAPI.getAgentTraceByAgent(aid);
            if (trace?.steps?.length > 0) {
              steps = trace.steps;
            }
          } catch {
            /* no trace yet */
          }
        }

        agentMap.set(aid, { info, steps, status });

        // Subscribe to NATS if still running
        if (status === "running") {
          await window.electronAPI.subscribeAgentSteps(aid);

          const removeStepListener = window.electronAPI.onAgentStep((data) => {
            if (data.agentId !== aid) return;
            const idx = typeof data.index === "number" ? data.index : Date.now();
            const step = liveStepToAgentStep(data, idx);
            setLiveAgents((prev) => {
              const next = new Map(prev);
              const existing = next.get(aid);
              if (!existing) return prev;
              // Deduplicate
              if (typeof data.index === "number" && existing.steps.some((s) => s.sequence_index === idx)) {
                return prev;
              }
              next.set(aid, { ...existing, steps: [...existing.steps, step] });
              return next;
            });
          });

          const removeStatusListener = window.electronAPI.onAgentStatus((data) => {
            if (data.agentId !== aid) return;
            const newStatus = data.status as "completed" | "failed";
            setLiveAgents((prev) => {
              const next = new Map(prev);
              const existing = next.get(aid);
              if (!existing) return prev;
              next.set(aid, { ...existing, status: newStatus });
              return next;
            });

            // Fetch final trace after brief delay
            setTimeout(async () => {
              try {
                const trace = await window.electronAPI.getAgentTraceByAgent(aid);
                if (trace?.steps?.length > 0) {
                  setLiveAgents((prev) => {
                    const n = new Map(prev);
                    const ex = n.get(aid);
                    if (!ex) return prev;
                    n.set(aid, { ...ex, steps: trace.steps });
                    return n;
                  });
                }
              } catch {
                /* ignore */
              }
            }, 1500);
          });

          cleanupFnsRef.current.push(() => {
            removeStepListener();
            removeStatusListener();
            window.electronAPI.unsubscribeAgentSteps(aid);
          });
        }
      }

      setLiveAgents(agentMap);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [projectId, batchId]);

  useEffect(() => {
    initAgents();
    return () => {
      for (const fn of cleanupFnsRef.current) fn();
      cleanupFnsRef.current = [];
    };
  }, [initAgents]);

  // GSAP header entrance
  useEffect(() => {
    if (loading) return;
    const header = headerRef.current;
    if (header) {
      gsap.fromTo(header, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" });
    }
  }, [loading]);

  const agents = Array.from(liveAgents.values());
  const runningCount = agents.filter((a) => a.status === "running").length;
  const completedCount = agents.filter((a) => a.status === "completed").length;
  const failedCount = agents.filter((a) => a.status === "failed").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background: "var(--background)",
      }}
    >
      <BackgroundCanvas />

      {/* Header */}
      <header
        ref={headerRef}
        style={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: "52px",
          background: "color-mix(in srgb, var(--surface) 85%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
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

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bot size={18} style={{ color: "var(--primary)" }} />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--foreground)" }}>
              Mission Control
            </span>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--foreground-dim)",
                padding: "2px 8px",
                borderRadius: "var(--radius)",
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              {batchId.slice(0, 12)}...
            </span>
          </div>
        </div>

        {/* Summary badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
          {runningCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--primary)" }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              {runningCount} running
            </span>
          )}
          {completedCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--status-success)" }}>
              <CheckCircle size={12} />
              {completedCount} done
            </span>
          )}
          {failedCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--status-error)" }}>
              <XCircle size={12} />
              {failedCount} failed
            </span>
          )}
          <span
            style={{
              fontSize: "11px",
              color: "var(--foreground-disabled)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </span>
        </div>
      </header>

      {/* Body */}
      {loading ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "var(--foreground-dim)",
          }}
        >
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
          <span style={{ fontSize: "14px" }}>Loading agents...</span>
        </div>
      ) : agents.length === 0 ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            color: "var(--foreground-dim)",
          }}
        >
          <Bot size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: "14px" }}>No agents found for this batch</span>
        </div>
      ) : (
        <div
          ref={gridRef}
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "16px",
            alignContent: "start",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border-bright) transparent",
          }}
        >
          {agents.map((agent, i) => (
            <AgentCard
              key={agent.info.id}
              agent={agent}
              index={i}
              onViewAgent={(agentId) => navigate(`/project/${projectId}/agent/${agentId}`)}
            />
          ))}
        </div>
      )}

      {/* Shared keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
