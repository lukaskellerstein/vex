import React, { useState } from "react";
import { ProjectList } from "./pages/ProjectList";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Settings } from "./pages/Settings";
import { StatusBar } from "./components/StatusBar";

type Page = "projects" | "detail" | "settings";

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "10px 20px",
  cursor: "pointer",
  background: active ? "#2d2d44" : "transparent",
  color: active ? "#ffffff" : "#a0a0b8",
  border: "none",
  borderBottom: active ? "2px solid #6c63ff" : "2px solid transparent",
  fontSize: "14px",
  fontWeight: active ? 600 : 400,
});

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  function handleSelectProject(id: string) {
    setSelectedProjectId(id);
    setCurrentPage("detail");
  }

  function handleBackToList() {
    setSelectedProjectId(null);
    setCurrentPage("projects");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <nav
        style={{
          display: "flex",
          gap: "0",
          background: "#16162a",
          borderBottom: "1px solid #2d2d44",
        }}
      >
        <button
          style={tabStyle(currentPage === "projects" || currentPage === "detail")}
          onClick={() => setCurrentPage(selectedProjectId ? "detail" : "projects")}
        >
          Projects
        </button>
        <button
          style={tabStyle(currentPage === "settings")}
          onClick={() => setCurrentPage("settings")}
        >
          Settings
        </button>
      </nav>

      <main style={{ flex: 1, overflow: "auto", padding: "20px" }}>
        {currentPage === "projects" && (
          <ProjectList onSelect={handleSelectProject} />
        )}
        {currentPage === "detail" && selectedProjectId && (
          <ProjectDetail
            projectId={selectedProjectId}
            onBack={handleBackToList}
          />
        )}
        {currentPage === "settings" && <Settings />}
      </main>

      <StatusBar />
    </div>
  );
}
