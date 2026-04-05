import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, InteractionMode, Selection } from "../shared/types";
import { useSelectionState } from "./hooks/useSelectionState";
import { useActions } from "./hooks/useActions";
import { useHoverHighlight } from "./hooks/useHoverHighlight";
import { useNatsClient } from "./hooks/useNatsClient";
import { captureScreenshot } from "./hooks/useScreenshot";
import { collectMetadata } from "./utils/metadata";
import { Overlay, ActionMarkers } from "./components/Overlay";
import { PopupDialog } from "./components/PopupDialog";
import { Toolbar } from "./components/Toolbar";
import { EditMode } from "./components/EditMode";
import { ResizeMode } from "./components/ResizeMode";
import { StylePanel } from "./components/StylePanel";
import { AgentCursors } from "./components/AgentCursors";

const HOST_ID = "__web-selector-root";


interface PopupState {
  element: Element;
  metadata: Selection;
}

interface AppProps {
  hostElement: HTMLElement;
  shadowRoot: ShadowRoot;
}

export function App({ hostElement, shadowRoot }: AppProps) {
  const {
    state,
    selections,
    selectionsRef,
    toggle,
    enterSelected,
    exitSelected,
    addSelection,
    removeSelectionAt,
    clearSelections,
    deactivate,
  } = useSelectionState();

  const {
    actions,
    mode,
    actionsRef,
    addAction,
    removeAction,
    updateInstruction: updateActionInstruction,
    clearActions,
    setMode,
  } = useActions();

  const { hover, isOwnElement } = useHoverHighlight(state, HOST_ID);

  // NATS connects only when needed: user activates the extension OR
  // AgentCursors discovers active agents via AO polling.
  const [natsEnabled, setNatsEnabled] = useState(false);
  useEffect(() => {
    if (state !== "inactive") setNatsEnabled(true);
  }, [state]);

  const enableNats = useCallback(() => setNatsEnabled(true), []);
  const natsClient = useNatsClient(natsEnabled);

  const popupRef = useRef<PopupState | null>(null);
  const popupResolveRef = useRef<((instruction: string) => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [highlightedActionIndex, setHighlightedActionIndex] = useState<number | null>(null);


  // Send handler
  const handleSend = useCallback(() => {
    chrome.runtime.sendMessage({
      action: "sendActions",
      actions: actionsRef.current,
      pageUrl: location.href,
      pageTitle: document.title,
    });
  }, [actionsRef]);

  // Watch for selected element removal from DOM
  useEffect(() => {
    if (state !== "selected" || !popupRef.current) return;

    const observer = new MutationObserver(() => {
      if (!popupRef.current) return;
      if (!document.body.contains(popupRef.current.element)) {
        popupResolveRef.current?.("");
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [state]);

  // Click handler
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      if (stateRef.current !== "idle") return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnElement(el)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      // Check if already selected -> deselect
      const existingIndex = selectionsRef.current.findIndex((s) => {
        try {
          const found = document.querySelector(s.selector);
          return found === el;
        } catch {
          return false;
        }
      });

      if (existingIndex !== -1) {
        removeSelectionAt(existingIndex);
        return;
      }

      // New selection pipeline
      const metadata = collectMetadata(el);
      const selectionNumber = selectionsRef.current.length + 1;

      try {
        metadata.screenshot = await captureScreenshot(
          el,
          selectionNumber,
          hostElement,
        );
      } catch (err) {
        console.warn(
          "Web Selector: screenshot capture failed:",
          (err as Error).message,
        );
        metadata.screenshot = "";
      }

      // Show popup - enter selected state
      popupRef.current = { element: el, metadata };
      enterSelected();

      // Wait for user instruction (null = cancel)
      const instruction = await new Promise<string | null>((resolve) => {
        popupResolveRef.current = resolve as (v: string) => void;
      });

      popupRef.current = null;
      popupResolveRef.current = null;

      if (instruction !== null) {
        metadata.instruction = instruction;
        addSelection(metadata);
      }
      exitSelected();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [
    isOwnElement,
    hostElement,
    enterSelected,
    exitSelected,
    addSelection,
    removeSelectionAt,
    selectionsRef,
  ]);

  // Escape key handler — always deactivate in one shot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stateRef.current === "inactive") return;

      e.preventDefault();
      e.stopImmediatePropagation();

      // Cancel popup if open
      if (stateRef.current === "selected") {
        (popupResolveRef.current as ((v: string | null) => void) | null)?.(null);
      }

      // Full reset: mode → select, deactivate
      setMode("select");
      deactivate();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [deactivate, setMode]);

  // Chrome message handlers
  useEffect(() => {
    const listener = (
      message: { action: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => {
      if (message.action === "ping") {
        sendResponse({ pong: true });
        return;
      }
      if (message.action === "getState") {
        sendResponse({
          mode,
          actions: [...selectionsRef.current, ...actionsRef.current],
          isActive: stateRef.current !== "inactive",
          pageUrl: location.href,
          pageTitle: document.title,
        });
        return;
      }
      if (message.action === "toggleActive") {
        const msg = message as { action: string; active: boolean };
        if (msg.active && stateRef.current === "inactive") {
          toggle();
        } else if (!msg.active && stateRef.current !== "inactive") {
          deactivate();
        }
        sendResponse({ isActive: msg.active });
        return;
      }
      if (message.action === "removeAction") {
        const msg = message as { action: string; index: number };
        const selCount = selectionsRef.current.length;
        if (msg.index < selCount) {
          removeSelectionAt(msg.index);
        } else {
          removeAction(msg.index - selCount);
        }
        sendResponse({ removed: true });
        return;
      }
      if (message.action === "updateInstruction") {
        const msg = message as { action: string; index: number; instruction: string };
        const selCount = selectionsRef.current.length;
        if (msg.index < selCount) {
          const sel = selectionsRef.current[msg.index];
          if (sel) {
            sel.instruction = msg.instruction;
          }
        } else {
          updateActionInstruction(msg.index - selCount, msg.instruction);
        }
        sendResponse({ updated: true });
        return;
      }
      if (message.action === "highlightAction") {
        const msg = message as { action: string; index: number | null };
        setHighlightedActionIndex(msg.index);
        sendResponse({ ok: true });
        return;
      }
      if (message.action === "clearActions") {
        clearSelections();
        clearActions();
        deactivate();
        sendResponse({ cleared: true });
        return;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [selectionsRef, toggle, deactivate, clearSelections, clearActions, removeSelectionAt, removeAction, updateActionInstruction, mode]);

  const handlePopupSubmit = useCallback((instruction: string) => {
    popupResolveRef.current?.(instruction);
  }, []);

  const handlePopupSkip = useCallback(() => {
    popupResolveRef.current?.("");
  }, []);

  const handlePopupCancel = useCallback(() => {
    (popupResolveRef.current as ((v: string | null) => void) | null)?.(null);
  }, []);

  const popupState = popupRef.current;
  const popupHeaderText = popupState
    ? popupState.metadata.tagName +
      (popupState.metadata.selector.length < 50
        ? " \u2014 " + popupState.metadata.selector
        : " \u2014 " + popupState.metadata.selector.slice(0, 47) + "...")
    : "";

  // Show pending selection as a green border while popup is open
  const pendingSelection = popupState ? popupState.metadata : null;

  const isActive = state !== "inactive";

  // Unified action list: selections first, then edit/resize/style actions
  // This order matches what getState sends to the popup
  const allActions: Action[] = [...selections, ...actions];

  return (
    <>
      {/* Agent cursors — always polls AO; triggers NATS connection when agents found */}
      <AgentCursors natsClient={natsClient} onAgentsDetected={enableNats} shadowRoot={shadowRoot} />

      {isActive && (
        <Toolbar
          mode={mode}
          onModeChange={setMode}
          onClose={deactivate}
        />
      )}

      {/* Persistent numbered markers for ALL actions — visible even when deactivated */}
      {allActions.length > 0 && <ActionMarkers actions={allActions} highlightedIndex={highlightedActionIndex} />}

      {isActive && mode === "select" && (
        <>
          <Overlay hover={hover} selections={[]} pendingSelection={pendingSelection} />
          {state === "selected" && popupState && (
            <PopupDialog
              elementRect={popupState.metadata.boundingRect}
              headerText={popupHeaderText}
              screenshotBase64={popupState.metadata.screenshot}
              shadowRoot={shadowRoot}
              onSubmit={handlePopupSubmit}
              onSkip={handlePopupSkip}
              onCancel={handlePopupCancel}
            />
          )}
        </>
      )}

      {isActive && mode === "edit" && <EditMode addAction={addAction} hostElement={hostElement} natsClient={natsClient} shadowRoot={shadowRoot} />}
      {isActive && mode === "resize" && <ResizeMode addAction={addAction} hostElement={hostElement} />}
      {isActive && mode === "style" && <StylePanel addAction={addAction} hostElement={hostElement} />}
    </>
  );
}
