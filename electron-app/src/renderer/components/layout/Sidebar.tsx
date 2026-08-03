import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  type LucideIcon,
  Settings2,
} from "lucide-react";
import type React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logoIcon from "../../assets/logo-icon.png";
import { Tooltip } from "../ui/Tooltip";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Projects", icon: FolderOpen },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/settings", label: "Settings", icon: Settings2 },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  function isActive(path: string): boolean {
    if (path === "/") {
      return location.pathname === "/" || location.pathname.startsWith("/project/");
    }
    return location.pathname.startsWith(path);
  }

  const sidebarStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: "var(--status-bar-height)",
    width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)",
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    transition: "width 200ms ease",
    zIndex: 20,
    overflow: "hidden",
  };

  const logoContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: "48px",
    padding: "0 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    gap: "8px",
  };

  const logoIconStyle: React.CSSProperties = {
    width: "28px",
    height: "28px",
    flexShrink: 0,
  };

  const navStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    overflow: "hidden",
  };

  function navItemStyle(active: boolean): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "0 8px",
      height: "36px",
      borderRadius: "var(--radius)",
      fontSize: "13px",
      color: active ? "var(--foreground)" : "var(--foreground-muted)",
      background: active ? "var(--surface-elevated)" : "transparent",
      borderLeft: active ? "2px solid var(--primary)" : "2px solid transparent",
      paddingLeft: active ? "6px" : "8px",
      cursor: "pointer",
      transition: "color 150ms, background 150ms",
      whiteSpace: "nowrap",
    };
  }

  const toggleContainerStyle: React.CSSProperties = {
    padding: "8px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  };

  const toggleButtonStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-end",
    height: "32px",
    padding: "0 8px",
    borderRadius: "var(--radius)",
    color: "var(--foreground-muted)",
    cursor: "pointer",
    transition: "color 150ms, background 150ms",
  };

  return (
    <aside style={sidebarStyle}>
      {/* Logo */}
      <div style={logoContainerStyle}>
        <img src={logoIcon} alt="Vex" style={logoIconStyle} />
        {!collapsed && (
          <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--foreground)" }}>Vex</span>
        )}
      </div>

      {/* Nav items */}
      <nav style={navStyle}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);

          const item = (
            <div
              key={path}
              style={navItemStyle(active)}
              onClick={() => navigate(path)}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--foreground)";
                  e.currentTarget.style.background = "var(--surface-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "var(--foreground-muted)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{label}</span>}
            </div>
          );

          if (collapsed) {
            return (
              <Tooltip key={path} content={label} side="right">
                {item}
              </Tooltip>
            );
          }

          return item;
        })}
      </nav>

      {/* Collapse toggle */}
      <div style={toggleContainerStyle}>
        <Tooltip content={collapsed ? "Expand" : "Collapse"} side="right">
          <button
            onClick={onToggle}
            style={toggleButtonStyle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--foreground)";
              e.currentTarget.style.background = "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--foreground-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
