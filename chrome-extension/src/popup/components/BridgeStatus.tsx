import { useEffect, useState } from "react";
import { AGENT_MANAGER_URL } from "../../shared/messages";

export function BridgeStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(AGENT_MANAGER_URL + "/health", {
          signal: AbortSignal.timeout(3000),
        });
        setConnected(res.ok);
      } catch {
        setConnected(false);
      }
    };

    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="bridge-status">
      <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
      <span className="connection-text">{connected ? "Connected" : "Disconnected"}</span>
    </span>
  );
}
