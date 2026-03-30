import React, { useState } from "react";
import {
  Send,
  CheckCircle2,
  XCircle,
  Play,
  Bot,
  BotOff,
  AlertTriangle,
  Server,
  ServerOff,
} from "lucide-react";

export type TimelineEventType =
  | "batch_submitted"
  | "batch_completed"
  | "batch_failed"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "agent_started"
  | "agent_stopped"
  | "agent_error"
  | "server_started"
  | "server_stopped";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  summary: string;
  project_name: string;
  project_id?: string;
  agent_name?: string;
  batch_id?: string;
  action_count?: number;
  cost_usd?: number;
}

interface EventNodeConfig {
  color: string;
  icon: React.ReactNode;
}

function getNodeConfig(type: TimelineEventType): EventNodeConfig {
  const size = 14;
  const sw = 1.5;

  switch (type) {
    case "batch_submitted":
      return {
        color: "var(--status-info)",
        icon: <Send size={size} strokeWidth={sw} />,
      };
    case "batch_completed":
      return {
        color: "var(--status-success)",
        icon: <CheckCircle2 size={size} strokeWidth={sw} />,
      };
    case "batch_failed":
      return {
        color: "var(--status-error)",
        icon: <XCircle size={size} strokeWidth={sw} />,
      };
    case "task_started":
      return {
        color: "var(--status-success)",
        icon: <Play size={size} strokeWidth={sw} />,
      };
    case "task_completed":
      return {
        color: "var(--status-success)",
        icon: <CheckCircle2 size={size} strokeWidth={sw} />,
      };
    case "task_failed":
      return {
        color: "var(--status-error)",
        icon: <XCircle size={size} strokeWidth={sw} />,
      };
    case "agent_started":
      return {
        color: "var(--status-success)",
        icon: <Bot size={size} strokeWidth={sw} />,
      };
    case "agent_stopped":
      return {
        color: "var(--status-idle)",
        icon: <BotOff size={size} strokeWidth={sw} />,
      };
    case "agent_error":
      return {
        color: "var(--status-error)",
        icon: <AlertTriangle size={size} strokeWidth={sw} />,
      };
    case "server_started":
      return {
        color: "var(--status-success)",
        icon: <Server size={size} strokeWidth={sw} />,
      };
    case "server_stopped":
      return {
        color: "var(--status-idle)",
        icon: <ServerOff size={size} strokeWidth={sw} />,
      };
  }
}

function isFailedEvent(type: TimelineEventType): boolean {
  return type.endsWith("_failed") || type.endsWith("_error");
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface ActivityEntryProps {
  event: TimelineEvent;
}

export function ActivityEntry({ event }: ActivityEntryProps) {
  const [hovered, setHovered] = useState(false);
  const config = getNodeConfig(event.type);
  const failed = isFailedEvent(event.type);
  const hasMeta = event.batch_id || event.action_count !== undefined || event.cost_usd !== undefined;

  return (
    <div
      className="timeline-event-row"
      style={{
        display: "flex",
        gap: 0,
        alignItems: "flex-start",
        position: "relative",
        padding: "8px 0",
        borderRadius: "var(--radius)",
        background: hovered ? "var(--surface-hover)" : "transparent",
        transition: "background 150ms ease-out",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Timeline node */}
      <div
        style={{
          width: "36px",
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
          paddingTop: "10px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "9999px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface)",
            border: "2px solid var(--border-bright)",
            color: config.color,
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>
      </div>

      {/* Event content */}
      <div style={{ flex: 1, padding: "6px 0 6px 12px" }}>
        {/* Row 1: project pill, agent, timestamp */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "3px",
          }}
        >
          <span
            style={{
              background: "var(--surface)",
              borderRadius: "3px",
              padding: "1px 6px",
              fontSize: "11px",
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              color: "var(--foreground-muted)",
              flexShrink: 0,
            }}
          >
            {event.project_name}
          </span>

          {event.agent_name && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px",
                fontFamily: "var(--font-ui)",
                color: "var(--foreground-dim)",
              }}
            >
              <Bot size={10} strokeWidth={1.5} />
              via {event.agent_name}
            </span>
          )}

          <span
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              fontFamily: "var(--font-ui)",
              color: "var(--foreground-disabled)",
              flexShrink: 0,
            }}
          >
            {formatRelativeTime(event.timestamp)}
          </span>
        </div>

        {/* Row 2: summary */}
        <p
          style={{
            fontSize: "13px",
            fontFamily: "var(--font-ui)",
            color: failed ? "var(--status-error)" : "var(--foreground-muted)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {event.summary}
        </p>

        {/* Row 3: meta tags */}
        {hasMeta && (
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginTop: "4px",
              flexWrap: "wrap",
            }}
          >
            {event.batch_id && <MetaTag mono>{event.batch_id}</MetaTag>}
            {event.action_count !== undefined && (
              <MetaTag>{event.action_count} actions</MetaTag>
            )}
            {event.cost_usd !== undefined && (
              <MetaTag dimmed>${event.cost_usd.toFixed(2)}</MetaTag>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaTag({
  children,
  mono,
  dimmed,
}: {
  children: React.ReactNode;
  mono?: boolean;
  dimmed?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
        fontWeight: 400,
        color: dimmed ? "var(--foreground-dim)" : "var(--foreground-muted)",
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: "3px",
        padding: "1px 5px",
      }}
    >
      {children}
    </span>
  );
}
