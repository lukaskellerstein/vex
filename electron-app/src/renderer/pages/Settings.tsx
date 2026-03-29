import React, { useEffect, useState } from "react";

interface Config {
  agent_manager_port?: number;
  nats_port?: number;
  nats_ws_port?: number;
  [key: string]: unknown;
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#1a1a2e",
  border: "1px solid #3d3d5c",
  borderRadius: "6px",
  color: "#e0e0e0",
  fontSize: "14px",
  width: "120px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#a0a0b8",
  minWidth: "180px",
};

export function Settings() {
  const [config, setConfig] = useState<Config>({
    agent_manager_port: 8420,
    nats_port: 4222,
    nats_ws_port: 4223,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI.getConfig().then((data: any) => {
      if (data && typeof data === "object") {
        setConfig((prev) => ({ ...prev, ...data }));
      }
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await window.electronAPI.updateConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof Config, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setConfig((prev) => ({ ...prev, [field]: num }));
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "20px" }}>
        Settings
      </h2>

      <div
        style={{
          background: "#2d2d44",
          padding: "20px",
          borderRadius: "8px",
          maxWidth: "500px",
        }}
      >
        <h3
          style={{ fontSize: "16px", fontWeight: 500, marginBottom: "16px" }}
        >
          Port Configuration
        </h3>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={labelStyle}>AgentManager Port</span>
            <input
              type="number"
              style={inputStyle}
              value={config.agent_manager_port ?? ""}
              onChange={(e) => updateField("agent_manager_port", e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={labelStyle}>NATS Port</span>
            <input
              type="number"
              style={inputStyle}
              value={config.nats_port ?? ""}
              onChange={(e) => updateField("nats_port", e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={labelStyle}>NATS WebSocket Port</span>
            <input
              type="number"
              style={inputStyle}
              value={config.nats_ws_port ?? ""}
              onChange={(e) => updateField("nats_ws_port", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px",
              background: "#6c63ff",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: saving ? "default" : "pointer",
              fontSize: "14px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span style={{ color: "#4caf50", fontSize: "13px" }}>Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
