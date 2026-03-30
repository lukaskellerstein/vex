import React, { useRef, useState, useCallback, useEffect } from "react";
import { Search, ArrowDown, Trash2 } from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

interface DevServerLogsProps {
  projectId: string;
  isRunning: boolean;
}

const LEVEL_FILTERS = ["all", "stdout", "stderr", "info", "warn", "error"] as const;

const LEVEL_COLORS: Record<string, string> = {
  stdout: "var(--foreground)",
  stderr: "var(--status-error)",
  info: "var(--status-info)",
  warn: "var(--status-warning)",
  error: "var(--status-error)",
};

const LEVEL_LABEL_COLORS: Record<string, string> = {
  stdout: "var(--foreground-dim)",
  stderr: "var(--status-error)",
  info: "var(--foreground-dim)",
  warn: "var(--status-warning)",
  error: "var(--status-error)",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function highlightSearch(message: string, term: string): React.ReactNode {
  if (!term) return message;
  const idx = message.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return message;
  return (
    <>
      {message.slice(0, idx)}
      <span style={{ background: "hsla(263, 82%, 57.5%, 0.25)" }}>
        {message.slice(idx, idx + term.length)}
      </span>
      {message.slice(idx + term.length)}
    </>
  );
}

export function DevServerLogs({ projectId, isRunning }: DevServerLogsProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const isAtBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 40;
    setAutoScroll(isAtBottom);
  }, []);

  // Poll for logs
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const result = await window.electronAPI.getDevServerLogs(projectId, offsetRef.current);
        if (result?.lines?.length > 0) {
          const newEntries: LogEntry[] = result.lines.map((line: string, i: number) => {
            const level = line.startsWith("[err]") ? "stderr" : line.startsWith("[warn]") ? "warn" : "stdout";
            return {
              id: `${offsetRef.current}-${i}`,
              timestamp: new Date().toISOString(),
              level,
              message: line,
            };
          });
          setLogs((prev) => [...prev, ...newEntries]);
          offsetRef.current = result.offset;
        }
      } catch {
        // Backend not ready
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [projectId, isRunning]);

  // Auto-scroll on new logs
  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [logs, autoScroll, scrollToBottom]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    offsetRef.current = 0;
  }, []);

  const filtered = logs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
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
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          height: "36px",
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs..."
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

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {LEVEL_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setLevelFilter(f)}
              style={{
                height: "22px",
                padding: "0 8px",
                fontSize: "11px",
                borderRadius: "var(--radius)",
                fontWeight: 500,
                transition: "all 0.15s",
                ...(levelFilter === f
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
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>

        {/* Auto-scroll toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
          <ArrowDown size={12} style={{ color: "var(--foreground-muted)" }} />
          <span style={{ fontSize: "11px", color: "var(--foreground-muted)", whiteSpace: "nowrap" }}>Auto-scroll</span>
          <button
            onClick={() => setAutoScroll((p) => !p)}
            style={{
              position: "relative",
              width: "32px",
              height: "18px",
              borderRadius: "9px",
              transition: "background 0.15s",
              background: autoScroll ? "var(--primary)" : "var(--border)",
              flexShrink: 0,
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: autoScroll ? "16px" : "3px",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "white",
                transition: "left 0.15s",
              }}
            />
          </button>
        </div>

        <button
          onClick={clearLogs}
          title="Clear logs"
          style={{
            marginLeft: "8px",
            color: "var(--foreground-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--foreground-muted)")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Log viewer */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
          fontFamily: "var(--font-mono)",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-bright) transparent",
        }}
      >
        {filtered.map((log) => (
          <div
            key={log.id}
            style={{
              display: "flex",
              gap: "12px",
              padding: "1px 16px",
              alignItems: "baseline",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span
              style={{
                fontSize: "10px",
                color: "var(--foreground-disabled)",
                minWidth: "72px",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTimestamp(log.timestamp)}
            </span>
            <span
              style={{
                fontSize: "11px",
                flexShrink: 0,
                minWidth: "44px",
                color: LEVEL_LABEL_COLORS[log.level] ?? "var(--foreground-dim)",
                fontWeight: log.level === "error" || log.level === "stderr" ? 600 : 400,
              }}
            >
              {log.level === "stdout" ? "" : `[${log.level}]`}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: LEVEL_COLORS[log.level] ?? "var(--foreground)",
                fontWeight: log.level === "error" || log.level === "stderr" ? 600 : 400,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {highlightSearch(log.message, searchTerm)}
            </span>
          </div>
        ))}

        {filtered.length === 0 && (
          <p
            style={{
              fontSize: "13px",
              color: "var(--foreground-disabled)",
              textAlign: "center",
              marginTop: "32px",
            }}
          >
            {searchTerm || levelFilter !== "all" ? "No logs match your filter" : "No logs yet"}
          </p>
        )}
      </div>
    </div>
  );
}
