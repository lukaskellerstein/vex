import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, Radio } from "lucide-react";
import { ActivityStats, type ActivityStatsData } from "../components/activity/ActivityStats";
import {
  ActivityFilters,
  type ActivityFiltersState,
  type EventTypeFilter,
} from "../components/activity/ActivityFilters";
import { ActivityTimeline } from "../components/activity/ActivityTimeline";
import type { TimelineEvent } from "../components/activity/ActivityEntry";

type TimeRange = "last-30m" | "last-2h" | "last-24h" | "last-7d" | "all";

const TIME_RANGE_MS: Record<TimeRange, number | null> = {
  "last-30m": 30 * 60 * 1000,
  "last-2h": 2 * 60 * 60 * 1000,
  "last-24h": 24 * 60 * 60 * 1000,
  "last-7d": 7 * 24 * 60 * 60 * 1000,
  all: null,
};

function getSinceISO(range: TimeRange): string | undefined {
  const ms = TIME_RANGE_MS[range];
  if (ms === null) return undefined;
  return new Date(Date.now() - ms).toISOString();
}

interface ProjectOption {
  id: string;
  name: string;
}

const EMPTY_STATS: ActivityStatsData = {
  completed_batches: 0,
  failed_batches: 0,
  total_actions: 0,
  active_agents: 0,
  total_cost_usd: 0,
};

export function Activity() {
  const [timeRange, setTimeRange] = useState<TimeRange>("last-2h");
  const [filters, setFilters] = useState<ActivityFiltersState>({
    projectId: "all",
    eventType: "all",
    search: "",
  });
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [stats, setStats] = useState<ActivityStatsData>(EMPTY_STATS);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const fetchData = useCallback(async () => {
    const since = getSinceISO(timeRange);
    const apiFilters: Record<string, string | undefined> = { since };
    if (filters.projectId !== "all") apiFilters.projectId = filters.projectId;
    if (filters.eventType !== "all") apiFilters.type = filters.eventType;

    try {
      const [activityData, statsData, projectsData] = await Promise.all([
        (window as any).electronAPI.getActivity(apiFilters),
        (window as any).electronAPI.getActivityStats(since),
        (window as any).electronAPI.getProjects(),
      ]);

      if (Array.isArray(activityData)) setEvents(activityData);
      if (statsData && typeof statsData === "object") setStats(statsData);
      if (Array.isArray(projectsData)) {
        setProjects(
          projectsData.map((p: any) => ({ id: p.id, name: p.name }))
        );
      }
    } catch {
      // Silently handle — data will remain at previous state
    }
  }, [timeRange, filters.projectId, filters.eventType]);

  useEffect(() => {
    fetchData();
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchData, 300);
    };
    const cleanupActivity = window.electronAPI.onActivityEvent(debouncedFetch);
    const cleanupBatch = window.electronAPI.onBatchEvent(debouncedFetch);
    return () => {
      clearTimeout(debounceTimer);
      cleanupActivity();
      cleanupBatch();
    };
  }, [fetchData]);

  const filteredEvents = useMemo(() => {
    if (!filters.search) return events;
    const q = filters.search.toLowerCase();
    return events.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        e.project_name.toLowerCase().includes(q) ||
        (e.agent_name?.toLowerCase().includes(q) ?? false)
    );
  }, [events, filters.search]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - var(--status-bar-height))",
        overflow: "hidden",
      }}
    >
      {/* Section 1: Page Header Bar */}
      <div
        style={{
          height: "48px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        {/* Left: title + count badge + live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
              color: "var(--foreground)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Activity
          </h1>
          <span
            style={{
              background: "var(--surface-elevated)",
              borderRadius: "9999px",
              padding: "2px 8px",
              fontSize: "12px",
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              color: "var(--foreground-muted)",
            }}
          >
            {filteredEvents.length} events
          </span>
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Radio
                size={14}
                strokeWidth={1.5}
                style={{
                  color: "var(--status-success)",
                  animation: "status-pulse 2s ease-out infinite",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                fontFamily: "var(--font-ui)",
                color: "var(--status-success)",
              }}
            >
              Live
            </span>
          </div>
        </div>

        {/* Right: time range */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            style={{
              height: "28px",
              width: "140px",
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "0 28px 0 10px",
              fontSize: "12px",
              fontFamily: "var(--font-ui)",
              color: "var(--foreground-muted)",
              outline: "none",
              appearance: "none",
              WebkitAppearance: "none",
              cursor: "pointer",
            }}
          >
            <option value="last-30m">Last 30 minutes</option>
            <option value="last-2h">Last 2 hours</option>
            <option value="last-24h">Last 24 hours</option>
            <option value="last-7d">Last 7 days</option>
            <option value="all">All time</option>
          </select>
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            style={{
              position: "absolute",
              right: 8,
              pointerEvents: "none",
              color: "var(--foreground-muted)",
            }}
          />
        </div>
      </div>

      {/* Section 2: Activity Stats Bar */}
      <ActivityStats stats={stats} />

      {/* Section 3: Filter Bar */}
      <ActivityFilters
        filters={filters}
        onFiltersChange={setFilters}
        projects={projects}
        resultCount={filteredEvents.length}
      />

      {/* Section 4: Timeline Body */}
      <ActivityTimeline events={filteredEvents} />
    </div>
  );
}
