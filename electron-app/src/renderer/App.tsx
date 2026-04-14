import React, { useEffect } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { AgentTrace } from "./pages/AgentTrace";
import { Activity } from "./pages/Activity";
import { Settings } from "./pages/Settings";
import { AgentTraceDemo } from "./pages/AgentTraceDemo";

export function App() {
  useEffect(() => {
    window.electronAPI.subscribeProjectEvents();
    window.electronAPI.subscribeBatchEvents();
    window.electronAPI.subscribeActivityEvents();
    return () => {
      window.electronAPI.unsubscribeProjectEvents();
      window.electronAPI.unsubscribeBatchEvents();
      window.electronAPI.unsubscribeActivityEvents();
    };
  }, []);

  return (
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Projects />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/project/:id/trace/:traceId" element={<AgentTrace />} />
          <Route path="/project/:id/agent/:agentId" element={<AgentTrace />} />
          <Route path="/project/:id/agent/:agentId/subagent/:subagentId" element={<AgentTrace />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/demo/agent-trace" element={<AgentTraceDemo />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
