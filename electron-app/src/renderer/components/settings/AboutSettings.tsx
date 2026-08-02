import {
  CheckCircle2,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  MessageSquare,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
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
      <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 500 }}>{label}</div>
      <div
        style={{
          fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
          fontSize: "13px",
          color: "var(--foreground-muted)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

interface LinkRowProps {
  icon: React.ElementType;
  iconColor?: string;
  label: string;
  url: string;
}

function LinkRow({ icon: Icon, iconColor, label, url }: LinkRowProps) {
  function handleClick() {
    window.electronAPI.openExternal(url);
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "36px",
        borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
        cursor: "pointer",
        padding: "0 4px",
        borderRadius: "4px",
        transition: "background 150ms ease-out",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Icon
          size={16}
          strokeWidth={1.5}
          style={{ color: iconColor || "var(--foreground-dim)", flexShrink: 0 }}
        />
        <span style={{ fontSize: "13px", color: "var(--foreground-muted)" }}>{label}</span>
      </div>
      <ExternalLink size={12} strokeWidth={1.5} style={{ color: "var(--foreground-disabled)" }} />
    </div>
  );
}

type UpdateStatus = "idle" | "checking" | "up-to-date";

export function AboutSettings() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [appInfo, setAppInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    window.electronAPI
      .getAppInfo()
      .then((info: Record<string, string>) => {
        if (info) setAppInfo(info);
      })
      .catch(() => {});
  }, []);

  function handleCheckUpdates() {
    setUpdateStatus("checking");
    setTimeout(() => setUpdateStatus("up-to-date"), 2000);
  }

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
        About Vex
      </div>

      {/* Identity block */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 0",
          borderBottom: "1px solid var(--border)",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "10px",
            background: "color-mix(in srgb, var(--primary) 15%, transparent)",
            marginBottom: "12px",
          }}
        >
          <Zap size={28} strokeWidth={1.5} style={{ color: "var(--primary)" }} />
        </div>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Vex
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "var(--foreground-dim)",
            marginTop: "6px",
            textAlign: "center",
          }}
        >
          Visual editing in the browser
        </div>
      </div>

      {/* Info rows */}
      <InfoRow label="Version" value={appInfo.version || "-"} mono />
      <InfoRow label="Electron" value={appInfo.electron || "-"} mono />
      <InfoRow label="Node.js" value={appInfo.node || "-"} mono />
      <InfoRow label="Platform" value={appInfo.platform || "-"} />

      {/* Resources */}
      <div style={{ marginTop: "24px", marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
          Resources
        </div>
      </div>

      <LinkRow
        icon={FileText}
        label="Documentation"
        url="https://github.com/lukaskellerstein/vex#readme"
      />
      <LinkRow
        icon={GitBranch}
        label="GitHub Repository"
        url="https://github.com/lukaskellerstein/vex"
      />
      <LinkRow
        icon={MessageSquare}
        label="Report an Issue"
        url="https://github.com/lukaskellerstein/vex/issues/new"
      />

      {/* Check for Updates */}
      <div style={{ marginTop: "24px" }}>
        <button
          onClick={handleCheckUpdates}
          disabled={updateStatus === "checking"}
          style={{
            height: "32px",
            padding: "0 14px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color:
              updateStatus === "up-to-date" ? "var(--status-success)" : "var(--foreground-muted)",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            cursor: updateStatus === "checking" ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            opacity: updateStatus === "checking" ? 0.7 : 1,
            transition: "color 150ms ease-out, border-color 150ms ease-out",
          }}
          onMouseEnter={(e) => {
            if (updateStatus !== "checking") {
              e.currentTarget.style.borderColor = "var(--border-bright)";
              if (updateStatus === "idle") e.currentTarget.style.color = "var(--foreground)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color =
              updateStatus === "up-to-date" ? "var(--status-success)" : "var(--foreground-muted)";
          }}
        >
          {updateStatus === "checking" ? (
            <>
              <Loader2 size={14} strokeWidth={1.5} className="spin" />
              Checking...
            </>
          ) : updateStatus === "up-to-date" ? (
            <>
              <CheckCircle2
                size={14}
                strokeWidth={1.5}
                style={{ color: "var(--status-success)" }}
              />
              Up to date
            </>
          ) : (
            <>
              <RefreshCw size={14} strokeWidth={1.5} />
              Check for Updates
            </>
          )}
        </button>
      </div>
    </div>
  );
}
