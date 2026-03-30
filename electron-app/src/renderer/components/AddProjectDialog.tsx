import React, { useEffect, useRef, useState } from "react";

type Tab = "github" | "folder";

interface Props {
  onClose: () => void;
  onProjectCreated: () => void;
}

export function AddProjectDialog({ onClose, onProjectCreated }: Props) {
  const [tab, setTab] = useState<Tab>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Local folder state
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current = (window as any).electronAPI.onCloneProgress(
      (data: { phase: string; progress: number; message: string }) => {
        setPhase(data.phase);
        setProgress(data.progress);
        setStatusMessage(data.message);
      }
    );
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  async function handleGithubSubmit() {
    if (!githubUrl.trim() || busy) return;
    setBusy(true);
    setError(null);
    setPhase("cloning");
    setProgress(0);
    setStatusMessage("Starting clone...");

    const cloneResult = await (window as any).electronAPI.cloneGithubRepo(githubUrl.trim());
    if (!cloneResult.success) {
      setError(cloneResult.error);
      setPhase(null);
      setBusy(false);
      return;
    }

    setPhase("installing");
    setProgress(0);
    setStatusMessage("Installing dependencies...");

    const installResult = await (window as any).electronAPI.installDependencies(cloneResult.projectPath);
    if (!installResult.success) {
      setError(installResult.error);
      setPhase(null);
      setBusy(false);
      return;
    }

    setPhase("detecting");
    setStatusMessage("Detecting framework...");

    const project = await (window as any).electronAPI.createProject(
      cloneResult.repoName,
      cloneResult.projectPath
    );

    if (project) {
      setPhase("ready");
      setStatusMessage("Project ready!");
      setProgress(100);
      setTimeout(() => {
        onProjectCreated();
      }, 500);
    } else {
      setError("Failed to register project.");
      setPhase(null);
      setBusy(false);
    }
  }

  async function handleSelectFolder() {
    const folderPath = await (window as any).electronAPI.selectFolder();
    if (folderPath) {
      setPendingPath(folderPath);
      const parts = folderPath.split("/");
      setProjectName(parts[parts.length - 1] || "");
    }
  }

  async function handleFolderCreate() {
    if (!pendingPath || !projectName.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await (window as any).electronAPI.createProject(
      projectName.trim(),
      pendingPath
    );
    if (result) {
      onProjectCreated();
    } else {
      setError("Failed to create project.");
      setBusy(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    background: active ? "#3d3d5c" : "transparent",
    color: active ? "#e0e0f0" : "#888",
    border: "none",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={{
          background: "#2d2d44",
          borderRadius: "12px",
          width: "480px",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Add Project</h3>
          {!busy && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "18px" }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "1px solid #3d3d5c" }}>
          <button style={tabStyle(tab === "github")} onClick={() => !busy && setTab("github")}>
            From GitHub URL
          </button>
          <button style={tabStyle(tab === "folder")} onClick={() => !busy && setTab("folder")}>
            From Local Folder
          </button>
        </div>

        {error && (
          <div style={{
            padding: "10px 14px",
            background: "#3d1c1c",
            border: "1px solid #f44336",
            borderRadius: "6px",
            color: "#f44336",
            fontSize: "13px",
            marginBottom: "12px",
          }}>
            {error}
          </div>
        )}

        {tab === "github" && (
          <div>
            <input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGithubSubmit()}
              placeholder="https://github.com/owner/repo"
              disabled={busy}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#1a1a2e",
                border: "1px solid #3d3d5c",
                borderRadius: "6px",
                color: "#e0e0f0",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
            />

            {phase && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#a0a0b8" }}>{statusMessage}</span>
                  <span style={{ fontSize: "12px", color: "#a0a0b8" }}>{progress}%</span>
                </div>
                <div style={{
                  height: "6px",
                  background: "#1a1a2e",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: phase === "ready" ? "#4caf50" : phase === "error" ? "#f44336" : "#6c63ff",
                    borderRadius: "3px",
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>
            )}

            <button
              onClick={handleGithubSubmit}
              disabled={!githubUrl.trim() || busy}
              style={{
                width: "100%",
                padding: "10px",
                background: !githubUrl.trim() || busy ? "#3d3d5c" : "#6c63ff",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: !githubUrl.trim() || busy ? "default" : "pointer",
                fontSize: "14px",
                opacity: !githubUrl.trim() || busy ? 0.5 : 1,
              }}
            >
              {busy ? "Working..." : "Clone & Setup"}
            </button>
          </div>
        )}

        {tab === "folder" && (
          <div>
            {!pendingPath ? (
              <button
                onClick={handleSelectFolder}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "24px",
                  background: "#1a1a2e",
                  border: "2px dashed #3d3d5c",
                  borderRadius: "8px",
                  color: "#a0a0b8",
                  cursor: busy ? "default" : "pointer",
                  fontSize: "14px",
                }}
              >
                Click to select a project folder
              </button>
            ) : (
              <div>
                <div style={{ fontSize: "12px", color: "#a0a0b8", marginBottom: "8px" }}>
                  {pendingPath}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFolderCreate()}
                    placeholder="Project name"
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "#1a1a2e",
                      border: "1px solid #3d3d5c",
                      borderRadius: "6px",
                      color: "#e0e0f0",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleFolderCreate}
                    disabled={!projectName.trim() || busy}
                    style={{
                      padding: "8px 16px",
                      background: projectName.trim() && !busy ? "#4caf50" : "#3d3d5c",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: projectName.trim() && !busy ? "pointer" : "default",
                      fontSize: "13px",
                    }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setPendingPath(null); setProjectName(""); }}
                    disabled={busy}
                    style={{
                      padding: "8px 16px",
                      background: "#3d3d5c",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: busy ? "default" : "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
