import { Wifi, WifiOff } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface StatusState {
  nats: "connected" | "disconnected" | "unknown";
  agentCount: number;
  currentTask: string | null;
}

export function StatusBar() {
  const [status, setStatus] = useState<StatusState>({
    nats: "unknown",
    agentCount: 0,
    currentTask: null,
  });
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI
      .getAppInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    async function poll() {
      try {
        const natsStatus = await window.electronAPI.getNatsStatus();
        setStatus((prev) => ({
          ...prev,
          nats: natsStatus?.healthy ? "connected" : "disconnected",
        }));
      } catch {
        setStatus((prev) => ({ ...prev, nats: "disconnected" }));
      }

      try {
        const agents = await window.electronAPI.getAgents();
        const count = Array.isArray(agents) ? agents.length : 0;
        setStatus((prev) => ({ ...prev, agentCount: count }));
      } catch {
        setStatus((prev) => ({ ...prev, agentCount: 0 }));
      }
    }

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const connected = status.nats === "connected";

  const barStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "var(--status-bar-height)",
    background: "var(--surface)",
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    fontSize: "11px",
    zIndex: 30,
  };

  const leftStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
    minWidth: 0,
  };

  const centerStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    minWidth: 0,
    padding: "0 16px",
  };

  const rightStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
    justifyContent: "flex-end",
  };

  const dotStyle: React.CSSProperties = {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: connected ? "var(--status-success)" : "var(--status-idle)",
    flexShrink: 0,
    ...(connected ? { animation: "status-pulse 2s infinite" } : {}),
  };

  const connectionStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    color: connected ? "var(--status-success)" : "var(--status-error)",
  };

  return (
    <footer style={barStyle}>
      {/* Left: server status */}
      <div style={leftStyle}>
        <span style={dotStyle} />
        <span style={{ color: "var(--foreground-muted)" }}>
          NATS {connected ? "Connected" : "Disconnected"}
        </span>
        <span style={{ color: "var(--foreground-dim)" }}>·</span>
        <span style={{ color: "var(--foreground-muted)" }}>Agents: {status.agentCount}</span>
      </div>

      {/* Center: current task */}
      <div style={centerStyle}>
        <span
          style={{
            color: "var(--foreground-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "300px",
            textAlign: "center",
          }}
        >
          {status.currentTask ?? "Idle"}
        </span>
      </div>

      {/* Right: connection + version */}
      <div style={rightStyle}>
        <span style={connectionStyle}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </span>
        {version && (
          <span style={{ color: "var(--foreground-dim)", fontFamily: "var(--font-mono)" }}>
            v{version}
          </span>
        )}
      </div>
    </footer>
  );
}
