import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "../shared/types";
import type { GetStateResponse } from "../shared/messages";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { type Project } from "./components/ProjectSelector";
import { Controls } from "./components/Controls";
import { BatchSelector } from "./components/BatchSelector";
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

const PERSISTENT_SCRIPT_ID = "vex-content";
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

/** Register the content script for localhost origins so it survives page
 *  reloads (e.g. dev-server HMR) and agent cursors can appear mid-batch. */
async function ensurePersistentInjection(tabUrl: string): Promise<void> {
  try {
    const { hostname } = new URL(tabUrl);
    if (!LOCAL_HOSTNAMES.includes(hostname)) return;

    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [PERSISTENT_SCRIPT_ID],
    });
    if (existing.length > 0) return;

    await chrome.scripting.registerContentScripts([
      {
        id: PERSISTENT_SCRIPT_ID,
        js: ["src/content/index.js"],
        matches: LOCAL_HOSTNAMES.flatMap((host) => [
          `http://${host}/*`,
          `https://${host}/*`,
        ]),
        runAt: "document_idle",
        persistAcrossSessions: false,
      },
    ]);
  } catch {
    // Best effort — per-tab injection below still works without it.
  }
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  const pong = await sendToContent(tabId, { action: "ping" });
  if (pong) return true;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/index.js"],
    });
    await new Promise((r) => setTimeout(r, 300));
    const verify = await sendToContent(tabId, { action: "ping" });
    return !!verify;
  } catch {
    return false;
  }
}

export function App() {
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [pageUrl, setPageUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [selectorIsActive, setSelectorIsActive] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tabUrl, setTabUrl] = useState<string>("");
  const [loadedProjects, setLoadedProjects] = useState<Project[]>([]);
  const autoMatchedRef = useRef(false);

  // Auto-match project when both tabUrl and projects are available
  useEffect(() => {
    if (autoMatchedRef.current || !tabUrl || loadedProjects.length === 0) return;
    autoMatchedRef.current = true;

    const matches = loadedProjects.filter((p) => {
      if (!p.dev_server_url) return false;
      try {
        return new URL(p.dev_server_url).origin === new URL(tabUrl).origin;
      } catch {
        return false;
      }
    });

    if (matches.length === 1) {
      setProjectId(matches[0].id);
      return;
    }

    // Fallback: match localhost:{port}
    if (matches.length === 0) {
      try {
        const tabParsed = new URL(tabUrl);
        if (tabParsed.hostname === "localhost" && tabParsed.port) {
          const portMatches = loadedProjects.filter((p) => {
            if (!p.dev_server_url) return false;
            try {
              return new URL(p.dev_server_url).hostname === "localhost" &&
                new URL(p.dev_server_url).port === tabParsed.port;
            } catch {
              return false;
            }
          });
          if (portMatches.length === 1) {
            setProjectId(portMatches[0].id);
          }
        }
      } catch {
        // invalid tab URL
      }
    }
  }, [tabUrl, loadedProjects]);

  const refreshState = useCallback(async () => {
    if (!activeTabId) return;
    await ensureContentScript(activeTabId);

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
    if (!activeTabId) return;
    await ensureContentScript(activeTabId);

    const willActivate = !selectorIsActive;
    const response = (await sendToContent(activeTabId, {
      action: "toggleActive",
      active: willActivate,
    })) as { isActive: boolean } | null;
    if (response) {
      setSelectorIsActive(response.isActive);
      if (response.isActive) {
        await ensurePersistentInjection(tabUrl);
        window.close();
      }
    }
  }, [activeTabId, selectorIsActive, tabUrl]);

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

      <Controls
        activeTabId={activeTabId}
        selectorIsActive={selectorIsActive}
        actions={actions}
        pageUrl={pageUrl}
        pageTitle={pageTitle}
        projectId={projectId}
        onProjectChange={setProjectId}
        onProjectsLoaded={setLoadedProjects}
        onToggle={handleToggle}
        onClear={handleClear}
        onRefreshState={refreshState}
      />

      <BatchSelector tabUrl={tabUrl} activeTabId={activeTabId} />

      <PopupActionList
        actions={actions}
        activeTabId={activeTabId}
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

      <ResizeHandle />
    </div>
  );
}

// --- Resize handle for popup ---

function ResizeHandle() {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.screenX;
    const startY = e.screenY;
    const startW = document.body.offsetWidth;
    const startH = document.body.offsetHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.min(800, Math.max(380, startW - (ev.screenX - startX)));
      const newH = Math.min(600, Math.max(200, startH + (ev.screenY - startY)));
      document.body.style.width = newW + "px";
      document.body.style.height = newH + "px";
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return <div className="resize-handle" onMouseDown={handleMouseDown} />;
}

// --- Action list for popup (matches toolbar style) ---

import {
  MousePointer, Type as TypeIcon, Palette, Move as MoveIcon, Copy,
  Trash2, LayoutGrid, Image as ImageIcon, Maximize2, Scissors, PaintBucket,
} from "lucide-react";

// Aligned with chrome-extension/src/popup/components/ActionList.tsx and electron-app BatchCard.tsx
const ACTION_COLORS: Record<string, string> = {
  select: "#3b82f6", insert: "#22c55e", editText: "#eab308",
  delete: "#ef4444", duplicate: "#06b6d4", move: "#8b5cf6",
  wrap: "#64748b", resize: "#a855f7", styleChange: "#f97316",
  replaceImage: "#ec4899", generateSection: "#14b8a6", copyStyle: "#6366f1",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  select: MousePointer, insert: LayoutGrid, editText: TypeIcon,
  delete: Trash2, duplicate: Copy, move: MoveIcon,
  wrap: Scissors, resize: Maximize2, styleChange: Palette,
  replaceImage: ImageIcon, generateSection: LayoutGrid, copyStyle: PaintBucket,
};

function PopupActionList({
  actions,
  activeTabId,
  onRemove,
  onUpdateInstruction,
}: {
  actions: Action[];
  activeTabId: number | null;
  onRemove: (i: number) => void;
  onUpdateInstruction: (index: number, instruction: string) => Promise<void>;
}) {
  if (actions.length === 0) return null;

  const highlightAction = (index: number | null) => {
    if (!activeTabId) return;
    sendToContent(activeTabId, { action: "highlightAction", index });
  };

  return (
    <div className="popup-action-list">
      {actions.map((action, i) => (
        <PopupActionItem
          key={i}
          action={action}
          index={i}
          onRemove={onRemove}
          onUpdateInstruction={onUpdateInstruction}
          onMouseEnter={() => highlightAction(i)}
          onMouseLeave={() => highlightAction(null)}
        />
      ))}
    </div>
  );
}

function PopupActionItem({
  action,
  index,
  onRemove,
  onUpdateInstruction,
  onMouseEnter,
  onMouseLeave,
}: {
  action: Action;
  index: number;
  onRemove: (i: number) => void;
  onUpdateInstruction: (index: number, instruction: string) => Promise<void>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editValue, setEditValue] = useState("");
  const instruction = "instruction" in action ? (action as any).instruction : "";
  const prompt = "prompt" in action ? (action as any).prompt : "";
  const fullPrompt = instruction || prompt;
  const screenshot = "screenshot" in action ? (action as any).screenshot : "";
  const screenshotBefore = "screenshotBefore" in action ? (action as any).screenshotBefore : "";
  const screenshotAfter = "screenshotAfter" in action ? (action as any).screenshotAfter : "";
  const color = ACTION_COLORS[action.type] ?? "#888";
  const num = index + 1;

  return (
    <div className="popup-action-item-wrapper" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div
        className={`popup-action-item ${expanded ? "popup-action-item-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="popup-action-num">{num}</span>
        <span className="popup-action-badge" style={{ backgroundColor: color }}>
          {(() => { const I = ACTION_ICONS[action.type]; return I ? <I size={10} /> : null; })()}
          {action.type}
        </span>
        <span className="popup-action-sel" title={action.selector}>{action.selector}</span>
        {fullPrompt && (
          <span className="popup-action-instr" title={fullPrompt}>
            {fullPrompt}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="popup-action-rm" onClick={(e) => { e.stopPropagation(); onRemove(index); }} title="Remove">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Inline expanded detail */}
      {expanded && (
        <div className="popup-action-detail">
          <div className="popup-detail-row">
            <span className="popup-detail-label">Selector</span>
            <span className="popup-detail-value">{action.selector}</span>
          </div>

          {screenshot && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Screenshot</span>
              <img
                className="popup-detail-screenshot"
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Screenshot"
                onClick={() => chrome.runtime.sendMessage({ action: "openScreenshot", base64: screenshot })}
                title="Click to open full size"
              />
            </div>
          )}

          {screenshotBefore && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Before</span>
              <img
                className="popup-detail-screenshot"
                src={`data:image/jpeg;base64,${screenshotBefore}`}
                alt="Before"
                onClick={() => chrome.runtime.sendMessage({ action: "openScreenshot", base64: screenshotBefore })}
                title="Click to open full size"
              />
            </div>
          )}

          {screenshotAfter && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">After</span>
              <img
                className="popup-detail-screenshot"
                src={`data:image/jpeg;base64,${screenshotAfter}`}
                alt="After"
                onClick={() => chrome.runtime.sendMessage({ action: "openScreenshot", base64: screenshotAfter })}
                title="Click to open full size"
              />
            </div>
          )}

          <div className="popup-detail-row">
            <span className="popup-detail-label">Prompt</span>
            {editingPrompt ? (
              <div className="popup-detail-prompt-edit">
                <textarea
                  className="popup-detail-prompt-textarea"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingPrompt(false);
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onUpdateInstruction(index, editValue).then(() => setEditingPrompt(false));
                    }
                  }}
                  autoFocus
                  rows={3}
                />
                <div className="popup-detail-prompt-btns">
                  <button
                    className="popup-detail-prompt-save"
                    onClick={() => onUpdateInstruction(index, editValue).then(() => setEditingPrompt(false))}
                  >Save</button>
                  <button
                    className="popup-detail-prompt-cancel"
                    onClick={() => setEditingPrompt(false)}
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className="popup-detail-value popup-detail-prompt-clickable"
                style={{ whiteSpace: "pre-wrap", cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); setEditValue(fullPrompt); setEditingPrompt(true); }}
                title="Click to edit"
              >
                {fullPrompt || <span style={{ opacity: 0.5, fontStyle: "italic" }}>Click to add prompt…</span>}
              </div>
            )}
          </div>

          {"before" in action && "after" in action && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Text change</span>
              <div className="popup-detail-value">
                <span style={{ textDecoration: "line-through", color: "#f38ba8" }}>{(action as any).before}</span>
                {" → "}
                <span style={{ color: "#a6e3a1" }}>{(action as any).after}</span>
              </div>
            </div>
          )}

          {"changes" in action && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Changes</span>
              <pre className="popup-detail-pre">{JSON.stringify((action as any).changes, null, 2)}</pre>
            </div>
          )}
          {"deltas" in action && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Deltas</span>
              <pre className="popup-detail-pre">{JSON.stringify((action as any).deltas, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
