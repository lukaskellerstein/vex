import { Activity as ActivityIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { ActivityEntry, type TimelineEvent } from "./ActivityEntry";

type TimeGroup = "just-now" | "earlier-today" | "yesterday" | "older";

function getTimeGroup(iso: string): TimeGroup {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = diffMs / 60000;

  if (diffMin < 5) return "just-now";

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) return "earlier-today";
  if (date >= yesterdayStart) return "yesterday";
  return "older";
}

const GROUP_LABELS: Record<TimeGroup, string> = {
  "just-now": "Just now",
  "earlier-today": "Earlier today",
  yesterday: "Yesterday",
  older: "Older",
};

const GROUP_ORDER: TimeGroup[] = ["just-now", "earlier-today", "yesterday", "older"];

interface GroupedEvents {
  group: TimeGroup;
  events: TimelineEvent[];
}

function groupEvents(events: TimelineEvent[]): GroupedEvents[] {
  const map = new Map<TimeGroup, TimelineEvent[]>();

  for (const event of events) {
    const group = getTimeGroup(event.timestamp || event.created_at || "");
    const existing = map.get(group);
    if (existing) {
      existing.push(event);
    } else {
      map.set(group, [event]);
    }
  }

  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    events: map.get(g)!,
  }));
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const rows = containerRef.current.querySelectorAll<HTMLElement>(".timeline-event-row");
    const count = Math.min(rows.length, 20);

    rows.forEach((row, i) => {
      if (i < count) {
        row.style.opacity = "0";
        row.style.transform = "translateY(6px)";
        row.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
        row.style.transitionDelay = `${i * 20}ms`;
        requestAnimationFrame(() => {
          row.style.opacity = "1";
          row.style.transform = "translateY(0)";
        });
      } else {
        row.style.opacity = "1";
      }
    });
  }, [events]);

  if (events.length === 0) {
    return <EmptyState />;
  }

  const grouped = groupEvents(events);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "0 20px",
        background: "var(--background)",
      }}
    >
      {grouped.map(({ group, events: groupEvents }) => (
        <TimelineGroup key={group} label={GROUP_LABELS[group]} events={groupEvents} />
      ))}
    </div>
  );
}

interface TimelineGroupProps {
  label: string;
  events: TimelineEvent[];
}

function TimelineGroup({ label, events }: TimelineGroupProps) {
  return (
    <div style={{ position: "relative" }}>
      {/* Sticky group header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--background)",
          padding: "12px 0 8px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            fontFamily: "var(--font-ui)",
            color: "var(--foreground-dim)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>

      {/* Events with vertical timeline line */}
      <div style={{ position: "relative" }}>
        {/* Vertical connector line */}
        <div
          style={{
            position: "absolute",
            left: "18px",
            top: 0,
            bottom: 0,
            width: "2px",
            background: "var(--border)",
            pointerEvents: "none",
          }}
        />

        {events.map((event) => (
          <ActivityEntry key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        padding: "48px 20px",
        textAlign: "center",
      }}
    >
      <ActivityIcon
        size={48}
        style={{ color: "var(--foreground-disabled)", marginBottom: "16px" }}
      />
      <h2
        style={{
          fontSize: "18px",
          fontWeight: 600,
          fontFamily: "var(--font-ui)",
          color: "var(--foreground)",
          marginBottom: "8px",
        }}
      >
        No activity recorded
      </h2>
      <p
        style={{
          fontSize: "13px",
          fontFamily: "var(--font-ui)",
          color: "var(--foreground-muted)",
          margin: 0,
        }}
      >
        Activity events will appear here as they occur.
      </p>
    </div>
  );
}
