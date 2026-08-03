import type React from "react";
import { useEffect, useRef, useState } from "react";

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
      },
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

    const installResult = await (window as any).electronAPI.installDependencies(
      cloneResult.projectPath,
    );
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
      cloneResult.projectPath,
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
    const result = await (window as any).electronAPI.createProject(projectName.trim(), pendingPath);
    if (result) {
      onProjectCreated();
    } else {
      setError("Failed to create project.");
      setBusy(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    background: active ? "var(--surface-hover)" : "transparent",
    color: active ? "var(--foreground)" : "var(--foreground-muted)",
    border: "none",
    borderRadius: "var(--radius) var(--radius) 0 0",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    transition: "color 150ms, background 150ms",
  });

  const disabledPrimary = !githubUrl.trim() || busy;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--glass-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fade-in 0.15s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "480px",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "24px",
          animation: "fade-in-up 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
            Add Project
          </h3>
          {!busy && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--foreground-muted)",
                cursor: "pointer",
                fontSize: "18px",
                transition: "color 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--foreground-muted)";
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button style={tabStyle(tab === "github")} onClick={() => !busy && setTab("github")}>
            From GitHub URL
          </button>
          <button style={tabStyle(tab === "folder")} onClick={() => !busy && setTab("folder")}>
            From Local Folder
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "hsla(0, 84%, 60%, 0.1)",
              border: "1px solid var(--status-error)",
              borderRadius: "var(--radius)",
              color: "var(--status-error)",
              fontSize: "13px",
              marginBottom: "12px",
            }}
          >
            {error}
          </div>
        )}

        {/* GitHub tab */}
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
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--foreground)",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
            />

            {phase && (
              <div style={{ marginBottom: "12px" }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
                >
                  <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                    {statusMessage}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "var(--surface)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress}%`,
                      background:
                        phase === "ready"
                          ? "var(--status-success)"
                          : phase === "error"
                            ? "var(--status-error)"
                            : "var(--primary)",
                      borderRadius: "3px",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleGithubSubmit}
              disabled={disabledPrimary}
              style={{
                width: "100%",
                padding: "10px",
                background: disabledPrimary
                  ? "var(--surface-hover)"
                  : "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)",
                color: "var(--primary-foreground)",
                border: "none",
                borderRadius: "var(--radius)",
                cursor: disabledPrimary ? "default" : "pointer",
                fontSize: "14px",
                fontWeight: 600,
                opacity: disabledPrimary ? 0.5 : 1,
                transition: "opacity 150ms, transform 150ms",
              }}
            >
              {busy ? "Working..." : "Clone & Setup"}
            </button>
          </div>
        )}

        {/* Folder tab */}
        {tab === "folder" && (
          <div>
            {!pendingPath ? (
              <button
                onClick={handleSelectFolder}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "24px",
                  background: "var(--surface)",
                  border: "2px dashed var(--border)",
                  borderRadius: "8px",
                  color: "var(--foreground-muted)",
                  cursor: busy ? "default" : "pointer",
                  fontSize: "14px",
                  transition: "border-color 150ms, color 150ms",
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.borderColor = "var(--border-bright)";
                    e.currentTarget.style.color = "var(--foreground)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--foreground-muted)";
                }}
              >
                Click to select a project folder
              </button>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--foreground-muted)",
                    marginBottom: "8px",
                  }}
                >
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
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--foreground)",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleFolderCreate}
                    disabled={!projectName.trim() || busy}
                    style={{
                      padding: "8px 16px",
                      background:
                        projectName.trim() && !busy
                          ? "linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)"
                          : "var(--surface-hover)",
                      color: "var(--primary-foreground)",
                      border: "none",
                      borderRadius: "var(--radius)",
                      cursor: projectName.trim() && !busy ? "pointer" : "default",
                      fontSize: "13px",
                      fontWeight: 600,
                      opacity: projectName.trim() && !busy ? 1 : 0.5,
                    }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setPendingPath(null);
                      setProjectName("");
                    }}
                    disabled={busy}
                    style={{
                      padding: "8px 16px",
                      background: "var(--surface-elevated)",
                      color: "var(--foreground-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      cursor: busy ? "default" : "pointer",
                      fontSize: "13px",
                      transition: "color 150ms, background 150ms",
                    }}
                    onMouseEnter={(e) => {
                      if (!busy) {
                        e.currentTarget.style.background = "var(--surface-hover)";
                        e.currentTarget.style.color = "var(--foreground)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--surface-elevated)";
                      e.currentTarget.style.color = "var(--foreground-muted)";
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
