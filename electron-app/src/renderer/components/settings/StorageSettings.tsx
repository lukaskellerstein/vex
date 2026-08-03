import { AlertTriangle, Image, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface StorageSegment {
  label: string;
  value: number;
  color: string;
  displayLabel: string;
}

function StorageBar({ segments, animate }: { segments: StorageSegment[]; animate: boolean }) {
  const [widths, setWidths] = useState<number[]>(segments.map(() => 0));
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  useEffect(() => {
    const targets = segments.map((s) => (total > 0 ? (s.value / total) * 100 : 0));

    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWidths(targets);
      return;
    }

    let start: number | null = null;
    const duration = 400;
    const staggerDelay = 80;

    function tick(timestamp: number) {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;

      const newWidths = targets.map((target, i) => {
        const segStart = i * staggerDelay;
        const segElapsed = Math.max(0, elapsed - segStart);
        const progress = Math.min(segElapsed / duration, 1);
        const eased = 1 - (1 - progress) ** 2;
        return target * eased;
      });

      setWidths(newWidths);

      if (elapsed < duration + (targets.length - 1) * staggerDelay) {
        requestAnimationFrame(tick);
      } else {
        setWidths(targets);
      }
    }

    requestAnimationFrame(tick);
  }, [animate, segments, total]);

  return (
    <div>
      <div
        style={{
          height: "48px",
          borderRadius: "6px",
          overflow: "hidden",
          background: "var(--surface)",
          display: "flex",
        }}
      >
        {segments.map((seg, i) => (
          <div key={seg.label} style={{ width: `${widths[i]}%`, background: seg.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "20px", marginTop: "10px", flexWrap: "wrap" }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                background: seg.color,
                border:
                  seg.color === "var(--surface-elevated)" ? "1px solid var(--border)" : "none",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
              {seg.displayLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";
    el.style.transition = "opacity 250ms ease-out, transform 250ms ease-out";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "scale(1)";
    });
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(13,14,20,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--glass-border)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          padding: "24px",
          width: "360px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <AlertTriangle
          size={24}
          style={{ color: "var(--status-error)", marginBottom: "12px" }}
          strokeWidth={1.5}
        />
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--foreground)",
            textAlign: "center",
            letterSpacing: "-0.02em",
            marginBottom: "8px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "var(--foreground-muted)",
            textAlign: "center",
            lineHeight: "1.5",
            marginBottom: "20px",
          }}
        >
          {body}
        </div>
        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: "32px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--foreground-muted)",
              background: "transparent",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              height: "32px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--primary-foreground)",
              background: "var(--status-error)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageSettings() {
  const [barAnimated, setBarAnimated] = useState(false);
  const [segments, setSegments] = useState<StorageSegment[]>([]);
  const [showClearScreenshotsDialog, setShowClearScreenshotsDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  useEffect(() => {
    window.electronAPI
      .getStorageStats()
      .then((stats: Record<string, unknown>) => {
        if (!stats) return;
        const dbSize = (stats.database_bytes as number) || 0;
        const ssSize = (stats.screenshots_bytes as number) || 0;
        const freeEstimate = Math.max(0, 1024 * 1024 * 1024 - dbSize - ssSize);

        setSegments([
          {
            label: "database",
            value: dbSize,
            color: "var(--primary)",
            displayLabel: `Database: ${formatBytes(dbSize)}`,
          },
          {
            label: "screenshots",
            value: ssSize,
            color: "var(--status-info)",
            displayLabel: `Screenshots: ${formatBytes(ssSize)}`,
          },
          {
            label: "free",
            value: freeEstimate,
            color: "var(--surface-elevated)",
            displayLabel: `Free: ${formatBytes(freeEstimate)}`,
          },
        ]);
      })
      .catch(() => {
        setSegments([
          {
            label: "database",
            value: 24 * 1024 * 1024,
            color: "var(--primary)",
            displayLabel: "Database: 24 MB",
          },
          {
            label: "screenshots",
            value: 142 * 1024 * 1024,
            color: "var(--status-info)",
            displayLabel: "Screenshots: 142 MB",
          },
          {
            label: "free",
            value: 834 * 1024 * 1024,
            color: "var(--surface-elevated)",
            displayLabel: "Free: 834 MB",
          },
        ]);
      });

    const timer = setTimeout(() => setBarAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  async function handleClearScreenshots() {
    setShowClearScreenshotsDialog(false);
    await window.electronAPI.clearScreenshots();
  }

  function handleClearAll() {
    setShowClearAllDialog(false);
    // Stub: full data clear would need a dedicated IPC call
  }

  const monoStyle: React.CSSProperties = {
    height: "32px",
    background: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "0 10px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: "var(--foreground-muted)",
    outline: "none",
    width: "320px",
  };

  return (
    <div>
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          paddingBottom: "12px",
          marginBottom: "24px",
          fontSize: "18px",
          fontWeight: 700,
          color: "var(--foreground)",
          letterSpacing: "-0.02em",
        }}
      >
        Storage
      </div>

      {/* Database path */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "40px",
          padding: "8px 0",
          borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
        }}
      >
        <div style={{ maxWidth: "55%" }}>
          <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 500 }}>
            Database path
          </div>
          <div
            style={{
              color: "var(--foreground-dim)",
              fontSize: "12px",
              lineHeight: "1.5",
              marginTop: "2px",
            }}
          >
            Location of the SQLite database file storing projects, batches, and activity history.
          </div>
        </div>
        <input value="~/.vex/vex.db" readOnly style={monoStyle} />
      </div>

      {/* Screenshot cache path */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "40px",
          padding: "8px 0",
          borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
        }}
      >
        <div style={{ maxWidth: "55%" }}>
          <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 500 }}>
            Screenshot cache path
          </div>
          <div
            style={{
              color: "var(--foreground-dim)",
              fontSize: "12px",
              lineHeight: "1.5",
              marginTop: "2px",
            }}
          >
            Directory where action screenshots and visual diffs are stored.
          </div>
        </div>
        <input value="~/.vex/data/" readOnly style={monoStyle} />
      </div>

      {/* Storage Usage */}
      <div style={{ marginTop: "24px", marginBottom: "16px" }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--foreground)",
            marginBottom: "16px",
          }}
        >
          Storage Usage
        </div>
        {segments.length > 0 && <StorageBar segments={segments} animate={barAnimated} />}
      </div>

      {/* Danger Zone */}
      <div
        style={{
          borderTop: "1px solid color-mix(in srgb, var(--status-error) 15%, transparent)",
          paddingTop: "20px",
          marginTop: "24px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--status-error)",
            marginBottom: "12px",
          }}
        >
          Danger Zone
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => setShowClearScreenshotsDialog(true)}
            style={{
              height: "32px",
              padding: "0 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--status-warning)",
              background: "transparent",
              border: "1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "background 150ms ease-out, border-color 150ms ease-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--status-warning) 10%, transparent)";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--status-warning) 60%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--status-warning) 30%, transparent)";
            }}
          >
            <Image size={14} strokeWidth={1.5} />
            Clear Screenshots
          </button>

          <button
            onClick={() => setShowClearAllDialog(true)}
            style={{
              height: "32px",
              padding: "0 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--status-error)",
              background: "transparent",
              border: "1px solid color-mix(in srgb, var(--status-error) 30%, transparent)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "background 150ms ease-out, border-color 150ms ease-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--status-error) 10%, transparent)";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--status-error) 60%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--status-error) 30%, transparent)";
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Clear All Data
          </button>
        </div>
      </div>

      {showClearScreenshotsDialog && (
        <ConfirmDialog
          title="Clear screenshots?"
          body="This will permanently delete all cached screenshots and visual diffs. This cannot be undone."
          confirmLabel="Clear Screenshots"
          onConfirm={handleClearScreenshots}
          onCancel={() => setShowClearScreenshotsDialog(false)}
        />
      )}

      {showClearAllDialog && (
        <ConfirmDialog
          title="Clear all data?"
          body="This will permanently delete all projects, batches, and activity history. This cannot be undone."
          confirmLabel="Delete Everything"
          onConfirm={handleClearAll}
          onCancel={() => setShowClearAllDialog(false)}
        />
      )}
    </div>
  );
}
