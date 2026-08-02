import { Bot, HardDrive, Info, Network, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { AboutSettings } from "./AboutSettings";
import { AgentSettings } from "./AgentSettings";
import { GeneralSettings } from "./GeneralSettings";
import { PortsSettings } from "./PortsSettings";
import { StorageSettings } from "./StorageSettings";

type SettingsTab = "general" | "ports" | "agents" | "storage" | "about";

interface TabItem {
  id: SettingsTab;
  icon: React.ElementType;
  label: string;
}

const TABS: TabItem[] = [
  { id: "general", icon: Settings2, label: "General" },
  { id: "ports", icon: Network, label: "Ports & Networking" },
  { id: "agents", icon: Bot, label: "Agent Configuration" },
  { id: "storage", icon: HardDrive, label: "Storage" },
  { id: "about", icon: Info, label: "About" },
];

function renderTab(tab: SettingsTab) {
  switch (tab) {
    case "general":
      return <GeneralSettings />;
    case "ports":
      return <PortsSettings />;
    case "agents":
      return <AgentSettings />;
    case "storage":
      return <StorageSettings />;
    case "about":
      return <AboutSettings />;
  }
}

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const contentRef = useRef<HTMLDivElement>(null);

  function handleTabChange(tab: SettingsTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);

    if (contentRef.current) {
      const el = contentRef.current;
      el.style.opacity = "0";
      requestAnimationFrame(() => {
        el.style.transition = "opacity 0.2s ease-out";
        el.style.opacity = "1";
      });
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left tab bar */}
      <div
        style={{
          width: "200px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "16px 0",
        }}
      >
        <div
          style={{
            color: "var(--foreground-dim)",
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "0 16px 12px 16px",
          }}
        >
          Settings
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  height: "32px",
                  padding: "0 16px 0 13px",
                  border: "none",
                  borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                  borderRadius: "0 4px 4px 0",
                  background: isActive ? "var(--surface-hover)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 150ms ease-out",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--surface-elevated)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={1.5}
                  style={{
                    color: isActive ? "var(--primary)" : "var(--foreground-dim)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right content area */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--background)",
          padding: "32px 40px",
        }}
      >
        <div style={{ maxWidth: "800px" }}>{renderTab(activeTab)}</div>
      </div>
    </div>
  );
}
