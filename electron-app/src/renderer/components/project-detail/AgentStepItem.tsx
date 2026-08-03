import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  FileCode,
  GitBranch,
  MessageSquare,
  Plug,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import type React from "react";
import { useState } from "react";

/* ─── Types ──────────────────────────────────────── */

export type StepType =
  | "thinking"
  | "text"
  | "tool_call"
  | "tool_use"
  | "tool_result"
  | "tool_error"
  | "diff"
  | "write_file"
  | "bash_command"
  | "subagent_spawn"
  | "subagent_result"
  | "skill_invoke"
  | "skill_result"
  | "completed"
  | "progress"
  | "error"
  | "user_message";

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

/* ─── MCP tool name parser ──────────────────────── */

interface McpToolInfo {
  isMcp: true;
  pluginName: string | null;
  serverName: string;
  toolName: string;
}

interface RegularToolInfo {
  isMcp: false;
  toolName: string;
}

type ToolInfo = McpToolInfo | RegularToolInfo;

function parseToolName(raw: string): ToolInfo {
  // MCP pattern: mcp__<server>__<tool>
  const mcpMatch = raw.match(/^mcp__(.+?)__(.+)$/);
  if (!mcpMatch) return { isMcp: false, toolName: raw };

  const [, server, tool] = mcpMatch;
  // Plugin pattern: plugin_<plugin-name>_<mcp-server-name>
  const pluginMatch = server.match(/^plugin_(.+?)_(.+)$/);
  if (pluginMatch) {
    return { isMcp: true, pluginName: pluginMatch[1], serverName: pluginMatch[2], toolName: tool };
  }
  return { isMcp: true, pluginName: null, serverName: server, toolName: tool };
}

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

function CollapsibleText({ text, style }: { text: string; style?: React.CSSProperties }) {
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

function ToolInputPreview({ content }: { content: string }) {
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

/* ─── Tool Result (collapsed by default) ────────── */

function ToolResultStep({ step, content }: { step: AgentStep; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const resultColor = "hsl(220, 50%, 55%)";
  const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;

  return (
    <div
      style={{
        marginLeft: "8px",
        borderLeft: "1px solid var(--border)",
        paddingLeft: "20px",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        {expanded ? (
          <ChevronUp size={12} style={{ color: resultColor, flexShrink: 0 }} />
        ) : (
          <ChevronDown size={12} style={{ color: resultColor, flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: resultColor,
            flexShrink: 0,
          }}
        >
          Result
        </span>
        {!expanded && (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--foreground-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {preview}
          </span>
        )}
        <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
      </button>
      {expanded && (
        <div
          style={{
            padding: "4px 4px 8px 22px",
          }}
        >
          <pre
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--foreground-muted)",
              lineHeight: 1.6,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              margin: 0,
              background: "var(--surface)",
              padding: "8px 12px",
              borderRadius: "var(--radius)",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolErrorStep({ step, content }: { step: AgentStep; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const errorColor = "var(--status-error)";
  const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;

  return (
    <div
      style={{
        marginLeft: "8px",
        borderLeft: "2px solid " + errorColor,
        paddingLeft: "20px",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <AlertTriangle size={12} style={{ color: errorColor, flexShrink: 0 }} />
        {expanded ? (
          <ChevronUp size={12} style={{ color: errorColor, flexShrink: 0 }} />
        ) : (
          <ChevronDown size={12} style={{ color: errorColor, flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: errorColor,
            flexShrink: 0,
          }}
        >
          Error
        </span>
        {!expanded && (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: errorColor,
              opacity: 0.75,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {preview}
          </span>
        )}
        <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
      </button>
      {expanded && (
        <div style={{ padding: "4px 4px 8px 22px" }}>
          <pre
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: errorColor,
              lineHeight: 1.6,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              margin: 0,
              background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
              padding: "8px 12px",
              borderRadius: "var(--radius)",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Generic tool card ─────────────────────────── */

function ToolCard({
  header,
  children,
  resultContent,
  durationMs,
  tokenCount,
}: {
  header: React.ReactNode;
  children?: React.ReactNode;
  resultContent: string | null;
  durationMs?: number | null;
  tokenCount?: number | null;
}) {
  const [resultExpanded, setResultExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        fontSize: "12px",
      }}
    >
      {/* Header — badges + meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "7px 12px",
          background: "var(--surface)",
          borderBottom: children || resultContent ? "1px solid var(--border)" : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "wrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {header}
        </div>
        <StepMeta durationMs={durationMs ?? null} tokenCount={tokenCount ?? null} />
      </div>

      {/* Input — always expanded */}
      {children && (
        <div
          style={{
            borderBottom: resultContent ? "1px solid var(--border)" : undefined,
          }}
        >
          {children}
        </div>
      )}

      {/* Result — collapsed by default */}
      {resultContent && (
        <div>
          <button
            onClick={() => setResultExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "6px 12px",
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--foreground-dim)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {resultExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Result
            {!resultExpanded && (
              <span
                style={{
                  color: "var(--foreground-dim)",
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                }}
              >
                {resultContent.slice(0, 120)}
              </span>
            )}
          </button>
          {resultExpanded && (
            <div style={{ padding: "4px 12px 10px" }}>
              <pre
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--foreground-muted)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                  background: "var(--surface)",
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {resultContent}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Tool card input renderers ─────────────────── */

function PromptCard({ text }: { text: string }) {
  const bright = "hsl(142, 69%, 55%)";
  const lines = text.split("\n");
  const isStructured = lines.some((l) => l.startsWith("##") || l.startsWith("**Action"));

  return (
    <div
      style={{
        borderRadius: "10px",
        overflow: "hidden",
        border: `1.5px solid color-mix(in srgb, ${bright} 40%, transparent)`,
        boxShadow: `0 2px 16px color-mix(in srgb, ${bright} 10%, transparent)`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 16px",
          background: `linear-gradient(135deg, color-mix(in srgb, ${bright} 18%, transparent) 0%, color-mix(in srgb, ${bright} 10%, transparent) 100%)`,
          borderBottom: `1px solid color-mix(in srgb, ${bright} 22%, transparent)`,
        }}
      >
        <div
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "7px",
            background: `color-mix(in srgb, ${bright} 22%, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CornerDownRight size={14} style={{ color: bright }} />
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: bright,
          }}
        >
          Prompt
        </span>
      </div>

      {/* Content body */}
      <div
        style={{
          padding: "14px 16px",
          background: `color-mix(in srgb, ${bright} 8%, var(--background))`,
        }}
      >
        {isStructured ? (
          <pre
            style={{
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.7,
              margin: 0,
              color: "var(--foreground)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {text}
          </pre>
        ) : (
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.7,
              margin: 0,
              color: "var(--foreground)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </p>
        )}
      </div>
    </div>
  );
}

function BashInput({ command, description }: { command: string; description: string }) {
  const termGreen = "hsl(120, 60%, 60%)";
  return (
    <div style={{ padding: "10px 14px", background: "hsl(0, 0%, 7%)" }}>
      {description && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
          <Terminal size={11} style={{ color: termGreen }} />
          <span style={{ fontSize: "11px", color: "var(--foreground-dim)" }}>{description}</span>
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: termGreen, userSelect: "none" }}>$ </span>
        <span style={{ color: "hsl(0, 0%, 85%)" }}>{command}</span>
      </div>
    </div>
  );
}

function WriteInput({ filePath, fileContent }: { filePath: string; fileContent: string }) {
  const [expanded, setExpanded] = useState(false);
  const allLines = fileContent.split("\n");
  const previewLines = 20;
  const isTruncatable = allLines.length > previewLines;
  const visibleLines = expanded ? allLines : allLines.slice(0, previewLines);

  return (
    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
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
        <FileCode size={11} style={{ color: "var(--primary)" }} />
        <span style={{ color: "var(--foreground-muted)" }}>{filePath}</span>
        <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--foreground-dim)" }}>
          {allLines.length} lines
        </span>
      </div>
      <div
        style={{
          background: "var(--background)",
          maxHeight: expanded ? "500px" : undefined,
          overflowY: expanded ? "auto" : undefined,
        }}
      >
        {visibleLines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "1px 12px",
              color: "var(--foreground-muted)",
              wordBreak: "break-all",
            }}
          >
            <span
              style={{
                color: "var(--foreground-dim)",
                userSelect: "none",
                minWidth: "24px",
                textAlign: "right",
              }}
            >
              {i + 1}
            </span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      {isTruncatable && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            width: "100%",
            padding: "6px",
            fontSize: "11px",
            color: "var(--foreground-dim)",
            background: "var(--surface)",
            border: "none",
            borderTop: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? "Show less" : `Show all ${allLines.length} lines`}
        </button>
      )}
    </div>
  );
}

function EditInput({
  filePath,
  oldString,
  newString,
}: {
  filePath: string;
  oldString: string;
  newString: string;
}) {
  const lines: { text: string; type: "remove" | "add" | "neutral" }[] = [];
  for (const line of oldString.split("\n")) lines.push({ text: line, type: "remove" });
  for (const line of newString.split("\n")) lines.push({ text: line, type: "add" });

  return (
    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
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
      <div style={{ background: "var(--background)", maxHeight: "400px", overflowY: "auto" }}>
        {lines.map((line, i) => {
          const isRemoved = line.type === "remove";
          const isAdded = line.type === "add";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "1px 12px",
                background: isRemoved
                  ? "color-mix(in srgb, var(--status-error) 10%, transparent)"
                  : isAdded
                    ? "color-mix(in srgb, var(--status-success) 10%, transparent)"
                    : "transparent",
                borderLeft: isRemoved
                  ? "2px solid var(--status-error)"
                  : isAdded
                    ? "2px solid var(--status-success)"
                    : "2px solid transparent",
                color: isRemoved
                  ? "var(--status-error)"
                  : isAdded
                    ? "var(--status-success)"
                    : "var(--foreground-muted)",
                wordBreak: "break-all",
              }}
            >
              <span style={{ userSelect: "none", minWidth: "12px" }}>
                {isRemoved ? "-" : isAdded ? "+" : " "}
              </span>
              <span>{line.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReadInput({ filePath }: { filePath: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px" }}>
      <FileCode size={12} style={{ color: "var(--foreground-dim)" }} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--foreground-muted)",
          wordBreak: "break-all",
        }}
      >
        {filePath}
      </span>
    </div>
  );
}

/* ─── Badge helper ──────────────────────────────── */

function ToolBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius)",
        fontSize: "11px",
        fontWeight: 500,
        fontFamily: "var(--font-mono)",
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function ToolBadgeSmall({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: "var(--radius)",
        fontSize: "10px",
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

/* ─── Agent task card ───────────────────────────── */

function AgentBlock({
  description,
  prompt,
  agentType,
  resultContent,
  onAgentClick,
}: {
  description: string;
  prompt: string;
  agentType: string;
  resultContent: string | null;
  onAgentClick?: (agentType: string) => void;
}) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const agentColor = "hsl(210, 80%, 60%)";

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        overflow: "hidden",
        border: `1px solid color-mix(in srgb, ${agentColor} 35%, transparent)`,
        fontSize: "12px",
      }}
    >
      {/* Header */}
      <div
        onClick={onAgentClick && agentType ? () => onAgentClick(agentType) : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          background: `color-mix(in srgb, ${agentColor} 10%, transparent)`,
          borderBottom: `1px solid color-mix(in srgb, ${agentColor} 20%, transparent)`,
          cursor: onAgentClick && agentType ? "pointer" : undefined,
          transition: "background 0.15s",
        }}
        onMouseEnter={
          onAgentClick && agentType
            ? (e) => {
                e.currentTarget.style.background = `color-mix(in srgb, ${agentColor} 18%, transparent)`;
              }
            : undefined
        }
        onMouseLeave={
          onAgentClick && agentType
            ? (e) => {
                e.currentTarget.style.background = `color-mix(in srgb, ${agentColor} 10%, transparent)`;
              }
            : undefined
        }
      >
        <Bot size={18} style={{ color: agentColor, flexShrink: 0 }} />
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "2px 8px",
            borderRadius: "var(--radius)",
            background: `color-mix(in srgb, ${agentColor} 20%, transparent)`,
            color: agentColor,
            border: `1px solid color-mix(in srgb, ${agentColor} 40%, transparent)`,
            flexShrink: 0,
          }}
        >
          Agent
        </span>
        {agentType && (
          <span
            style={{
              fontSize: "10px",
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              padding: "2px 7px",
              borderRadius: "var(--radius)",
              background: `color-mix(in srgb, ${agentColor} 12%, transparent)`,
              color: `color-mix(in srgb, ${agentColor} 80%, white)`,
              border: `1px solid color-mix(in srgb, ${agentColor} 25%, transparent)`,
              flexShrink: 0,
            }}
          >
            {agentType}
          </span>
        )}
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--foreground)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {description || "Subagent"}
        </span>
      </div>

      {/* Prompt — collapsed by default */}
      {prompt && (
        <div
          style={{
            borderBottom: resultContent
              ? `1px solid color-mix(in srgb, ${agentColor} 15%, transparent)`
              : undefined,
          }}
        >
          <button
            onClick={() => setPromptExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "7px 14px",
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--foreground-dim)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {promptExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Prompt
            {!promptExpanded && (
              <span
                style={{
                  color: "var(--foreground-dim)",
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                }}
              >
                {prompt.slice(0, 100)}
              </span>
            )}
          </button>
          {promptExpanded && (
            <div
              style={{
                padding: "8px 14px 12px",
                maxHeight: "400px",
                overflowY: "auto",
              }}
            >
              <pre
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--foreground-muted)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {prompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Result — collapsed by default */}
      {resultContent && (
        <div>
          <button
            onClick={() => setResultExpanded((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "7px 14px",
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--foreground-dim)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {resultExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Result
            {!resultExpanded && (
              <span
                style={{
                  color: "var(--foreground-dim)",
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                }}
              >
                {resultContent.slice(0, 100)}
              </span>
            )}
          </button>
          {resultExpanded && (
            <div
              style={{
                padding: "8px 14px 12px",
                maxHeight: "400px",
                overflowY: "auto",
              }}
            >
              <pre
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--foreground-muted)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {resultContent}
              </pre>
            </div>
          )}
        </div>
      )}
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

export function AgentStepItem({
  step,
  resultSteps,
  onAgentClick,
}: {
  step: AgentStep;
  resultSteps?: AgentStep[];
  onAgentClick?: (agentType: string) => void;
}) {
  const content = step.content ?? "";
  const meta = step.metadata ?? {};

  switch (step.type) {
    case "thinking": {
      const thinkGray = "hsl(0, 0%, 55%)";
      return (
        <div
          style={{
            ...rowBase,
            padding: "14px 18px",
            borderRadius: "var(--radius)",
            border: "1px solid hsl(0, 0%, 20%)",
            borderLeftWidth: "3px",
            borderLeftStyle: "solid",
            borderLeftColor: thinkGray,
            background: "hsl(0, 0%, 12%)",
          }}
        >
          <Brain size={18} style={{ ...iconStyle(thinkGray), marginTop: "1px" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: thinkGray,
                marginBottom: "6px",
              }}
            >
              Thinking
            </span>
            <CollapsibleText
              text={content}
              style={{ color: "hsl(0, 0%, 65%)", fontStyle: "italic", fontSize: "13px" }}
            />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );
    }

    case "text": {
      const msgBlue = "hsl(195, 85%, 55%)";
      return (
        <div
          style={{
            ...rowBase,
            padding: "16px 20px",
            borderRadius: "var(--radius)",
            border: `1px solid color-mix(in srgb, ${msgBlue} 25%, transparent)`,
            borderLeftWidth: "4px",
            borderLeftStyle: "solid",
            borderLeftColor: msgBlue,
            background: `color-mix(in srgb, ${msgBlue} 12%, transparent)`,
            boxShadow: `0 2px 8px color-mix(in srgb, ${msgBlue} 10%, transparent)`,
          }}
        >
          <MessageSquare size={20} style={{ ...iconStyle(msgBlue), marginTop: "1px" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: msgBlue,
                marginBottom: "6px",
              }}
            >
              Message
            </span>
            <CollapsibleText
              text={content}
              style={{ color: "var(--foreground)", fontSize: "14px", lineHeight: "1.7" }}
            />
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );
    }

    case "tool_call":
    case "tool_use": {
      // Extract result content from grouped resultSteps
      const resultContent =
        resultSteps
          ?.filter((rs) => rs.type !== "tool_error")
          .map((rs) => rs.content ?? "")
          .filter(Boolean)
          .join("\n\n") || null;
      const errors = resultSteps?.filter((rs) => rs.type === "tool_error") ?? [];

      // Parse tool name
      let rawToolName = (meta.tool_name as string) ?? "";
      let toolContent = content;
      if (!rawToolName && content) {
        const colonIdx = content.indexOf(":");
        if (colonIdx > 0 && colonIdx < 30) {
          rawToolName = content.slice(0, colonIdx).trim();
          toolContent = content.slice(colonIdx + 1).trim();
        }
      }
      rawToolName = rawToolName || "tool";
      const toolInfo = parseToolName(rawToolName);
      const pluginColor = "hsl(28, 85%, 58%)";
      const mcpColor = "hsl(174, 72%, 46%)";
      const skillColor = "hsl(330, 70%, 60%)";

      // Parse JSON input once (used by rich renderers)
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(toolContent);
      } catch {
        /* not JSON */
      }

      // Agent tool call — its own card design
      if (rawToolName === "Agent") {
        return (
          <div
            style={{ padding: "10px 4px", display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <AgentBlock
              description={(parsed.description as string) ?? ""}
              prompt={(parsed.prompt as string) ?? ""}
              agentType={(parsed.subagent_type as string) ?? ""}
              resultContent={resultContent}
              onAgentClick={onAgentClick}
            />
            {errors.map((rs) => (
              <ToolErrorStep key={rs.id} step={rs} content={rs.content ?? ""} />
            ))}
          </div>
        );
      }

      // Build header badges based on tool type
      let headerContent: React.ReactNode;
      const effectiveToolName = toolInfo.isMcp ? toolInfo.toolName : rawToolName;

      if (rawToolName === "Skill") {
        let skillPluginName: string | null = null;
        let skillName = "";
        const rawSkill = (parsed.skill as string) ?? "";
        const colonIdx = rawSkill.indexOf(":");
        if (colonIdx > 0) {
          skillPluginName = rawSkill.slice(0, colonIdx);
          skillName = rawSkill.slice(colonIdx + 1);
        } else {
          skillName = rawSkill;
        }
        headerContent = (
          <>
            <Sparkles size={13} style={{ color: skillColor, flexShrink: 0 }} />
            {skillPluginName && <ToolBadgeSmall label={skillPluginName} color={pluginColor} />}
            <ToolBadge label={skillName || "Skill"} color={skillColor} />
          </>
        );
      } else if (toolInfo.isMcp) {
        headerContent = (
          <>
            <Plug size={13} style={{ color: mcpColor, flexShrink: 0 }} />
            {toolInfo.pluginName && (
              <ToolBadgeSmall label={toolInfo.pluginName} color={pluginColor} />
            )}
            <ToolBadge label={toolInfo.serverName} color={mcpColor} />
            <ToolBadge label={toolInfo.toolName} color="var(--primary)" />
          </>
        );
      } else {
        const iconMap: Record<string, React.ReactNode> = {
          Bash: <Terminal size={13} style={{ color: "hsl(120, 60%, 60%)", flexShrink: 0 }} />,
          Write: <FileCode size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />,
          Edit: <FileCode size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />,
          Read: <FileCode size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />,
        };
        headerContent = (
          <>
            {iconMap[rawToolName] ?? (
              <Wrench size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
            )}
            <ToolBadge label={rawToolName} color="var(--primary)" />
          </>
        );
      }

      // Detail step absorbed from the timeline (bash_command, write_file, diff)
      const detail = meta._detail as
        | { type: string; content: string | null; metadata: Record<string, unknown> | null }
        | undefined;

      // Build rich input content based on tool name
      let inputContent: React.ReactNode = null;

      if (effectiveToolName === "Bash") {
        const cmd =
          (parsed.command as string) ||
          (detail?.type === "bash_command" ? (detail.content ?? "") : "");
        const desc =
          (parsed.description as string) || ((detail?.metadata?.description as string) ?? "");
        if (cmd) inputContent = <BashInput command={cmd} description={desc} />;
      } else if (effectiveToolName === "Write") {
        const fp = (parsed.file_path as string) || ((detail?.metadata?.file_path as string) ?? "");
        const fc =
          (parsed.content as string) ||
          (detail?.type === "write_file" ? (detail.content ?? "") : "");
        if (fp && fc) inputContent = <WriteInput filePath={fp} fileContent={fc} />;
      } else if (effectiveToolName === "Edit") {
        const fp = (parsed.file_path as string) ?? "";
        const os = (parsed.old_string as string) ?? "";
        const ns = (parsed.new_string as string) ?? "";
        if (fp && (os || ns))
          inputContent = <EditInput filePath={fp} oldString={os} newString={ns} />;
      } else if (effectiveToolName === "Read") {
        const fp = (parsed.file_path as string) ?? "";
        if (fp) inputContent = <ReadInput filePath={fp} />;
      } else if (effectiveToolName === "Glob") {
        const pattern = (parsed.pattern as string) ?? "";
        if (pattern) inputContent = <ReadInput filePath={pattern} />;
      } else if (effectiveToolName === "Grep") {
        const pattern = (parsed.pattern as string) ?? "";
        if (pattern) inputContent = <ReadInput filePath={pattern} />;
      }

      // Fallback: show raw JSON for tools without a rich renderer
      if (!inputContent && toolContent) {
        inputContent = (
          <div style={{ padding: "6px 12px" }}>
            <ToolInputPreview content={toolContent} />
          </div>
        );
      }

      return (
        <div style={{ padding: "10px 4px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <ToolCard
            header={headerContent}
            resultContent={resultContent}
            durationMs={step.duration_ms}
            tokenCount={step.token_count}
          >
            {inputContent}
          </ToolCard>
          {errors.map((rs) => (
            <ToolErrorStep key={rs.id} step={rs} content={rs.content ?? ""} />
          ))}
        </div>
      );
    }

    case "tool_result":
      return <ToolResultStep step={step} content={content} />;

    case "tool_error": {
      const errorToolName = (meta.tool_name as string) ?? null;
      const errorToolInfo = errorToolName ? parseToolName(errorToolName) : null;
      return (
        <div
          style={{
            marginLeft: "8px",
            borderLeft: "2px solid var(--status-error)",
            paddingLeft: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "var(--radius)",
              background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
            }}
          >
            <AlertTriangle
              size={13}
              style={{ color: "var(--status-error)", marginTop: "1px", flexShrink: 0 }}
            />
            <div
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--status-error)",
                  }}
                >
                  Error
                </span>
                {errorToolInfo && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--status-error)",
                      background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
                      padding: "1px 6px",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {errorToolInfo.isMcp ? errorToolInfo.toolName : errorToolInfo.toolName}
                  </span>
                )}
              </div>
              {content && (
                <pre
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--status-error)",
                    lineHeight: 1.6,
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    opacity: 0.85,
                  }}
                >
                  {content}
                </pre>
              )}
            </div>
            <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
          </div>
        </div>
      );
    }

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
          <div
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}
          >
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
            borderLeft: "3px solid hsl(330, 70%, 60%)",
            background: "color-mix(in srgb, hsl(330, 70%, 60%) 5%, transparent)",
          }}
        >
          <Sparkles size={14} style={iconStyle("hsl(330, 70%, 60%)")} />
          <div
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--foreground)" }}>
                Invoked skill:
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "hsl(330, 70%, 60%)",
                  background: "color-mix(in srgb, hsl(330, 70%, 60%) 12%, transparent)",
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
            borderLeft: "3px solid hsl(330, 70%, 60%)",
            background: "color-mix(in srgb, hsl(330, 70%, 60%) 3%, transparent)",
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
            <p
              style={{ fontSize: "13px", color: "var(--status-error)", lineHeight: 1.6, margin: 0 }}
            >
              {content}
            </p>
          </div>
        </div>
      );

    case "completed":
      return (
        <div
          style={{
            ...rowBase,
            padding: "12px 16px",
            borderRadius: "var(--radius)",
            background: "color-mix(in srgb, hsl(142, 69%, 55%) 8%, transparent)",
            border: "1px solid color-mix(in srgb, hsl(142, 69%, 55%) 25%, transparent)",
          }}
        >
          <CheckCircle size={16} style={iconStyle("hsl(142, 69%, 55%)")} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "hsl(142, 69%, 55%)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
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
            <p
              style={{
                fontSize: "13px",
                color: "var(--foreground-dim)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {content}
            </p>
          </div>
          <StepMeta durationMs={step.duration_ms} tokenCount={step.token_count} />
        </div>
      );

    case "user_message": {
      return (
        <div style={{ padding: "6px 0" }}>
          <PromptCard text={content} />
        </div>
      );
    }

    default:
      return null;
  }
}
