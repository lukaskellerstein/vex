import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AGENT_MANAGER_URL } from "../../shared/messages";
import type { Action, SelectAction } from "../../shared/types";
import type { Project } from "./ProjectSelector";

/** Normalize actions for the backend API.
 *  SelectAction uses `screenshot` but the backend expects `screenshotBefore`.
 *  Also maps element metadata fields to backend-expected snake_case names. */
function normalizeActions(actions: Action[]) {
  return actions.map((action) => {
    if (action.type === "select") {
      const { screenshot, ...rest } = action as SelectAction;
      return { ...rest, screenshotBefore: screenshot, screenshotAfter: null };
    }
    return action;
  });
}

interface ControlsProps {
  activeTabId: number | null;
  selectorIsActive: boolean;
  actions: Action[];
  pageUrl: string;
  pageTitle: string;
  projectId: string | null;
  onProjectChange: (projectId: string) => void;
  onProjectsLoaded?: (projects: Project[]) => void;
  onToggle: () => void;
  onClear: () => void;
  onRefreshState: () => Promise<void>;
}

export function Controls({
  activeTabId,
  selectorIsActive,
  actions,
  pageUrl,
  pageTitle,
  projectId,
  onProjectChange,
  onProjectsLoaded,
  onToggle,
  onClear,
  onRefreshState,
}: ControlsProps) {
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [editingProject, setEditingProject] = useState(false);

  // Fetch projects
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(AGENT_MANAGER_URL + "/api/projects", {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as Project[];
        setProjects(data);
        onProjectsLoaded?.(data);
      } catch {
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    if (actions.length === 0 || !projectId) return;

    setSendState("sending");
    setUploadProgress(0);
    setError(null);

    await onRefreshState();

    const batch = {
      batch: {
        pageUrl,
        pageTitle,
        actions: normalizeActions(actions),
        timestamp: new Date().toISOString(),
      },
    };

    const url = AGENT_MANAGER_URL + "/api/projects/" + projectId + "/batches";
    const body = JSON.stringify(batch);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error("Server returned " + xhr.status));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        xhr.timeout = 30000;

        xhr.send(body);
      });

      setUploadProgress(100);
      setSendState("sent");

      // Clear actions first (unmounts edit modes, reverting unsaved tweaks),
      // then revert committed visual changes. No page reload — the content
      // script must stay alive so agent cursors can appear once the batch runs.
      await onClear();
      if (activeTabId) {
        await new Promise<void>((resolve) => {
          chrome.tabs.sendMessage(activeTabId, { action: "resetVisualChanges" }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        });
      }

      // Close the popup after a brief delay so the user sees "Sent ✓"
      setTimeout(() => window.close(), 600);
    } catch {
      setSendState("idle");
      setUploadProgress(0);
      setError("Agent Manager not reachable. Is the server running?");
      setTimeout(() => setError(null), 4000);
    }
  }, [actions, pageUrl, pageTitle, projectId, activeTabId, onRefreshState, onClear]);

  const sendTitle =
    sendState === "sending"
      ? "Sending... " + uploadProgress + "%"
      : sendState === "sent"
        ? "Sent!"
        : "Send";

  const sendBtnClass =
    sendState === "sending"
      ? "ctrl-btn send sending"
      : sendState === "sent"
        ? "ctrl-btn send sent"
        : "ctrl-btn send";

  return (
    <>
      <div className="controls-bar">
        <button
          className={`ctrl-btn toggle${selectorIsActive ? " active" : ""}`}
          onClick={onToggle}
          title={selectorIsActive ? "Pause selector" : "Activate selector"}
        >
          {selectorIsActive ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
              <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5" />
              <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
              <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" />
              <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
          <span>{selectorIsActive ? "Pause" : "Activate"}</span>
        </button>

        <button
          className="ctrl-btn clear"
          onClick={onClear}
          title="Clear all"
          disabled={actions.length === 0}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.5 2V1.5C5.5 1.22 5.72 1 6 1H10C10.28 1 10.5 1.22 10.5 1.5V2M2.5 3H13.5M4 3V13.5C4 14.05 4.45 14.5 5 14.5H11C11.55 14.5 12 14.05 12 13.5V3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span>Clear</span>
        </button>
      </div>

      {/* Send row: project name (or dropdown) + send button */}
      <div className="send-bar">
        {projectId && !editingProject ? (
          <>
            <span className="send-bar-project-name">
              {projects.find((p) => p.id === projectId)?.name ?? "Unknown"}
            </span>
            <button
              className="send-bar-edit-btn"
              onClick={() => setEditingProject(true)}
              title="Change project"
            >
              <Pencil size={12} />
            </button>
          </>
        ) : (
          <>
            <span className="send-bar-label">Send to</span>
            <select
              className="send-bar-select"
              value={projectId ?? ""}
              onChange={(e) => {
                onProjectChange(e.target.value);
                setEditingProject(false);
              }}
              disabled={projectsLoading}
            >
              <option value="" disabled>
                {projectsLoading
                  ? "Loading..."
                  : projects.length === 0
                    ? "No projects"
                    : "Select project..."}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          className={sendBtnClass}
          disabled={actions.length === 0 || !projectId || sendState !== "idle"}
          onClick={handleSend}
          title={!projectId ? "Select a project first" : sendTitle}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2L14 8L2 14V9.5L10 8L2 6.5V2Z" fill="currentColor" />
          </svg>
          <span>{sendTitle}</span>
        </button>
      </div>

      {sendState === "sending" && (
        <div className="upload-progress-bar" title={sendTitle}>
          <div className="upload-progress-fill" style={{ width: uploadProgress + "%" }} />
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
    </>
  );
}
