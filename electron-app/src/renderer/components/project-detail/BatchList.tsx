import React, { useState, useEffect } from "react";
import { Search, Filter } from "lucide-react";
import { BatchCard } from "./BatchCard";

interface BatchData {
  id: string;
  status: string;
  page_url?: string;
  actions?: Array<{
    id: string;
    type: string;
    selector?: string;
    description?: string;
    before?: string;
    after?: string;
  }>;
  action_count?: number;
  duration_ms?: number | null;
  cost_usd?: number | null;
  created_at?: string;
  submitted_at?: string;
  error_message?: string | null;
  agent_trace_id?: string | null;
}

interface BatchListProps {
  projectId: string;
  onViewTrace?: (traceId: string) => void;
  onViewAgent?: (agentId: string) => void;
  onDeleteBatch?: (batchId: string) => void;
  onStopBatch?: (batchId: string) => void;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function BatchList({ projectId, onViewTrace, onViewAgent, onDeleteBatch, onStopBatch }: BatchListProps) {
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;

    async function fetchBatches() {
      try {
        const result = await window.electronAPI.getBatches(projectId);
        if (!cancelled && Array.isArray(result)) {
          setBatches(result);
        }
      } catch {
        // Silently handle fetch errors
      }
    }

    fetchBatches();
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchBatches, 300);
    };
    const cleanupBatch = window.electronAPI.onBatchEvent(debouncedFetch);
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      cleanupBatch();
    };
  }, [projectId]);

  const filtered = batches.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesId = b.id.toLowerCase().includes(q);
      const matchesUrl = (b.page_url ?? "").toLowerCase().includes(q);
      if (!matchesId && !matchesUrl) return false;
    }
    return true;
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {/* Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          height: "40px",
          borderBottom: "1px solid var(--border)",
          padding: "0 16px",
          flexShrink: 0,
          background: "var(--surface)",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: "8px",
              color: "var(--foreground-dim)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batches..."
            style={{
              width: "200px",
              height: "26px",
              paddingLeft: "28px",
              paddingRight: "8px",
              fontSize: "13px",
              color: "var(--foreground-muted)",
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "8px" }}>
          <Filter size={12} style={{ color: "var(--foreground-dim)", marginRight: "4px" }} />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              style={{
                height: "22px",
                padding: "0 10px",
                fontSize: "11px",
                borderRadius: "var(--radius)",
                fontWeight: 500,
                transition: "all 0.15s",
                ...(statusFilter === f.value
                  ? {
                      background: "hsla(263, 82%, 57.5%, 0.08)",
                      color: "var(--primary-hover)",
                      border: "1px solid hsla(263, 82%, 57.5%, 0.3)",
                    }
                  : {
                      background: "transparent",
                      color: "var(--foreground-dim)",
                      border: "1px solid transparent",
                    }),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            color: "var(--foreground-disabled)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {filtered.length} {filtered.length === 1 ? "batch" : "batches"}
        </span>
      </div>

      {/* Batch List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-bright) transparent",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--foreground-disabled)" }}>
              {search || statusFilter !== "all" ? "No batches match your filter" : "No batches yet"}
            </p>
          </div>
        ) : (
          filtered.map((batch) => (
            <BatchCard key={batch.id} batch={batch} projectId={projectId} onViewTrace={onViewTrace} onViewAgent={onViewAgent} onDelete={onDeleteBatch} onStop={onStopBatch} />
          ))
        )}
      </div>
    </div>
  );
}
