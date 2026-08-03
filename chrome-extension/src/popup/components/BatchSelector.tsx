import { useCallback, useEffect, useState } from "react";
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
  tabUrl: string;
  activeTabId: number | null;
}

export function BatchSelector({ tabUrl, activeTabId }: BatchSelectorProps) {
  const [batches, setBatches] = useState<BatchEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBatches = useCallback(async () => {
    if (!tabUrl) return;
    try {
      const url = `${AGENT_MANAGER_URL}/api/batches?page_url=${encodeURIComponent(tabUrl)}&limit=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return;
      const data = (await res.json()) as BatchEntry[];
      setBatches(data);
    } catch {
      // AO not reachable
    }
  }, [tabUrl]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function selectBatch(batchId: string) {
    if (!activeTabId) return;

    if (batchId === selectedId) {
      // Deselect — clear cursors
      setSelectedId(null);
      chrome.tabs.sendMessage(activeTabId, { action: "loadBatchCursors", agents: [] });
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
      chrome.tabs.sendMessage(activeTabId, { action: "loadBatchCursors", agents: data.agents });
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

  const statusColor = (s: string) => {
    if (s === "completed") return "#a6e3a1";
    if (s === "failed") return "#f38ba8";
    if (s === "processing") return "#89b4fa";
    if (s === "cancelled") return "#fab387";
    return "#585b70";
  };

  return (
    <div className="batch-selector">
      <div className="batch-selector-header">Recent Batches</div>
      {batches.map((b) => (
        <button
          key={b.id}
          className={`batch-item ${selectedId === b.id ? "batch-item--selected" : ""}`}
          onClick={() => selectBatch(b.id)}
          disabled={loading}
        >
          <span className="batch-dot" style={{ backgroundColor: statusColor(b.status) }} />
          <span className="batch-item-info">
            <span className="batch-item-time">{formatTime(b.submitted_at)}</span>
            <span className="batch-item-meta">
              {b.id} · {b.action_count} action{b.action_count !== 1 ? "s" : ""}
              {b.cost_usd != null ? ` · $${b.cost_usd.toFixed(2)}` : ""}
            </span>
          </span>
          {selectedId === b.id && <span className="batch-item-check">&#x2713;</span>}
        </button>
      ))}
    </div>
  );
}
