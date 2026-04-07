import { useCallback, useEffect, useRef, useState } from "react";
import type { NatsClient } from "../hooks/useNatsClient";
import { AGENT_MANAGER_URL } from "../../shared/messages";
import { AgentStatusPanel } from "./AgentStatusPanel";
import { FollowUpDialog } from "./FollowUpDialog";
import { clampToViewport } from "../utils/positioning";

/* ─── Types ──────────────────────────────────────── */

interface CursorAgent {
  agentId: string;
  agentName: string;
  selector: string;
  colorIndex: number;
  status: "running" | "completed" | "failed";
  fading: boolean;
  showReply: boolean;
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

function AgentCursor({
  agent,
  onReply,
  onDismiss,
}: {
  agent: CursorAgent;
  onReply: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const color = getColor(agent.status, agent.colorIndex);
  const isDone = agent.status === "completed" || agent.status === "failed";

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

  const animDelay = useRef(`${Math.random() * -4}s`);

  return (
    <>
      <div ref={ref} className="vex-agent-outline" style={{ borderColor: color, display: "none" }} />
      <CursorInner
        parentRef={ref}
        agent={agent}
        color={color}
        isDone={isDone}
        animDelay={animDelay.current}
        onReply={onReply}
        onDismiss={onDismiss}
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
  onReply,
  onDismiss,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  agent: CursorAgent;
  color: string;
  isDone: boolean;
  animDelay: string;
  onReply: () => void;
  onDismiss: () => void;
}) {
  const cursorRef = useRef<HTMLDivElement>(null);

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
      const rawTop = top + height * 0.25;
      const rawLeft = left + width * 0.2;
      const clamped = clampToViewport(rawTop, rawLeft, 100, 56, 22);
      cursorRef.current.style.top = clamped.top + "px";
      cursorRef.current.style.left = clamped.left + "px";
    };

    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [parentRef]);

  return (
    <div
      ref={cursorRef}
      className={`vex-agent-cursor ${isDone ? "vex-agent-cursor--done" : ""} ${agent.fading ? "vex-agent-cursor--fading" : ""}`}
      style={{ animationDelay: animDelay, pointerEvents: isDone ? "auto" : "none", display: "none" }}
    >
      {agent.status === "failed" ? (
        <CursorFail color={color} />
      ) : isDone ? (
        <CursorCheck color={color} />
      ) : (
        <CursorArrow color={color} />
      )}
      <span className="vex-agent-cursor-name" style={{ background: color }}>
        {agent.agentName}
      </span>

      {isDone && agent.showReply && !agent.fading && (
        <div style={{ position: "absolute", left: "16px", top: "34px", display: "flex", gap: "4px" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onReply(); }}
            className="vex-cursor-reply-btn"
            title="Continue conversation"
          >
            💬
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="vex-cursor-dismiss-btn"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────── */

interface AgentCursorsProps {
  natsClient: NatsClient;
  onAgentsDetected?: () => void;
  shadowRoot: ShadowRoot;
}

export function AgentCursors({ natsClient, onAgentsDetected, shadowRoot }: AgentCursorsProps) {
  const [agents, setAgents] = useState<CursorAgent[]>([]);
  const subIdsRef = useRef<string[]>([]);
  const knownAgentIdsRef = useRef<Set<string>>(new Set());
  const completedAgentIdsRef = useRef<Set<string>>(new Set());
  const [replyAgentId, setReplyAgentId] = useState<string | null>(null);
  // When viewing a historical batch, polling is paused
  const historicalModeRef = useRef(false);

  const cleanupSubs = useCallback(() => {
    for (const id of subIdsRef.current) {
      natsClient.unsubscribe(id);
    }
    subIdsRef.current = [];
  }, [natsClient]);

  const completeAgent = useCallback((agentId: string, finalStatus: "completed" | "failed") => {
    completedAgentIdsRef.current.add(agentId);
    setAgents((prev) =>
      prev.map((ag) =>
        ag.agentId === agentId && !ag.fading ? { ...ag, status: finalStatus, showReply: true } : ag,
      ),
    );
  }, []);

  const dismissAgent = useCallback((agentId: string) => {
    setReplyAgentId((prev) => prev === agentId ? null : prev);
    setAgents((prev) =>
      prev.map((ag) =>
        ag.agentId === agentId ? { ...ag, showReply: false, fading: true } : ag,
      ),
    );
    setTimeout(() => {
      setAgents((prev) => prev.filter((ag) => ag.agentId !== agentId));
      knownAgentIdsRef.current.delete(agentId);
    }, FADE_DURATION);
  }, []);

  const subscribeAgentStatus = useCallback(
    (agentId: string) => {
      if (!natsClient.connected) return;
      const statusSubId = natsClient.subscribe(
        `vex.agent.${agentId}.status`,
        (statusData: object) => {
          const sd = statusData as { status?: string };
          const raw = sd.status || "";
          // Ignore non-terminal statuses (e.g. "running" from continuation start)
          if (raw === "running" || raw === "starting") return;
          const newStatus: "completed" | "failed" =
            raw === "failed" || raw === "error" ? "failed" : "completed";
          completeAgent(agentId, newStatus);
        },
      );
      subIdsRef.current.push(statusSubId);
    },
    [natsClient, completeAgent],
  );

  const continueAgent = useCallback(async (agentId: string, message: string) => {
    setReplyAgentId(null);
    try {
      const res = await fetch(`${AGENT_MANAGER_URL}/api/agents/${agentId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;

      completedAgentIdsRef.current.delete(agentId);
      setAgents((prev) =>
        prev.map((ag) =>
          ag.agentId === agentId ? { ...ag, status: "running", showReply: false, fading: false } : ag,
        ),
      );

      subscribeAgentStatus(agentId);
    } catch {
      // Error — agent stays in current state
    }
  }, [subscribeAgentStatus]);

  const activateAgents = useCallback(
    (incoming: { agentId: string; agentName: string; selector: string; colorIndex: number; status?: string }[]) => {
      setAgents((prev) => {
        const existingIds = new Set(prev.map((a) => a.agentId));
        const updated = [...prev];

        for (const a of incoming) {
          if (completedAgentIdsRef.current.has(a.agentId)) continue;

          const agentStatus = (a.status as CursorAgent["status"]) || "running";

          if (existingIds.has(a.agentId)) {
            const idx = updated.findIndex((x) => x.agentId === a.agentId);
            if (idx >= 0 && updated[idx].status !== agentStatus && !updated[idx].fading) {
              updated[idx] = { ...updated[idx], status: agentStatus };
            }
          } else {
            knownAgentIdsRef.current.add(a.agentId);
            subscribeAgentStatus(a.agentId);
            updated.push({
              agentId: a.agentId,
              agentName: a.agentName,
              selector: a.selector,
              colorIndex: a.colorIndex,
              status: agentStatus,
              fading: false,
              showReply: false,
            });
          }
        }

        return updated;
      });
    },
    [subscribeAgentStatus],
  );

  // ── Shared handler for loading batch cursors ──
  const handleLoadBatchCursors = useCallback(
    (incoming: { agentId: string; agentName: string; selector: string; colorIndex: number; status: string }[]) => {
      if (incoming.length === 0) {
        // Deselect — exit historical mode, clear agents, resume polling
        historicalModeRef.current = false;
        setAgents([]);
        knownAgentIdsRef.current.clear();
        completedAgentIdsRef.current.clear();
        return;
      }

      // Enter historical mode — stop polling, load batch agents
      historicalModeRef.current = true;
      // Ensure NATS connects so continuations can subscribe to status events
      onAgentsDetected?.();

      const mapped: CursorAgent[] = incoming.map((a) => {
        const status = (a.status === "failed" ? "failed" : a.status === "running" ? "running" : "completed") as CursorAgent["status"];
        return {
          agentId: a.agentId,
          agentName: a.agentName,
          selector: a.selector,
          colorIndex: a.colorIndex,
          status,
          fading: false,
          showReply: status !== "running",
        };
      });

      knownAgentIdsRef.current.clear();
      completedAgentIdsRef.current.clear();
      for (const a of mapped) {
        knownAgentIdsRef.current.add(a.agentId);
        if (a.status !== "running") {
          completedAgentIdsRef.current.add(a.agentId);
        }
      }
      setAgents(mapped);
    },
    [onAgentsDetected],
  );

  // ── Listen for loadBatchCursors messages from popup ──
  useEffect(() => {
    const listener = (
      message: { action: string; agents?: { agentId: string; agentName: string; selector: string; colorIndex: number; status: string }[] },
    ) => {
      if (message.action !== "loadBatchCursors") return;
      handleLoadBatchCursors(message.agents ?? []);
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [handleLoadBatchCursors]);

  // ── Initial fetch of active cursors on mount (no polling) ──
  useEffect(() => {
    if (historicalModeRef.current) return;

    async function fetchInitialCursors() {
      try {
        const url = `${AGENT_MANAGER_URL}/api/cursors?page_url=${encodeURIComponent(location.href)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
        if (historicalModeRef.current) return;

        const data = (await res.json()) as {
          agents: { agentId: string; agentName: string; selector: string; colorIndex: number; status?: string }[];
        };

        if (data.agents?.length > 0) {
          activateAgents(data.agents);
          onAgentsDetected?.();
        }
      } catch {
        // AO not reachable
      }
    }

    fetchInitialCursors();
  }, [activateAgents, onAgentsDetected]);

  // ── When NATS connects, subscribe to status for all known running agents ──
  useEffect(() => {
    if (!natsClient.connected) return;
    for (const agentId of knownAgentIdsRef.current) {
      if (!completedAgentIdsRef.current.has(agentId)) {
        subscribeAgentStatus(agentId);
      }
    }
  }, [natsClient.connected, subscribeAgentStatus]);

  // ── NATS subscription as backup ──
  useEffect(() => {
    if (!natsClient.connected) return;

    const subId = natsClient.subscribe("vex.batch.*.cursors", (data: object) => {
      const msg = data as CursorInit;
      if (msg.type !== "cursor_init") return;

      const currentUrl = location.href.replace(/\/$/, "");
      const batchUrl = (msg.pageUrl || "").replace(/\/$/, "");
      if (batchUrl && currentUrl !== batchUrl) return;

      activateAgents(msg.agents);
    });

    subIdsRef.current.push(subId);
    return cleanupSubs;
  }, [natsClient, natsClient.connected, cleanupSubs, activateAgents]);

  // Get the cursor position for the reply dialog anchor
  const replyAgent = replyAgentId ? agents.find((a) => a.agentId === replyAgentId) : null;
  const replyAnchor = useRef<{ top: number; left: number }>({ top: 200, left: 200 });
  if (replyAgent) {
    try {
      const el = document.querySelector(replyAgent.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        replyAnchor.current = { top: rect.top + rect.height * 0.3, left: rect.left + rect.width * 0.2 };
      }
    } catch { /* selector might be invalid */ }
  }

  if (agents.length === 0) return null;

  return (
    <div className="cs-overlay">
      {agents.map((agent) => (
        <AgentCursor
          key={agent.agentId}
          agent={agent}
          onReply={() => setReplyAgentId(agent.agentId)}
          onDismiss={() => dismissAgent(agent.agentId)}
        />
      ))}
      <AgentStatusPanel
        agents={agents.map((a) => ({ agentId: a.agentId, agentName: a.agentName, status: a.status }))}
        onContinue={(agentId, msg) => continueAgent(agentId, msg)}
      />
      {replyAgentId && replyAgent && (
        <FollowUpDialog
          agentName={replyAgent.agentName}
          anchorTop={replyAnchor.current.top}
          anchorLeft={replyAnchor.current.left}
          shadowRoot={shadowRoot}
          onSubmit={(msg) => continueAgent(replyAgentId, msg)}
          onCancel={() => setReplyAgentId(null)}
        />
      )}
    </div>
  );
}
