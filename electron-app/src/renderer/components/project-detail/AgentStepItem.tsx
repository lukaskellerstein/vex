import React, { useState } from "react";
import {
  Brain,
  CheckCircle,
  MessageSquare,
  Wrench,
  FileCode,
  GitBranch,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────── */

export type StepType =
  | "thinking"
  | "text"
  | "tool_call"
  | "tool_use"
  | "tool_result"
  | "diff"
  | "subagent_spawn"
  | "subagent_result"
  | "skill_invoke"
  | "skill_result"
  | "completed"
  | "progress"
  | "error";

export interface AgentStep {
  id: string;
  sequence_index: number;
  type: StepType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  duration_ms: number | null;
  token_count: number | null;
  created_at: string;
}

/* ─── Helpers ────────────────────────────────────── */

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${n} tok`;
}

const COLLAPSIBLE_THRESHOLD = 300;

/* ─── Sub-components ─────────────────────────────── */

function StepMeta({
  durationMs,
  tokenCount,
}: {
  durationMs: number | null;
  tokenCount: number | null;
}) {
  if (!durationMs && !tokenCount) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginLeft: "auto",
        flexShrink: 0,
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        color: "var(--foreground-dim)",
      }}
    >
      {durationMs != null && durationMs > 0 && <span>{formatMs(durationMs)}</span>}
      {tokenCount != null && tokenCount > 0 && <span>{formatTokens(tokenCount)}</span>}
    </div>
  );
}

function CollapsibleText({
  text,
  style,
}: {
  text: string;
  style?: React.CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSIBLE_THRESHOLD;
  const display = expanded || !isLong ? text : text.slice(0, COLLAPSIBLE_THRESHOLD) + "...";

  return (
    <div>
      <p
        style={{
          fontSize: "13px",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          ...style,
        }}
      >
        {display}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "4px",
            fontSize: "11px",
            color: "var(--foreground-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ToolInputPreview({ toolName, content }: { toolName: string; content: string }) {
  return (
    <code
      style={{
        display: "block",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--foreground-muted)",
        background: "var(--surface)",
        padding: "4px 8px",
        borderRadius: "var(--radius)",
        wordBreak: "break-all",
        whiteSpace: "pre-wrap",
      }}
    >
      {content}
    </code>
  );
}

function DiffBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const filePath = lines[0]?.replace(/^---\s*/, "").replace(/^\+\+\+\s*/, "") || "file";

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <FileCode size={11} style={{ color: "var(--foreground-dim)" }} />
        <span style={{ color: "var(--foreground-muted)" }}>{filePath}</span>
      </div>
      <div style={{ background: "var(--background)" }}>
        {lines.map((line, i) => {
          const isRemoved = line.startsWith("-");
          const isAdded = line.startsWith("+");
          let bg = "transparent";
          let color = "var(--foreground-muted)";
          let borderLeft = "2px solid transparent";

          if (isRemoved) {
            bg = "color-mix(in srgb, var(--status-error) 10%, transparent)";
            color = "var(--status-error)";
            borderLeft = "2px solid var(--status-error)";
          } else if (isAdded) {
            bg = "color-mix(in srgb, var(--status-success) 10%, transparent)";
            color = "var(--status-success)";
            borderLeft = "2px solid var(--status-success)";
          }

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "1px 12px",
                background: bg,
                borderLeft,
                color,
                wordBreak: "break-all",
              }}
            >
              <span style={{ color: "var(--foreground-dim)", userSelect: "none", minWidth: "24px", textAlign: "right" }}>
                {i + 1}
              </span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────── */

const rowBase: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "10px 4px",
};

const iconStyle = (color: string): React.CSSProperties => ({
  color,
  marginTop: "2px",
  flexShrink: 0,
});

export function AgentStepItem({ step }: { step: AgentStep }) {
  const content = step.content ?? "";
  const meta = step.metadata ?? {};

  switch (step.type) {
    case "thinking":
      return (
        <div style={rowBase}>
          <Brain size={14} style={iconStyle("var(--foreground-dim)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <CollapsibleText
              text={content}
              style={{ color: "var(--foreground-dim)", fontStyle: "italic" }}
            />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "text":
      return (
        <div style={rowBase}>
          <MessageSquare size={14} style={iconStyle("var(--foreground-muted)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <CollapsibleText text={content} style={{ color: "var(--foreground)" }} />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "tool_call":
    case "tool_use": {
      // New format: tool_name in metadata. Legacy: content is "ToolName: {json}"
      let toolName = (meta.tool_name as string) ?? "";
      let toolContent = content;
      if (!toolName && content) {
        const colonIdx = content.indexOf(":");
        if (colonIdx > 0 && colonIdx < 30) {
          toolName = content.slice(0, colonIdx).trim();
          toolContent = content.slice(colonIdx + 1).trim();
        }
      }
      toolName = toolName || "tool";
      return (
        <div style={rowBase}>
          <Wrench size={14} style={iconStyle("var(--primary)")} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: "var(--radius)",
                fontSize: "11px",
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                color: "var(--primary)",
                border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                alignSelf: "flex-start",
              }}
            >
              {toolName}
            </span>
            {toolContent && toolName !== "Edit" && <ToolInputPreview toolName={toolName} content={toolContent} />}
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );
    }

    case "tool_result":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "8px 4px 8px 28px",
            marginLeft: "8px",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--foreground-dim)",
                lineHeight: 1.6,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}
            >
              {content.length > COLLAPSIBLE_THRESHOLD ? content.slice(0, COLLAPSIBLE_THRESHOLD) + "..." : content}
            </p>
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "diff":
      return (
        <div style={{ padding: "10px 4px" }}>
          <DiffBlock content={content} />
        </div>
      );

    case "subagent_spawn": {
      const name = (meta.subagent_name as string) ?? "subagent";
      return (
        <div
          style={{
            ...rowBase,
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            borderLeft: "3px solid var(--status-info)",
            background: "color-mix(in srgb, var(--status-info) 5%, transparent)",
          }}
        >
          <GitBranch size={14} style={iconStyle("var(--status-info)")} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--foreground)" }}>
                Spawned subagent:
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--status-info)",
                  background: "color-mix(in srgb, var(--status-info) 12%, transparent)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius)",
                }}
              >
                {name}
              </span>
            </div>
            {content && (
              <CollapsibleText text={content} style={{ color: "var(--foreground-muted)" }} />
            )}
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );
    }

    case "subagent_result":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "8px 12px",
            borderLeft: "3px solid var(--status-info)",
            background: "color-mix(in srgb, var(--status-info) 3%, transparent)",
            borderRadius: "0 0 var(--radius) var(--radius)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, paddingLeft: "22px" }}>
            <CollapsibleText text={content} style={{ color: "var(--foreground-muted)" }} />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "skill_invoke": {
      const skillName = (meta.skill_name as string) ?? "skill";
      return (
        <div
          style={{
            ...rowBase,
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            borderLeft: "3px solid hsl(174, 72%, 56%)",
            background: "color-mix(in srgb, hsl(174, 72%, 56%) 5%, transparent)",
          }}
        >
          <Sparkles size={14} style={iconStyle("hsl(174, 72%, 56%)")} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--foreground)" }}>
                Invoked skill:
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "hsl(174, 72%, 56%)",
                  background: "color-mix(in srgb, hsl(174, 72%, 56%) 12%, transparent)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius)",
                }}
              >
                {skillName}
              </span>
            </div>
            {content && (
              <CollapsibleText text={content} style={{ color: "var(--foreground-muted)" }} />
            )}
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );
    }

    case "skill_result":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "8px 12px",
            borderLeft: "3px solid hsl(174, 72%, 56%)",
            background: "color-mix(in srgb, hsl(174, 72%, 56%) 3%, transparent)",
            borderRadius: "0 0 var(--radius) var(--radius)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, paddingLeft: "22px" }}>
            <CollapsibleText text={content} style={{ color: "var(--foreground-muted)" }} />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "error":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--status-error) 20%, transparent)",
          }}
        >
          <AlertTriangle size={14} style={iconStyle("var(--status-error)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", color: "var(--status-error)", lineHeight: 1.6, margin: 0 }}>
              {content}
            </p>
          </div>
        </div>
      );

    case "completed":
      return (
        <div style={rowBase}>
          <CheckCircle size={14} style={iconStyle("var(--status-success)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", color: "var(--status-success)", lineHeight: 1.6, margin: 0 }}>
              {content || "Task completed"}
            </p>
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "progress":
      return (
        <div style={rowBase}>
          <MessageSquare size={14} style={iconStyle("var(--foreground-dim)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", color: "var(--foreground-dim)", lineHeight: 1.6, margin: 0 }}>
              {content}
            </p>
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    default:
      return null;
  }
}
