import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import type { Action } from "../shared/types";
import type { GetStateResponse } from "../shared/messages";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { type Project } from "./components/ProjectSelector";
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

      <Controls
        activeTabId={activeTabId}
        selectorIsActive={selectorIsActive}
        actions={actions}
        pageUrl={pageUrl}
        pageTitle={pageTitle}
        projectId={projectId}
        onProjectChange={setProjectId}
        onProjectsLoaded={handleProjectsLoaded}
        onToggle={handleToggle}
        onClear={handleClear}
        onRefreshState={refreshState}
      />

      <PopupActionList
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

// --- Action list for popup (matches toolbar style) ---

const ACTION_COLORS: Record<string, string> = {
  select: "#3b82f6", insert: "#22c55e", editText: "#a855f7",
  delete: "#ef4444", duplicate: "#f59e0b", move: "#06b6d4",
  wrap: "#8b5cf6", resize: "#ec4899", styleChange: "#f97316",
  replaceImage: "#14b8a6", generateSection: "#6366f1", copyStyle: "#84cc16",
};

function PopupActionList({
  actions,
  onRemove,
  onUpdateInstruction,
}: {
  actions: Action[];
  onRemove: (i: number) => void;
  onUpdateInstruction: (i: number, instruction: string) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="popup-action-list">
      {actions.map((action, i) => (
        <PopupActionItem
          key={i}
          action={action}
          index={i}
          onRemove={onRemove}
          onUpdateInstruction={onUpdateInstruction}
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
}: {
  action: Action;
  index: number;
  onRemove: (i: number) => void;
  onUpdateInstruction: (i: number, instruction: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const selector = action.selector.length > 22
    ? action.selector.slice(0, 19) + "..."
    : action.selector;
  const instruction = "instruction" in action ? (action as any).instruction : "";
  const prompt = "prompt" in action ? (action as any).prompt : "";
  const fullPrompt = instruction || prompt;
  const screenshot = "screenshot" in action ? (action as any).screenshot : "";
  const screenshotBefore = "screenshotBefore" in action ? (action as any).screenshotBefore : "";
  const screenshotAfter = "screenshotAfter" in action ? (action as any).screenshotAfter : "";
  const color = ACTION_COLORS[action.type] ?? "#888";
  const num = index + 1;
  const shortInstr = fullPrompt.length > 18 ? fullPrompt.slice(0, 15) + "..." : fullPrompt;

  const startEditing = useCallback(() => {
    setEditing(true);
    setExpanded(false);
  }, []);

  const saveEdit = useCallback(() => {
    const text = editorViewRef.current?.state.doc.toString() ?? "";
    onUpdateInstruction(index, text);
    setEditing(false);
  }, [index, onUpdateInstruction]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  // Mount CodeMirror when editing starts
  useEffect(() => {
    if (!editing || !editorContainerRef.current) return;

    const saveRef = { current: saveEdit };
    const cancelRef = { current: cancelEdit };

    const view = new EditorView({
      state: EditorState.create({
        doc: fullPrompt,
        extensions: [
          keymap.of([
            { key: "Mod-Enter", run: () => { saveRef.current(); return true; } },
            { key: "Escape", run: () => { cancelRef.current(); return true; } },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              fontSize: "11px",
              fontFamily: "monospace",
              border: "1px solid #3d3d5c",
              borderRadius: "4px",
              minHeight: "80px",
              maxHeight: "160px",
              overflow: "auto",
              background: "#1a1a2e",
            },
            "&.cm-focused": {
              outline: "none",
              borderColor: "#4F46E5",
              boxShadow: "0 0 0 2px rgba(79,70,229,0.2)",
            },
            ".cm-content": {
              padding: "6px 8px",
              color: "#cdd6f4",
              caretColor: "#cdd6f4",
            },
            ".cm-cursor": { borderLeftColor: "#cdd6f4" },
            ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
            ".cm-selectionBackground": { backgroundColor: "rgba(79,70,229,0.3) !important" },
            ".cm-gutters": { display: "none" },
          }),
        ],
      }),
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="popup-action-item-wrapper">
      <div
        className={`popup-action-item ${expanded ? "popup-action-item-expanded" : ""}`}
        onClick={() => { if (!editing) setExpanded((v) => !v); }}
      >
        <span className="popup-action-num">{num}</span>
        <span className="popup-action-badge" style={{ backgroundColor: color }}>
          {action.type}
        </span>
        <span className="popup-action-sel" title={action.selector}>{selector}</span>
        {shortInstr && !editing && (
          <span className="popup-action-instr" title={fullPrompt}>
            {shortInstr}
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
      {expanded && !editing && (
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

          {fullPrompt && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Prompt</span>
              <div className="popup-detail-value" style={{ whiteSpace: "pre-wrap" }}>{fullPrompt}</div>
            </div>
          )}

          <button className="popup-action-edit-btn" onClick={startEditing}>Edit Prompt</button>

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

      {/* Editing panel with CodeMirror */}
      {editing && (
        <div className="popup-action-edit-panel">
          <div className="popup-action-edit-label">Prompt (Markdown) — Cmd+Enter to save, Esc to cancel</div>
          <div ref={editorContainerRef} />
          <div className="popup-action-edit-actions">
            <button className="popup-action-edit-btn" onClick={cancelEdit}>Cancel</button>
            <button className="popup-action-edit-btn popup-action-save-btn" onClick={saveEdit}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
