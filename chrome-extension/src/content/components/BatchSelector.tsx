import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_MANAGER_URL } from "../../shared/messages";

interface BatchEntry {
  id: string;
  page_url: string;
  page_title: string;
  action_count: number;
  status: string;
  cost_usd: number | null;
  submitted_at: string;
}

interface CursorAgent {
  agentId: string;
  agentName: string;
  selector: string;
  colorIndex: number;
  status: string;
}

interface BatchSelectorProps {
  onBatchAgents: (agents: CursorAgent[]) => void;
}

export function BatchSelector({ onBatchAgents }: BatchSelectorProps) {
  const [batches, setBatches] = useState<BatchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch recent batches for current page URL
  const fetchBatches = useCallback(async () => {
    try {
      const url = `${AGENT_MANAGER_URL}/api/batches?page_url=${encodeURIComponent(location.href)}&limit=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return;
      const data = (await res.json()) as BatchEntry[];
      setBatches(data);
    } catch {
      // AO not reachable
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    // Refresh every 10s to catch new batches
    const interval = setInterval(fetchBatches, 10000);
    return () => clearInterval(interval);
  }, [fetchBatches]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [open]);

  async function selectBatch(batchId: string) {
    if (batchId === selectedId) {
      // Deselect — clear cursors
      setSelectedId(null);
      onBatchAgents([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${AGENT_MANAGER_URL}/api/batches/${batchId}/cursors`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        batchId: string;
        pageUrl: string;
        agents: CursorAgent[];
      };
      setSelectedId(batchId);
      onBatchAgents(data.agents);
      setOpen(false);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }

  if (batches.length === 0) return null;

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  }

  const statusDot = (s: string) => {
    if (s === "completed") return "vex-batch-dot--completed";
    if (s === "failed") return "vex-batch-dot--failed";
    if (s === "processing") return "vex-batch-dot--running";
    if (s === "cancelled") return "vex-batch-dot--cancelled";
    return "";
  };

  return (
    <div ref={panelRef} className="vex-batch-selector">
      <button
        className={`vex-batch-toggle ${selectedId ? "vex-batch-toggle--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Recent batches"
      >
        <span className="vex-batch-toggle-icon">&#x25F6;</span>
        <span className="vex-batch-toggle-count">{batches.length}</span>
      </button>

      {open && (
        <div className="vex-batch-dropdown">
          <div className="vex-batch-dropdown-header">Recent Batches</div>
          {batches.map((b) => (
            <button
              key={b.id}
              className={`vex-batch-item ${selectedId === b.id ? "vex-batch-item--selected" : ""}`}
              onClick={() => selectBatch(b.id)}
              disabled={loading}
            >
              <span className={`vex-batch-dot ${statusDot(b.status)}`} />
              <span className="vex-batch-item-info">
                <span className="vex-batch-item-time">{formatTime(b.submitted_at)}</span>
                <span className="vex-batch-item-actions">
                  {b.action_count} action{b.action_count !== 1 ? "s" : ""}
                </span>
              </span>
              {selectedId === b.id && <span className="vex-batch-item-check">&#x2713;</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
