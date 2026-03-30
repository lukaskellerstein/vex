import React, { useEffect, useState } from "react";

interface StatusState {
  nats: "connected" | "disconnected" | "unknown";
  agentManager: "connected" | "disconnected" | "unknown";
  agentCount: number;
}

const dotStyle = (color: string): React.CSSProperties => ({
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: color,
  display: "inline-block",
});

const statusColor = (s: string): string => {
  if (s === "connected") return "#4caf50";
  if (s === "disconnected") return "#f44336";
  return "#888";
};

export function StatusBar() {
  const [status, setStatus] = useState<StatusState>({
    nats: "unknown",
    agentManager: "unknown",
    agentCount: 0,
  });

  useEffect(() => {
    async function poll() {
      // Check NATS health via ProcessManager IPC
      try {
        const natsStatus = await window.electronAPI.getNatsStatus();
        setStatus((prev) => ({
          ...prev,
          nats: natsStatus?.healthy ? "connected" : "disconnected",
        }));
      } catch {
        setStatus((prev) => ({ ...prev, nats: "disconnected" }));
      }

      // Check AgentManager via config endpoint
      try {
        const config = await window.electronAPI.getConfig();
        setStatus((prev) => ({
          ...prev,
          agentManager: config ? "connected" : "disconnected",
        }));
      } catch {
        setStatus((prev) => ({ ...prev, agentManager: "disconnected" }));
      }

      // Check agent count
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

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        padding: "6px 16px",
        background: "#16162a",
        borderTop: "1px solid #2d2d44",
        fontSize: "12px",
        color: "#a0a0b8",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={dotStyle(statusColor(status.nats))} />
        NATS
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={dotStyle(statusColor(status.agentManager))} />
        AgentManager
      </div>
      <div>
        Agents: {status.agentCount}
      </div>
    </div>
  );
}
