import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "../shared/types";
import type { GetStateResponse } from "../shared/messages";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ProjectSelector, type Project } from "./components/ProjectSelector";
import { ActionList } from "./components/ActionList";
import { Controls } from "./components/Controls";
import "./styles/popup.css";

function sendToContent(
  tabId: number | null,
  message: Record<string, unknown>,
): Promise<unknown> {
  if (!tabId) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response);
    });
  });
}

export function App() {
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [pageUrl, setPageUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [selectorIsActive, setSelectorIsActive] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tabUrl, setTabUrl] = useState<string>("");
  const autoMatchedRef = useRef(false);

  const handleProjectsLoaded = useCallback(
    (projects: Project[]) => {
      if (autoMatchedRef.current || !tabUrl || projects.length === 0) return;
      autoMatchedRef.current = true;

      const matches = projects.filter((p) => {
        if (!p.devServerUrl) return false;
        try {
          const projectOrigin = new URL(p.devServerUrl).origin;
          const tabOrigin = new URL(tabUrl).origin;
          return tabOrigin === projectOrigin;
        } catch {
          return false;
        }
      });

      // Also match localhost:{port} patterns
      if (matches.length === 0) {
        try {
          const tabParsed = new URL(tabUrl);
          if (tabParsed.hostname === "localhost" && tabParsed.port) {
            const portMatches = projects.filter((p) => {
              if (!p.devServerUrl) return false;
              try {
                const pUrl = new URL(p.devServerUrl);
                return pUrl.hostname === "localhost" && pUrl.port === tabParsed.port;
              } catch {
                return false;
              }
            });
            if (portMatches.length === 1) {
              setProjectId(portMatches[0].id);
              return;
            }
          }
        } catch {
          // invalid tab URL
        }
      }

      if (matches.length === 1) {
        setProjectId(matches[0].id);
      }
      // If multiple matches or no match, leave as "Select a project"
    },
    [tabUrl],
  );

  const refreshState = useCallback(async () => {
    const response = (await sendToContent(activeTabId, {
      action: "getState",
    })) as GetStateResponse | null;

    if (!response) {
      setActions([]);
      setSelectorIsActive(false);
      return;
    }

    setActions(response.actions || []);
    setPageUrl(response.pageUrl || "");
    setPageTitle(response.pageTitle || "");
    setSelectorIsActive(response.isActive || false);
  }, [activeTabId]);

  const handleToggle = useCallback(async () => {
    const response = (await sendToContent(activeTabId, {
      action: "toggleActive",
      active: !selectorIsActive,
    })) as { isActive: boolean } | null;
    if (response) {
      setSelectorIsActive(response.isActive);
    }
  }, [activeTabId, selectorIsActive]);

  const handleClear = useCallback(async () => {
    await sendToContent(activeTabId, { action: "clearActions" });
    setActions([]);
    setSelectorIsActive(false);
  }, [activeTabId]);

  const handleRemove = useCallback(async (index: number) => {
    await sendToContent(activeTabId, { action: "removeAction", index });
    await refreshState();
  }, [activeTabId, refreshState]);

  const handleUpdateInstruction = useCallback(async (index: number, instruction: string) => {
    await sendToContent(activeTabId, { action: "updateInstruction", index, instruction });
    await refreshState();
  }, [activeTabId, refreshState]);

  useEffect(() => {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        setActiveTabId(tab.id);
      }
      if (tab?.url) {
        setTabUrl(tab.url);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTabId) {
      refreshState();
    }
  }, [activeTabId, refreshState]);

  return (
    <div className="popup">
      <header className="header">
        <span className="header-title">VEX</span>
        <ConnectionStatus />
      </header>

      <ProjectSelector
        selectedProjectId={projectId}
        onProjectChange={setProjectId}
        onProjectsLoaded={handleProjectsLoaded}
      />

      <Controls
        activeTabId={activeTabId}
        selectorIsActive={selectorIsActive}
        actions={actions}
        pageUrl={pageUrl}
        pageTitle={pageTitle}
        projectId={projectId}
        onToggle={handleToggle}
        onClear={handleClear}
        onRefreshState={refreshState}
      />

      <ActionList
        actions={actions}
        onRemove={handleRemove}
        onUpdateInstruction={handleUpdateInstruction}
      />

      <footer className="footer">
        <span
          className="footer-tabid"
          title="Click to copy"
          onClick={() => {
            if (activeTabId) {
              navigator.clipboard.writeText(String(activeTabId));
            }
          }}
        >
          Tab {activeTabId ?? "\u2014"}
        </span>
      </footer>
    </div>
  );
}
