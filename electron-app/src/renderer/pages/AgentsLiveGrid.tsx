import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ArrowLeft, Bot, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { AgentStep, StepType } from "../components/project-detail/AgentStepItem";
import { hookEventToStep } from "../utils/hook-steps";

/* ─── Types ──────────────────────────────────────── */

interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  total_cost_usd?: number;
}

interface AgentBinding {
  agentId: string;
  agentName: string;
  selector: string;
  actionType: string;
  colorIndex: number;
  status: "running" | "completed" | "failed";
  steps: AgentStep[];
  info: AgentInfo;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ─── Constants ──────────────────────────────────── */

const PALETTE = [
  "#a78bfa", "#f59e0b", "#06b6d4", "#f43f5e", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];
const DONE_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";

function getColor(status: string, idx: number): string {
  if (status === "completed") return DONE_COLOR;
  if (status === "failed") return FAIL_COLOR;
  return PALETTE[idx % PALETTE.length];
}

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

function parseActionIndex(name: string): number {
  const m = name.match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

/** Pick a random point inside a rect with padding */
function randomInRect(r: Rect, pad = 20): { x: number; y: number } {
  return {
    x: r.x + pad + Math.random() * Math.max(0, r.w - 2 * pad),
    y: r.y + pad + Math.random() * Math.max(0, r.h - 2 * pad),
  };
}

/* ─── Cursor SVGs (inline in React) ─────────────── */

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

/* ─── Main Page ──────────────────────────────────── */

export function AgentsLiveGrid() {
  const { id: projectId = "", batchId = "" } = useParams<{ id: string; batchId: string }>();
  const navigate = useNavigate();

  const [bindings, setBindings] = useState<AgentBinding[]>([]);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [webviewReady, setWebviewReady] = useState(false);
  const [webviewError, setWebviewError] = useState(false);
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const [cursorPositions, setCursorPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const webviewRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const highlightsInjectedRef = useRef(false);
  const prevStepCountsRef = useRef<Map<string, number>>(new Map());

  const getWv = useCallback((): any => {
    const el = containerRef.current?.querySelector("webview") ?? document.querySelector("webview");
    if (el) webviewRef.current = el;
    return el;
  }, []);

  const exec = useCallback(async (script: string) => {
    const wv = getWv();
    if (!wv || typeof wv.executeJavaScript !== "function") return null;
    try { return await wv.executeJavaScript(script); } catch { return null; }
  }, [getWv]);

  // ── Fetch batch data ──
  const initData = useCallback(async () => {
    try {
      const batch = await window.electronAPI.getBatch(projectId, batchId);
      if (!batch) { setLoading(false); return; }
      setPageUrl(batch.page_url ?? null);

      const actions: { selector: string; type: string; sequence_index: number }[] =
        (batch.actions ?? []).map((a: any, i: number) => ({
          selector: a.selector, type: a.type, sequence_index: a.sequence_index ?? i,
        }));
      const tasksResult = await window.electronAPI.getBatchTasks(projectId, batchId);
      const tasks: { agent_id: string }[] = tasksResult?.tasks ?? [];
      const agentsResult = await window.electronAPI.getProjectAgents(projectId);
      const allAgents: AgentInfo[] = agentsResult?.agents ?? [];

      const agentMap = new Map<string, AgentInfo>();
      for (const a of allAgents) agentMap.set(a.id, a);
      const agentIds = new Set<string>();
      for (const t of tasks) { if (t.agent_id) agentIds.add(t.agent_id); }

      const newBindings: AgentBinding[] = [];

      for (const agentId of agentIds) {
        const info = agentMap.get(agentId) ?? {
          id: agentId, name: `Agent ${agentId.slice(0, 8)}`, type: "unknown",
          status: "running", created_at: new Date().toISOString(),
        };
        const actionIdx = parseActionIndex(info.name);
        const action = actions.find((a) => a.sequence_index === actionIdx) ?? actions[newBindings.length];

        let steps: AgentStep[] = [];
        let status: "running" | "completed" | "failed" = "running";

        try {
          const stepsData = await window.electronAPI.getAgentSteps(agentId);
          if (stepsData?.steps?.length > 0)
            steps = stepsData.steps.map((s: Record<string, unknown>, i: number) => liveStepToAgentStep(s, i));
          if (stepsData?.status && stepsData.status !== "running")
            status = stepsData.status as "completed" | "failed";
        } catch {}
        if (info.status === "completed" || info.status === "stopped") status = "completed";
        if (info.status === "failed" || info.status === "error") status = "failed";
        if (status !== "running") {
          try {
            const trace = await window.electronAPI.getAgentTraceByAgent(agentId);
            if (trace?.steps?.length > 0) steps = trace.steps;
          } catch {}
        }

        newBindings.push({
          agentId, agentName: info.name,
          selector: action?.selector ?? `[data-vex-fallback="${agentId}"]`,
          actionType: action?.type ?? "unknown",
          colorIndex: actionIdx >= 0 ? actionIdx : newBindings.length,
          status, steps, info,
        });

        if (status === "running") {
          await window.electronAPI.subscribeAgentSteps(agentId);

          const removeStepListener = window.electronAPI.onAgentStep((data) => {
            if (data.agentId !== agentId) return;
            const idx = typeof data.index === "number" ? data.index : Date.now();
            const step = liveStepToAgentStep(data, idx);
            setBindings((prev) =>
              prev.map((b) => {
                if (b.agentId !== agentId) return b;
                if (typeof data.index === "number" && b.steps.some((s) => s.sequence_index === idx)) return b;
                return { ...b, steps: [...b.steps, step] };
              }),
            );
          });
          const removeStatusListener = window.electronAPI.onAgentStatus((data) => {
            if (data.agentId !== agentId) return;
            const raw = data.status as string;
            const newStatus: "completed" | "failed" = raw === "failed" || raw === "error" ? "failed" : "completed";
            setBindings((prev) => prev.map((b) => (b.agentId === agentId ? { ...b, status: newStatus } : b)));
            setTimeout(async () => {
              try {
                const trace = await window.electronAPI.getAgentTraceByAgent(agentId);
                if (trace?.steps?.length > 0)
                  setBindings((prev) => prev.map((b) => (b.agentId === agentId ? { ...b, steps: trace.steps } : b)));
              } catch {}
            }, 1500);
          });
          const removeHookListener = window.electronAPI.onAgentHook((data) => {
            if (data.agentId !== agentId) return;
            const hookStep = hookEventToStep(data);
            if (!hookStep) return;
            setBindings((prev) => prev.map((b) => (b.agentId === agentId ? { ...b, steps: [...b.steps, hookStep] } : b)));
          });

          cleanupFnsRef.current.push(() => {
            removeStepListener(); removeStatusListener(); removeHookListener();
            window.electronAPI.unsubscribeAgentSteps(agentId);
          });
        }
      }

      console.log("[MC] Loaded", newBindings.length, "bindings:", newBindings.map((b) => `${b.agentName}(${b.status}, ${b.steps.length} steps)`).join(", "));
      setBindings(newBindings);
      setLoading(false);
    } catch (err) { console.error("[MC] initData error:", err); setLoading(false); }
  }, [projectId, batchId]);

  useEffect(() => {
    initData();
    return () => { for (const fn of cleanupFnsRef.current) fn(); cleanupFnsRef.current = []; };
  }, [initData]);

  // ── Webview readiness ──
  useEffect(() => {
    if (!pageUrl) return;
    let cancelled = false;
    let listenerWv: any = null;
    const markReady = () => { if (!cancelled) { console.log("[MC] Webview ready"); setWebviewReady(true); setWebviewError(false); } };
    const markError = () => { if (!cancelled) setWebviewError(true); };
    const check = setInterval(() => {
      const wv = getWv();
      if (!wv) return;
      if (!listenerWv) {
        listenerWv = wv;
        wv.addEventListener("dom-ready", markReady);
        wv.addEventListener("did-finish-load", markReady);
        wv.addEventListener("did-fail-load", markError);
      }
      try {
        if (typeof wv.isLoading === "function" && !wv.isLoading()) {
          const url = wv.getURL();
          if (url && url !== "about:blank") { markReady(); clearInterval(check); }
        }
      } catch {}
    }, 150);
    return () => {
      cancelled = true; clearInterval(check);
      if (listenerWv) {
        listenerWv.removeEventListener("dom-ready", markReady);
        listenerWv.removeEventListener("did-finish-load", markReady);
        listenerWv.removeEventListener("did-fail-load", markError);
      }
    };
  }, [pageUrl, getWv]);

  // ── Inject outline CSS onto elements (one-time, tiny injection) ──
  useEffect(() => {
    if (!webviewReady || bindings.length === 0 || highlightsInjectedRef.current) return;
    highlightsInjectedRef.current = true;
    console.log("[MC] Injecting outlines for", bindings.length, "elements");

    const selectors = bindings.map((b) => ({
      sel: b.selector,
      color: getColor(b.status, b.colorIndex),
    }));

    exec(`(function(){
      var css=document.createElement("style");
      css.textContent=".vex-hl{outline-style:solid!important;outline-width:2.5px!important;outline-offset:3px!important;transition:outline-color .5s,outline-width .3s,outline-offset .3s}.vex-hl.vex-fl{outline-width:4px!important;outline-offset:5px!important}";
      document.head.appendChild(css);
      var items=${JSON.stringify(selectors)};
      items.forEach(function(it){
        var el=document.querySelector(it.sel);
        if(el){el.classList.add("vex-hl");el.style.setProperty("--vc",it.color);el.style.setProperty("outline-color",it.color,"important")}
      });
    })()`);
  }, [webviewReady, bindings, exec]);

  // ── Poll element positions from webview ──
  useEffect(() => {
    if (!webviewReady || bindings.length === 0) return;

    const selectors = bindings.map((b) => b.selector);
    let active = true;

    async function poll() {
      if (!active) return;
      const result = await exec(
        `(function(){var s=${JSON.stringify(selectors)};return s.map(function(sel){try{var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}catch(e){return null}})})()`
      );
      if (!active || !Array.isArray(result)) { console.log("[MC] Poll returned non-array:", result); return; }
      const newRects = new Map<string, Rect>();
      bindings.forEach((b, i) => {
        if (result[i]) newRects.set(b.agentId, result[i] as Rect);
      });
      setRects(newRects);
    }

    poll();
    const interval = setInterval(poll, 600);
    return () => { active = false; clearInterval(interval); };
  }, [webviewReady, bindings, exec]);

  // ── Cursor movement: periodic random drift + step-triggered moves ──
  // Single interval handles everything — no dependency on bindings changes.
  useEffect(() => {
    if (rects.size === 0 || bindings.length === 0) {
      console.log("[MC] Waiting — rects:", rects.size, "bindings:", bindings.length);
      return;
    }

    console.log("[MC] Starting cursor movement. Agents:", bindings.map((b) => `${b.agentName}(${b.status})`).join(", "));
    console.log("[MC] Rects available:", [...rects.keys()].join(", "));

    // Place cursors that don't have a position yet
    setCursorPositions((prev) => {
      const next = new Map(prev);
      let placed = 0;
      for (const b of bindings) {
        if (!next.has(b.agentId)) {
          const r = rects.get(b.agentId);
          if (r) { next.set(b.agentId, randomInRect(r)); placed++; }
        }
      }
      if (placed > 0) console.log("[MC] Placed", placed, "cursors initially");
      return next;
    });

    // Init step counts
    for (const b of bindings) {
      if (!prevStepCountsRef.current.has(b.agentId)) {
        prevStepCountsRef.current.set(b.agentId, b.steps.length);
      }
    }

    // Periodic drift for running agents (every 2s, move to a new random position)
    const driftInterval = setInterval(() => {
      setCursorPositions((prev) => {
        const next = new Map(prev);
        let moved = 0;
        for (const b of bindings) {
          if (b.status === "running") {
            const r = rects.get(b.agentId);
            if (r) { next.set(b.agentId, randomInRect(r)); moved++; }
          }
        }
        if (moved > 0) console.log("[MC] Drift:", moved, "running cursors moved");
        return next;
      });
    }, 2000);

    return () => clearInterval(driftInterval);
  }, [rects, bindings]);

  // ── Move cursor on real step arrival ──
  useEffect(() => {
    if (rects.size === 0) return;
    for (const b of bindings) {
      const prev = prevStepCountsRef.current.get(b.agentId) ?? 0;
      if (b.steps.length > prev) {
        console.log("[MC] Step for", b.agentName, ":", prev, "→", b.steps.length);
        prevStepCountsRef.current.set(b.agentId, b.steps.length);
        const r = rects.get(b.agentId);
        if (r) {
          setCursorPositions((p) => new Map(p).set(b.agentId, randomInRect(r)));
        }
        exec(`(function(){var e=document.querySelector(${JSON.stringify(b.selector)});if(e){e.classList.add("vex-fl");setTimeout(function(){e.classList.remove("vex-fl")},600)}})()`);
      }
    }
  }, [bindings, rects, exec]);

  // ── Update outline colors when status changes ──
  useEffect(() => {
    if (!webviewReady) return;
    for (const b of bindings) {
      const color = getColor(b.status, b.colorIndex);
      exec(`(function(){var e=document.querySelector(${JSON.stringify(b.selector)});if(e){e.style.setProperty("outline-color",${JSON.stringify(color)},"important")}})()`);
    }
  }, [webviewReady, bindings, exec]);

  // ── Header entrance ──
  useEffect(() => {
    if (loading) return;
    const h = headerRef.current;
    if (h) gsap.fromTo(h, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" });
  }, [loading]);

  const runningCount = bindings.filter((b) => b.status === "running").length;
  const completedCount = bindings.filter((b) => b.status === "completed").length;
  const failedCount = bindings.filter((b) => b.status === "failed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#0d0d1a" }}>
      {/* Header */}
      <header
        ref={headerRef}
        style={{
          position: "relative", zIndex: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: "48px",
          background: "rgba(13, 13, 26, 0.85)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "6px", color: "rgba(255,255,255,0.5)", cursor: "pointer", background: "none", border: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; e.currentTarget.style.background = "none"; }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bot size={18} style={{ color: "#a78bfa" }} />
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Mission Control</span>
            <span style={{
              fontSize: "10px", fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.35)",
              padding: "2px 8px", borderRadius: "4px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
            }}>
              {batchId.slice(0, 12)}...
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
          {runningCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#a78bfa" }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> {runningCount} running
            </span>
          )}
          {completedCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: DONE_COLOR }}>
              <CheckCircle size={12} /> {completedCount} done
            </span>
          )}
          {failedCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: FAIL_COLOR }}>
              <XCircle size={12} /> {failedCount} failed
            </span>
          )}
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-mono)" }}>
            {bindings.length} {bindings.length === 1 ? "agent" : "agents"}
          </span>
        </div>
      </header>

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", color: "rgba(255,255,255,0.4)" }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#a78bfa" }} />
          <span style={{ fontSize: "14px" }}>Loading agents...</span>
        </div>
      ) : (
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Webview */}
          {pageUrl ? (
            <webview
              src={pageUrl}
              partition="mission-control"
              webpreferences="contextIsolation=no"
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%", border: "none",
                opacity: webviewReady ? 1 : 0, transition: "opacity 0.5s",
              }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "rgba(255,255,255,0.3)" }}>
              <Bot size={40} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: "14px" }}>No page URL available</span>
            </div>
          )}

          {/* Loading / error states */}
          {pageUrl && !webviewReady && !webviewError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", color: "rgba(255,255,255,0.4)", background: "#0d0d1a", zIndex: 5 }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#a78bfa" }} />
              <span style={{ fontSize: "13px" }}>Loading page...</span>
            </div>
          )}
          {webviewError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "rgba(255,255,255,0.3)", background: "#0d0d1a", zIndex: 5 }}>
              <span style={{ fontSize: "32px", opacity: 0.5 }}>&#x26A0;</span>
              <span style={{ fontSize: "13px" }}>Could not load page</span>
            </div>
          )}

          {/* Cursor overlay — pure React, positioned on top of webview */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
            {bindings.map((b) => {
              const pos = cursorPositions.get(b.agentId);
              if (!pos) return null;
              const color = getColor(b.status, b.colorIndex);
              const isDone = b.status === "completed" || b.status === "failed";

              return (
                <div
                  key={b.agentId}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    transition: "left 0.45s cubic-bezier(.4,.2,.2,1), top 0.45s cubic-bezier(.4,.2,.2,1)",
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
                    zIndex: 999,
                  }}
                >
                  {isDone ? <CursorCheck color={color} /> : <CursorArrow color={color} />}
                  <span
                    style={{
                      position: "absolute",
                      left: 16,
                      top: 16,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: color,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      lineHeight: "1.4",
                      opacity: isDone ? 0.75 : 1,
                      fontStyle: isDone ? "italic" : "normal",
                    }}
                  >
                    {b.agentName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && bindings.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "rgba(255,255,255,0.3)", zIndex: 3 }}>
          <Bot size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: "14px" }}>No agents found for this batch</span>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
