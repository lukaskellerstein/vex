import React, { useEffect, useState, useRef } from "react";

interface Agent {
  id: string;
  name: string;
  type?: string;
  tier?: string;
  capabilities?: string[];
  status?: string;
  health?: string;
  last_heartbeat?: string;
}

const statusColors: Record<string, string> = {
  running: "#4caf50",
  idle: "#888",
  error: "#f44336",
  starting: "#ff9800",
  stopped: "#888",
};

export function AgentPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  async function fetchAgents() {
    try {
      const data = await window.electronAPI.getAgents();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    }
  }

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedAgentId) {
      setLogs([]);
      return;
    }

    async function pollLogs() {
      try {
        const data = await window.electronAPI.getAgentLogs(selectedAgentId!);
        if (Array.isArray(data)) {
          setLogs(data);
        } else if (typeof data === "string") {
          setLogs(data.split("\n"));
        }
      } catch {
        // ignore
      }
    }

    pollLogs();
    const interval = setInterval(pollLogs, 3000);
    return () => clearInterval(interval);
  }, [selectedAgentId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      style={{
        background: "#2d2d44",
        padding: "20px",
        borderRadius: "8px",
      }}
    >
      <h3 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "16px" }}>
        Agents
      </h3>

      {agents.length === 0 ? (
        <div style={{ color: "#a0a0b8", fontSize: "13px" }}>
          No agents registered.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                background: "#1a1a2e",
                padding: "14px",
                borderRadius: "6px",
                border:
                  selectedAgentId === agent.id
                    ? "1px solid #6c63ff"
                    : "1px solid transparent",
                cursor: "pointer",
              }}
              onClick={() =>
                setSelectedAgentId(
                  selectedAgentId === agent.id ? null : agent.id
                )
              }
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: 500, fontSize: "14px" }}>
                    {agent.name}
                  </span>
                  {agent.type && (
                    <span
                      style={{
                        padding: "2px 6px",
                        background: "#3d3d5c",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "#c0c0d8",
                      }}
                    >
                      {agent.type}
                    </span>
                  )}
                  {agent.tier && (
                    <span
                      style={{
                        padding: "2px 6px",
                        background: "#2a2a40",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "#a0a0b8",
                      }}
                    >
                      T{agent.tier}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background:
                        statusColors[agent.status ?? "idle"] ?? "#888",
                    }}
                  />
                  <span
                    style={{ fontSize: "12px", color: "#a0a0b8" }}
                  >
                    {agent.status ?? "idle"}
                  </span>
                  {agent.health && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: agent.health === "healthy" ? "#4caf50" : "#f44336",
                      }}
                    >
                      {agent.health}
                    </span>
                  )}
                </div>
              </div>

              {agent.capabilities && agent.capabilities.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    flexWrap: "wrap",
                    marginBottom: "6px",
                  }}
                >
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      style={{
                        padding: "1px 6px",
                        background: "#2a2a40",
                        borderRadius: "3px",
                        fontSize: "10px",
                        color: "#8888aa",
                      }}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              {agent.last_heartbeat && (
                <div style={{ fontSize: "11px", color: "#666680" }}>
                  Last heartbeat: {agent.last_heartbeat}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedAgentId && (
        <div>
          <h4
            style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}
          >
            Logs: {agents.find((a) => a.id === selectedAgentId)?.name}
          </h4>
          <div
            style={{
              background: "#111122",
              borderRadius: "6px",
              padding: "12px",
              maxHeight: "300px",
              overflow: "auto",
              fontFamily: "'Fira Code', 'Consolas', monospace",
              fontSize: "12px",
              lineHeight: "1.5",
              color: "#a0a0b8",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#555" }}>No logs available.</div>
            ) : (
              logs.map((line, i) => <div key={i}>{line}</div>)
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
