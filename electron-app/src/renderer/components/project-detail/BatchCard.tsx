import React, { useRef, useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ExternalLink,
  Bot,
  Type,
  Palette,
  Move,
  Copy,
  Trash2,
  MousePointer,
  Image,
  LayoutGrid,
  Maximize2,
  Scissors,
  PaintBucket,
  Square,
  Ban,
} from "lucide-react";
import { OperatorRobot } from "../projects/OperatorRobot";

interface BatchAction {
  id?: string;
  type: string;
  selector?: string;
  description?: string;
  instruction?: string;
  before?: string;
  after?: string;
  data?: Record<string, unknown>;
}

interface Batch {
  id: string;
  status: string;
  page_url?: string;
  actions?: BatchAction[];
  action_count?: number;
  duration_ms?: number | null;
  cost_usd?: number | null;
  created_at?: string;
  submitted_at?: string;
  completed_at?: string | null;
  error_message?: string | null;
  agent_trace_id?: string | null;
}

interface BatchCardProps {
  batch: Batch;
  projectId: string;
  onViewTrace?: (traceId: string) => void;
  onViewAgent?: (agentId: string) => void;
  onDelete?: (batchId: string) => void;
  onStop?: (batchId: string) => void;
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

function formatPagePath(url?: string): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function formatModelName(model?: string): string {
  if (!model) return "Agent";
  if (model.includes("sonnet")) return "Sonnet 4.5";
  if (model.includes("opus")) return "Opus 4.6";
  if (model.includes("haiku")) return "Haiku 4.5";
  return model.split("-").slice(0, 2).join(" ");
}

const STATUS_CONFIG: Record<string, { Icon: React.ElementType; color: string }> = {
  completed:  { Icon: CheckCircle2, color: "var(--status-success)" },
  failed:     { Icon: XCircle, color: "var(--status-error)" },
  running:    { Icon: Loader2, color: "var(--status-info)" },
  processing: { Icon: Loader2, color: "var(--status-info)" },
  queued:     { Icon: Clock, color: "var(--status-idle)" },
  pending:    { Icon: Clock, color: "var(--status-idle)" },
  cancelled:  { Icon: Ban, color: "var(--status-warning)" },
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  select: MousePointer,
  editText: Type,
  styleChange: Palette,
  move: Move,
  duplicate: Copy,
  delete: Trash2,
  insert: LayoutGrid,
  replaceImage: Image,
  resize: Maximize2,
  wrap: Scissors,
  copyStyle: PaintBucket,
  generateSection: LayoutGrid,
};

interface TaskInfo {
  agent_id: string;
  agent_name?: string;
  status: string;
}

export function BatchCard({ batch, projectId, onViewTrace, onViewAgent, onDelete, onStop }: BatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadedActions, setLoadedActions] = useState<BatchAction[] | null>(null);
  const [actionTasks, setActionTasks] = useState<TaskInfo[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [hasRunningAgents, setHasRunningAgents] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const config = STATUS_CONFIG[batch.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.Icon;
  const isSpinning = batch.status === "running" || batch.status === "processing";
  const pagePath = formatPagePath(batch.page_url);
  const actionCount = batch.action_count ?? batch.actions?.length ?? 0;

  // Fetch agent count eagerly on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tasksResult = await window.electronAPI.getBatchTasks(projectId, batch.id);
        if (cancelled || !tasksResult?.tasks) return;
        const uniqueAgents = new Set<string>();
        let anyRunning = false;
        for (const t of tasksResult.tasks) {
          if (t.agent_id) uniqueAgents.add(t.agent_id);
          if (t.status === "in_progress" || t.status === "running") anyRunning = true;
        }
        setAgentCount(uniqueAgents.size);
        setHasRunningAgents(anyRunning);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [projectId, batch.id, batch.status]);

  // Fetch full batch with actions + tasks on expand
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      try {
        // Fetch actions
        if (!batch.actions || batch.actions.length === 0) {
          const full = await window.electronAPI.getBatch(projectId, batch.id);
          if (!cancelled && full?.actions) setLoadedActions(full.actions);
        } else {
          setLoadedActions(batch.actions);
        }
        // Fetch tasks (agent mapping)
        const tasksResult = await window.electronAPI.getBatchTasks(projectId, batch.id);
        if (!cancelled && tasksResult?.tasks) {
          setActionTasks(tasksResult.tasks.map((t: any) => ({
            agent_id: t.agent_id,
            status: t.status,
          })));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [expanded, batch.id, projectId, batch.status]);

  const displayActions = loadedActions ?? batch.actions ?? [];

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        overflow: "hidden",
        transition: "border-color 0.15s",
        flexShrink: 0,
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
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--surface-elevated)";
          const btn = e.currentTarget.querySelector(".batch-delete-btn") as HTMLElement | null;
          if (btn) btn.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          const btn = e.currentTarget.querySelector(".batch-delete-btn") as HTMLElement | null;
          if (btn) btn.style.opacity = "0";
        }}
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
              }}
            >
              {batch.id}
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

        {isSpinning && onStop && (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(batch.id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onStop(batch.id); } }}
            title="Stop batch"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              flexShrink: 0,
              background: "hsla(0, 84%, 60%, 0.08)",
              border: "1px solid hsla(0, 84%, 60%, 0.2)",
              borderRadius: "9999px",
              padding: "2px 8px",
              fontSize: "10px",
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

        {agentCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 6px",
              borderRadius: "9999px",
              flexShrink: 0,
              background: hasRunningAgents ? "hsla(142, 69%, 45%, 0.06)" : "var(--surface-elevated)",
              border: `1px solid ${hasRunningAgents ? "hsla(142, 69%, 45%, 0.2)" : "var(--border)"}`,
            }}
          >
            {Array.from({ length: agentCount }).map((_, i) => (
              <OperatorRobot key={i} size={14} idle={!hasRunningAgents} />
            ))}
          </span>
        )}

        <span style={{ fontSize: "11px", color: "var(--foreground-disabled)", flexShrink: 0 }}>
          {formatTimestamp(batch.submitted_at || batch.created_at || "")}
        </span>

        {onDelete && (
          <button
            className="batch-delete-btn"
            onClick={(e) => { e.stopPropagation(); onDelete(batch.id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onDelete(batch.id); } }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "none",
              border: "none",
              padding: "2px",
              color: "var(--foreground-dim)",
              opacity: 0,
              cursor: "pointer",
              transition: "opacity 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--foreground-dim)")}
          >
            <Trash2 size={13} />
          </button>
        )}

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

          {displayActions.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "4px", paddingBottom: "8px" }}>
              {displayActions.map((action, idx) => (
                <ActionRow key={action.id || idx} action={action} index={idx} task={actionTasks[idx]} onViewAgent={onViewAgent} />
              ))}
            </div>
          )}

          {displayActions.length === 0 && loadedActions === null && (
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", fontSize: "12px", color: "var(--foreground-dim)" }}>
              <Loader2 size={12} className="spin" style={{ marginRight: "6px" }} />
              Loading actions...
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

// Color mapping matching the Chrome extension
const TYPE_BADGE_COLORS: Record<string, string> = {
  select: "#3b82f6",
  insert: "#22c55e",
  editText: "#eab308",
  delete: "#ef4444",
  duplicate: "#06b6d4",
  move: "#8b5cf6",
  wrap: "#64748b",
  resize: "#a855f7",
  styleChange: "#f97316",
  replaceImage: "#ec4899",
  generateSection: "#14b8a6",
  copyStyle: "#6366f1",
};

const SCREENSHOT_BASE = "http://localhost:8420/api/storage/screenshot?path=";

function ActionRow({ action, index, task, onViewAgent }: { action: BatchAction; index: number; task?: TaskInfo; onViewAgent?: (agentId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const ActionIcon = ACTION_ICONS[action.type] || MousePointer;
  const badgeColor = TYPE_BADGE_COLORS[action.type] || "#6b7280";

  const instruction = (action.instruction || (action as any).prompt || action.description || "") as string;
  const screenshotBefore = (action as any).screenshot_before as string | null;
  const screenshotAfter = (action as any).screenshot_after as string | null;
  const deltas = (action as any).deltas as any[] | null;
  const changes = (action as any).changes as any[] | null;
  const dimensions = (action as any).dimensions as any | null;
  const hasDetails = instruction || action.before || action.after || screenshotBefore || screenshotAfter || deltas || changes || dimensions;

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => hasDetails && setExpanded(!expanded)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && hasDetails) { e.preventDefault(); setExpanded(!expanded); } }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 16px",
          cursor: hasDetails ? "pointer" : "default",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { if (hasDetails) e.currentTarget.style.background = "var(--surface-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {/* Index number */}
        <span style={{
          width: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: "9999px", fontSize: "10px", fontWeight: 600, flexShrink: 0,
          background: "var(--surface-elevated)", color: "var(--foreground-dim)", border: "1px solid var(--border)",
        }}>
          {index + 1}
        </span>

        {/* Colored type badge */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "4px",
          padding: "1px 6px", borderRadius: "3px", color: "#fff",
          fontSize: "10px", fontWeight: 600, lineHeight: "18px", flexShrink: 0, background: badgeColor,
        }}>
          <ActionIcon size={10} />
          {action.type}
        </span>

        {/* Selector */}
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--foreground-dim)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
        }}>
          {action.selector}
        </span>

        {/* Instruction preview (collapsed) */}
        {!expanded && instruction && (
          <span style={{
            fontSize: "11px", color: "var(--foreground-dim)", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px", flexShrink: 1,
          }}>
            {instruction}
          </span>
        )}

        {/* Agent badge */}
        {task && (
          <span
            role={onViewAgent ? "button" : undefined}
            tabIndex={onViewAgent ? 0 : undefined}
            onClick={onViewAgent ? (e) => { e.stopPropagation(); onViewAgent(task.agent_id); } : undefined}
            onKeyDown={onViewAgent ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onViewAgent(task.agent_id); } } : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              padding: "2px 8px", borderRadius: "9999px", fontSize: "10px", fontWeight: 500, flexShrink: 0,
              background: task.status === "completed" ? "hsla(142, 69%, 45%, 0.08)"
                : task.status === "failed" ? "hsla(0, 84%, 60%, 0.08)" : "hsla(263, 82%, 57.5%, 0.08)",
              color: task.status === "completed" ? "var(--status-success)"
                : task.status === "failed" ? "var(--status-error)" : "var(--primary)",
              border: `1px solid ${task.status === "completed" ? "hsla(142, 69%, 45%, 0.2)"
                : task.status === "failed" ? "hsla(0, 84%, 60%, 0.2)" : "hsla(263, 82%, 57.5%, 0.2)"}`,
              cursor: onViewAgent ? "pointer" : "default",
              transition: "filter 0.15s",
            }}
            onMouseEnter={onViewAgent ? (e) => { e.currentTarget.style.filter = "brightness(1.3)"; } : undefined}
            onMouseLeave={onViewAgent ? (e) => { e.currentTarget.style.filter = "none"; } : undefined}
          >
            <Bot size={9} />
            {task.status === "in_progress" ? "running" : task.status}
          </span>
        )}

        {hasDetails && (
          <ChevronDown size={12} style={{
            flexShrink: 0, color: "var(--foreground-dim)", transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }} />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "4px 16px 12px 42px" }}>
          {instruction && (
            <div style={{ marginBottom: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--foreground-dim)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "2px" }}>Prompt</span>
              <p style={{ fontSize: "12px", color: "var(--foreground-muted)", lineHeight: 1.5, margin: 0 }}>
                {instruction}
              </p>
            </div>
          )}

          {(action.before || action.after) && (
            <ValueDiff before={action.before} after={action.after} />
          )}

          {deltas && Array.isArray(deltas) && deltas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
              {deltas.map((d: any, i: number) => (
                <ValueDiff key={i} label={d.property} before={d.before} after={d.after} />
              ))}
            </div>
          )}

          {dimensions && (
            <ValueDiff
              label="dimensions"
              before={`${dimensions.beforeWidth}x${dimensions.beforeHeight}`}
              after={`${dimensions.afterWidth}x${dimensions.afterHeight}`}
            />
          )}

          {changes && Array.isArray(changes) && changes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
              {changes.map((c: any, i: number) => (
                <ValueDiff key={i} label={c.property} before={c.before} after={c.after} />
              ))}
            </div>
          )}

          {(screenshotBefore || screenshotAfter) && (
            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
              {screenshotBefore && (
                <ScreenshotThumbnail src={`${SCREENSHOT_BASE}${encodeURIComponent(screenshotBefore)}`} label="Before" />
              )}
              {screenshotAfter && (
                <ScreenshotThumbnail src={`${SCREENSHOT_BASE}${encodeURIComponent(screenshotAfter)}`} label="After" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScreenshotThumbnail({ src, label }: { src: string; label: string }) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "10px", color: "var(--foreground-dim)", display: "block", marginBottom: "4px" }}>{label}</span>
        <img
          src={src}
          alt={label}
          onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
          style={{
            width: "120px",
            height: "80px",
            objectFit: "cover",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>
      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={src}
            alt={label}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: "8px",
              border: "1px solid var(--border)",
            }}
          />
        </div>
      )}
    </>
  );
}

function ValueDiff({ label, before, after }: { label?: string; before?: string | null; after?: string | null }) {
  if (!before && !after) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      {label && <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--foreground-dim)" }}>{label}:</span>}
      {before && (
        <code style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--foreground-dim)",
          background: "var(--surface-elevated)", padding: "1px 6px", borderRadius: "2px",
        }}>{before}</code>
      )}
      {before && after && <span style={{ color: "var(--foreground-disabled)", fontSize: "10px" }}>&rarr;</span>}
      {after && (
        <code style={{
          fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--status-success)",
          background: "hsla(142, 69%, 45%, 0.08)", padding: "1px 6px", borderRadius: "2px",
        }}>{after}</code>
      )}
    </div>
  );
}
