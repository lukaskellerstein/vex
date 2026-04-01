import { useCallback, useEffect, useRef, useState } from "react";
import type { NatsClient } from "../hooks/useNatsClient";
import { AGENT_MANAGER_URL } from "../../shared/messages";
import { clampToViewport } from "../utils/positioning";

/* ─── Types ──────────────────────────────────────── */

interface CursorAgent {
  agentId: string;
  agentName: string;
  selector: string;
  colorIndex: number;
  status: "running" | "completed" | "failed";
  fading: boolean;
}

interface CursorInit {
  type: "cursor_init";
  batchId: string;
  pageUrl: string;
  agents: {
    agentId: string;
    agentName: string;
    selector: string;
    colorIndex: number;
  }[];
}

/* ─── Constants ──────────────────────────────────── */

const PALETTE = [
  "#a78bfa", "#f59e0b", "#06b6d4", "#f43f5e", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];
const DONE_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";
const FADE_DURATION = 2000;

function getColor(status: string, idx: number): string {
  if (status === "completed") return DONE_COLOR;
  if (status === "failed") return FAIL_COLOR;
  return PALETTE[idx % PALETTE.length];
}

/* ─── SVG Cursors ────────────────────────────────── */

function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path
        d="M5.65 3.15L19.85 12.6L12.6 13.2L16.15 20.85L13.6 21.95L10 14.3L5.65 18.65Z"
        fill={color}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CursorCheck({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="10" fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
      <path
        d="M7.5 12.5L10.5 15.5L16.5 9"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CursorFail({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="10" fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
      <path d="M9 9L15 15M15 9L9 15" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Single Cursor ──────────────────────────────── */

function AgentCursor({ agent }: { agent: CursorAgent }) {
  const ref = useRef<HTMLDivElement>(null);
  const color = getColor(agent.status, agent.colorIndex);
  const isDone = agent.status === "completed" || agent.status === "failed";

  // Track element position (scroll/resize aware)
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      try {
        const el = document.querySelector(agent.selector);
        if (!el) {
          ref.current.style.display = "none";
          return;
        }
        const rect = el.getBoundingClientRect();
        // Clamp outline to visible viewport portion
        const outlineTop = Math.max(0, rect.y);
        const outlineLeft = Math.max(0, rect.x);
        const outlineWidth = Math.max(0, Math.min(window.innerWidth, rect.x + rect.width) - outlineLeft);
        const outlineHeight = Math.max(0, Math.min(window.innerHeight, rect.y + rect.height) - outlineTop);
        if (outlineWidth === 0 || outlineHeight === 0) {
          ref.current.style.display = "none";
          return;
        }
        ref.current.style.display = "block";
        ref.current.style.top = outlineTop + "px";
        ref.current.style.left = outlineLeft + "px";
        ref.current.style.width = outlineWidth + "px";
        ref.current.style.height = outlineHeight + "px";
      } catch {
        if (ref.current) ref.current.style.display = "none";
      }
    };

    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [agent.selector]);

  // Random animation delay so cursors don't sync
  const animDelay = useRef(`${Math.random() * -4}s`);

  return (
    <>
      {/* Outline around target element */}
      <div
        ref={ref}
        className="vex-agent-outline"
        style={{ borderColor: color }}
      />

      {/* Cursor + name badge (positioned inside the outline div via portal-like approach) */}
      <CursorInner
        parentRef={ref}
        agent={agent}
        color={color}
        isDone={isDone}
        animDelay={animDelay.current}
      />
    </>
  );
}

function CursorInner({
  parentRef,
  agent,
  color,
  isDone,
  animDelay,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  agent: CursorAgent;
  color: string;
  isDone: boolean;
  animDelay: string;
}) {
  const cursorRef = useRef<HTMLDivElement>(null);

  // Position cursor relative to the outline element
  useEffect(() => {
    const update = () => {
      if (!cursorRef.current || !parentRef.current) return;
      const parent = parentRef.current;
      if (parent.style.display === "none") {
        cursorRef.current.style.display = "none";
        return;
      }
      cursorRef.current.style.display = "block";
      const top = parseFloat(parent.style.top) || 0;
      const left = parseFloat(parent.style.left) || 0;
      const width = parseFloat(parent.style.width) || 100;
      const height = parseFloat(parent.style.height) || 50;
      // Position cursor at ~30% from top-left, clamped to viewport
      // Footprint: ~100px wide (icon + name badge), ~56px tall
      // Margin: 22px absorbs max drift animation displacement (18px) + buffer
      const rawTop = top + height * 0.25;
      const rawLeft = left + width * 0.2;
      const clamped = clampToViewport(rawTop, rawLeft, 100, 56, 22);
      cursorRef.current.style.top = clamped.top + "px";
      cursorRef.current.style.left = clamped.left + "px";
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [parentRef]);

  return (
    <div
      ref={cursorRef}
      className={`vex-agent-cursor ${isDone ? "vex-agent-cursor--done" : ""} ${agent.fading ? "vex-agent-cursor--fading" : ""}`}
      style={{ animationDelay: animDelay }}
    >
      {agent.status === "failed" ? (
        <CursorFail color={color} />
      ) : isDone ? (
        <CursorCheck color={color} />
      ) : (
        <CursorArrow color={color} />
      )}
      <span
        className="vex-agent-cursor-name"
        style={{ background: color }}
      >
        {agent.agentName}
      </span>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────── */

interface AgentCursorsProps {
  natsClient: NatsClient;
  onAgentsDetected?: () => void;
}

export function AgentCursors({ natsClient, onAgentsDetected }: AgentCursorsProps) {
  const [agents, setAgents] = useState<CursorAgent[]>([]);
  const subIdsRef = useRef<string[]>([]);
  const knownAgentIdsRef = useRef<Set<string>>(new Set());
  const completedAgentIdsRef = useRef<Set<string>>(new Set());

  const cleanupSubs = useCallback(() => {
    for (const id of subIdsRef.current) {
      natsClient.unsubscribe(id);
    }
    subIdsRef.current = [];
  }, [natsClient]);

  /** Handle agent completion: transition to done state, then fade out. */
  const completeAgent = useCallback((agentId: string, finalStatus: "completed" | "failed") => {
    completedAgentIdsRef.current.add(agentId);
    setAgents((prev) =>
      prev.map((ag) =>
        ag.agentId === agentId && !ag.fading ? { ...ag, status: finalStatus } : ag,
      ),
    );

    setTimeout(() => {
      setAgents((prev) =>
        prev.map((ag) =>
          ag.agentId === agentId ? { ...ag, fading: true } : ag,
        ),
      );
    }, 500);

    setTimeout(() => {
      setAgents((prev) => prev.filter((ag) => ag.agentId !== agentId));
      knownAgentIdsRef.current.delete(agentId);
    }, 500 + FADE_DURATION);
  }, []);

  /** Subscribe to an agent's status for real-time completion updates. */
  const subscribeAgentStatus = useCallback(
    (agentId: string) => {
      if (!natsClient.connected) return;
      const statusSubId = natsClient.subscribe(
        `vex.agent.${agentId}.status`,
        (statusData: object) => {
          const sd = statusData as { status?: string };
          const raw = sd.status || "";
          const newStatus: "completed" | "failed" =
            raw === "failed" || raw === "error" ? "failed" : "completed";
          completeAgent(agentId, newStatus);
        },
      );
      subIdsRef.current.push(statusSubId);
    },
    [natsClient, completeAgent],
  );

  /** Activate new cursors or update existing ones from poll/NATS data. */
  const activateAgents = useCallback(
    (incoming: { agentId: string; agentName: string; selector: string; colorIndex: number; status?: string }[]) => {
      setAgents((prev) => {
        const existingIds = new Set(prev.map((a) => a.agentId));
        const updated = [...prev];

        for (const a of incoming) {
          // Don't resurrect agents that already completed
          if (completedAgentIdsRef.current.has(a.agentId)) continue;

          const agentStatus = (a.status as CursorAgent["status"]) || "running";

          if (existingIds.has(a.agentId)) {
            // Update status if changed
            const idx = updated.findIndex((x) => x.agentId === a.agentId);
            if (idx >= 0 && updated[idx].status !== agentStatus && !updated[idx].fading) {
              updated[idx] = { ...updated[idx], status: agentStatus };
            }
          } else {
            // New agent
            knownAgentIdsRef.current.add(a.agentId);
            subscribeAgentStatus(a.agentId);
            updated.push({
              agentId: a.agentId,
              agentName: a.agentName,
              selector: a.selector,
              colorIndex: a.colorIndex,
              status: agentStatus,
              fading: false,
            });
          }
        }

        return updated;
      });
    },
    [subscribeAgentStatus],
  );

  // ── Poll AO API for active cursors on this page ──
  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;
      try {
        const url = `${AGENT_MANAGER_URL}/api/cursors?page_url=${encodeURIComponent(location.href)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
        const data = (await res.json()) as {
          agents: { agentId: string; agentName: string; selector: string; colorIndex: number; status?: string }[];
        };

        // Activate new agents
        if (data.agents?.length > 0) {
          activateAgents(data.agents);
          onAgentsDetected?.();
        }

        // Detect agents that vanished from the response (batch completed)
        const activeIds = new Set((data.agents || []).map((a) => a.agentId));
        for (const knownId of knownAgentIdsRef.current) {
          if (!activeIds.has(knownId)) {
            completeAgent(knownId, "completed");
          }
        }
      } catch {
        // AO not reachable — ignore
      }
    }

    // Poll immediately, then every 3s
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activateAgents, completeAgent, onAgentsDetected]);

  // ── NATS subscription as backup (catches batches starting while page is loaded) ──
  useEffect(() => {
    if (!natsClient.connected) return;

    const subId = natsClient.subscribe("vex.batch.*.cursors", (data: object) => {
      const msg = data as CursorInit;
      if (msg.type !== "cursor_init") return;

      // Only activate if this page matches the batch page URL
      const currentUrl = location.href.replace(/\/$/, "");
      const batchUrl = (msg.pageUrl || "").replace(/\/$/, "");
      if (batchUrl && currentUrl !== batchUrl) return;

      activateAgents(msg.agents);
    });

    subIdsRef.current.push(subId);
    return cleanupSubs;
  }, [natsClient, natsClient.connected, cleanupSubs, activateAgents]);

  if (agents.length === 0) return null;

  return (
    <div className="cs-overlay">
      {agents.map((agent) => (
        <AgentCursor key={agent.agentId} agent={agent} />
      ))}
    </div>
  );
}
