import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WindowControls } from "./WindowControls";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(true);

  const contentStyle: React.CSSProperties = {
    marginLeft: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)",
    height: "calc(100vh - var(--status-bar-height))",
    overflow: "auto",
    transition: "margin-left 200ms ease",
  };

  return (
    <div style={{ position: "relative" }}>
      <WindowControls />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main style={contentStyle}>
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
}
