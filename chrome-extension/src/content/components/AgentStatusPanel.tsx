import type { FC } from "react";
import { useState } from "react";

interface PanelAgent {
  agentId: string;
  agentName: string;
  status: "running" | "completed" | "failed";
}

interface AgentStatusPanelProps {
  agents: PanelAgent[];
  onContinue: (agentId: string, message: string) => void;
}

export const AgentStatusPanel: FC<AgentStatusPanelProps> = ({ agents, onContinue }) => {
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  if (agents.length === 0) return null;

  function handleSend(agentId: string) {
    if (!message.trim()) return;
    onContinue(agentId, message.trim());
    setMessage("");
    setActiveInput(null);
  }

  return (
    <div className="vex-status-panel">
      <div className="vex-status-panel-header">
        <span className="vex-status-panel-dot" />
        Agents ({agents.length})
      </div>
      <div className="vex-status-panel-list">
        {agents.map((agent) => {
          const isTerminal = agent.status === "completed" || agent.status === "failed";
          return (
            <div key={agent.agentId} className="vex-status-panel-item">
              <div className="vex-status-panel-row">
                <span className="vex-status-panel-badge" data-status={agent.status}>
                  {agent.status === "running" ? "●" : agent.status === "completed" ? "✓" : "✕"}
                </span>
                <span className="vex-status-panel-name">{agent.agentName}</span>
                {isTerminal && activeInput !== agent.agentId && (
                  <button
                    className="vex-status-panel-continue"
                    onClick={() => setActiveInput(agent.agentId)}
                  >
                    Continue
                  </button>
                )}
              </div>
              {activeInput === agent.agentId && (
                <div className="vex-status-panel-input">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(agent.agentId);
                      }
                    }}
                    placeholder="Follow-up message..."
                    rows={2}
                    className="vex-cursor-reply-textarea"
                  />
                  <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                    <button
                      className="vex-cursor-reply-cancel"
                      onClick={() => {
                        setActiveInput(null);
                        setMessage("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="vex-cursor-reply-send"
                      disabled={!message.trim()}
                      onClick={() => handleSend(agent.agentId)}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
