import { useCallback, useEffect, useRef, useState } from "react";
import { actionElements, elementLabel } from "../shared/select-elements";
import type { Action, ElementTarget, SelectAction } from "../shared/types";
import { AgentCursors } from "./components/AgentCursors";
import { EditMode } from "./components/EditMode";
import { ActionMarkers, Overlay } from "./components/Overlay";
import { PopupDialog } from "./components/PopupDialog";
import { ResizeMode } from "./components/ResizeMode";
import { StylePanel } from "./components/StylePanel";
import { Toolbar } from "./components/Toolbar";
import { useActions } from "./hooks/useActions";
import { useHoverHighlight } from "./hooks/useHoverHighlight";
import { useNatsClient } from "./hooks/useNatsClient";
import { captureViewport } from "./hooks/useScreenshot";
import { useSelectionState } from "./hooks/useSelectionState";
import { revertAllVisualChanges } from "./hooks/useUndo";
import {
  addView,
  type GroupView,
  isInViewport,
  pruneViews,
  rectInViews,
  renderViews,
  toRect,
} from "./utils/group-views";
import { collectElementTarget } from "./utils/metadata";

const HOST_ID = "__web-selector-root";

/** The elements collected for one prompt while the popup is open. */
interface PendingGroup {
  actionNumber: number;
  elements: Element[];
  targets: ElementTarget[];
  /** Raw captures; each element is marked on the newest view that shows it. */
  views: GroupView[];
  /** The views rendered with badges, in view order. */
  screenshots: string[];
}

function groupLabels(group: Pick<PendingGroup, "actionNumber" | "elements">): string[] {
  return group.elements.map((_, i) => elementLabel(group.actionNumber, i, group.elements.length));
}

function buildSelectAction(group: PendingGroup, instruction: string): SelectAction {
  const [primary, ...extra] = group.targets;
  return {
    type: "select",
    ...primary,
    instruction,
    screenshot: group.screenshots[0] ?? "",
    url: location.href,
    ...(extra.length > 0 ? { extraElements: extra } : {}),
    ...(group.screenshots.length > 1 ? { extraScreenshots: group.screenshots.slice(1) } : {}),
  };
}

function findSelectionIndex(selections: SelectAction[], el: Element): number {
  return selections.findIndex((s) =>
    actionElements(s).some((target) => {
      try {
        return document.querySelector(target.selector) === el;
      } catch {
        return false;
      }
    }),
  );
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

  const [pending, setPendingState] = useState<PendingGroup | null>(null);
  const pendingRef = useRef<PendingGroup | null>(null);
  const setPending = useCallback((group: PendingGroup | null) => {
    pendingRef.current = group;
    setPendingState(group);
  }, []);

  const [picking, setPickingState] = useState(false);
  const pickingRef = useRef(false);
  const setPicking = useCallback((value: boolean) => {
    pickingRef.current = value;
    setPickingState(value);
  }, []);

  const shiftHeld = useShiftHeld();
  const hoverEnabled = state === "idle" || (state === "selected" && (picking || shiftHeld));
  const { hover, isOwnElement } = useHoverHighlight(hoverEnabled, HOST_ID);

  // NATS connects only when needed: user activates the extension OR
  // AgentCursors discovers active agents via AO polling.
  const [natsEnabled, setNatsEnabled] = useState(false);
  useEffect(() => {
    if (state !== "inactive") setNatsEnabled(true);
  }, [state]);

  const enableNats = useCallback(() => setNatsEnabled(true), []);
  const natsClient = useNatsClient(natsEnabled);

  const popupResolveRef = useRef<((instruction: string) => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [highlightedActionIndex, setHighlightedActionIndex] = useState<number | null>(null);

  // Close the popup once every selected element is gone from the DOM. A group
  // may outlive a single element: an SPA route change keeps the earlier views.
  useEffect(() => {
    if (state !== "selected" || !pendingRef.current) return;

    const observer = new MutationObserver(() => {
      const elements = pendingRef.current?.elements ?? [];
      if (elements.length > 0 && elements.every((el) => !el.isConnected)) {
        popupResolveRef.current?.("");
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [state]);

  /** Capture the current view for the group elements visible in it, when
   *  `capture` is set, then re-render every view with the current labels. */
  const buildGroup = useCallback(
    async (
      actionNumber: number,
      elements: Element[],
      targets: ElementTarget[],
      views: GroupView[],
      capture: boolean,
    ): Promise<PendingGroup> => {
      let nextViews = views;
      const visible = elements.filter(isInViewport);
      if (capture && visible.length > 0) {
        const marks = visible.map((el) => ({ el, rect: toRect(el.getBoundingClientRect()) }));
        try {
          nextViews = addView(views, { raw: await captureViewport(hostElement), marks });
        } catch (err) {
          console.warn("Web Selector: screenshot capture failed:", (err as Error).message);
        }
      }
      nextViews = pruneViews(nextViews, elements);

      const labels = groupLabels({ actionNumber, elements });
      const screenshots = await renderViews(nextViews, elements, labels);
      // Each target's rect is the one on its screenshot
      const alignedTargets = targets.map((target, i) => ({
        ...target,
        boundingRect: rectInViews(nextViews, elements[i]) ?? target.boundingRect,
      }));
      return { actionNumber, elements, targets: alignedTargets, views: nextViews, screenshots };
    },
    [hostElement],
  );

  // A capture hides the overlay for a moment; ignore clicks until it is back.
  const capturingRef = useRef(false);
  const updateGroup = useCallback(
    async (elements: Element[], targets: ElementTarget[], capture: boolean) => {
      const current = pendingRef.current;
      if (!current || elements.length === 0 || capturingRef.current) return;
      capturingRef.current = true;
      try {
        const next = await buildGroup(
          current.actionNumber,
          elements,
          targets,
          current.views,
          capture,
        );
        if (pendingRef.current) setPending(next);
      } finally {
        capturingRef.current = false;
      }
    },
    [buildGroup, setPending],
  );

  // Removing needs no new capture: its mark disappears and the rest are renumbered.
  const removeFromGroup = useCallback(
    (index: number) => {
      const current = pendingRef.current;
      if (!current) return;
      void updateGroup(
        current.elements.filter((_, i) => i !== index),
        current.targets.filter((_, i) => i !== index),
        false,
      );
    },
    [updateGroup],
  );

  /** Add an element to the open group, or take it out if it is already there. */
  const toggleInGroup = useCallback(
    (el: Element) => {
      const current = pendingRef.current;
      if (!current) return;
      const index = current.elements.indexOf(el);
      if (index !== -1) {
        removeFromGroup(index);
        return;
      }
      void updateGroup(
        [...current.elements, el],
        [...current.targets, collectElementTarget(el)],
        true,
      );
    },
    [updateGroup, removeFromGroup],
  );

  // Click handler
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const addingToGroup = stateRef.current === "selected" && (e.shiftKey || pickingRef.current);
      if (stateRef.current !== "idle" && !addingToGroup) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnElement(el)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      if (addingToGroup) {
        toggleInGroup(el);
        return;
      }
      if (capturingRef.current) return;

      // Check if already selected -> deselect
      const existingIndex = findSelectionIndex(selectionsRef.current, el);
      if (existingIndex !== -1) {
        removeSelectionAt(existingIndex);
        return;
      }

      // New selection pipeline
      capturingRef.current = true;
      const group = await buildGroup(
        selectionsRef.current.length + 1,
        [el],
        [collectElementTarget(el)],
        [],
        true,
      );
      capturingRef.current = false;

      // Show popup - enter selected state
      setPending(group);
      enterSelected();

      // Wait for user instruction (null = cancel)
      const instruction = await new Promise<string | null>((resolve) => {
        popupResolveRef.current = resolve as (v: string) => void;
      });

      const finalGroup = pendingRef.current;
      setPending(null);
      setPicking(false);
      popupResolveRef.current = null;

      if (instruction !== null && finalGroup) {
        addSelection(buildSelectAction(finalGroup, instruction));
      }
      exitSelected();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [
    isOwnElement,
    buildGroup,
    toggleInGroup,
    setPending,
    setPicking,
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

      // While adding elements, Escape only ends the picking
      if (pickingRef.current) {
        setPicking(false);
        return;
      }

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
  }, [deactivate, setMode, setPicking]);

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
      if (message.action === "resetVisualChanges") {
        revertAllVisualChanges();
        sendResponse({ reset: true });
        return;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [
    selectionsRef,
    toggle,
    deactivate,
    clearSelections,
    clearActions,
    removeSelectionAt,
    removeAction,
    updateActionInstruction,
    mode,
  ]);

  const handlePopupSubmit = useCallback((instruction: string) => {
    popupResolveRef.current?.(instruction);
  }, []);

  const handlePopupSkip = useCallback(() => {
    popupResolveRef.current?.("");
  }, []);

  const handlePopupCancel = useCallback(() => {
    (popupResolveRef.current as ((v: string | null) => void) | null)?.(null);
  }, []);

  const handleStartPicking = useCallback(() => setPicking(true), [setPicking]);
  const handleStopPicking = useCallback(() => setPicking(false), [setPicking]);

  // Show the pending group as green borders while the popup is open
  const pendingLabels = pending ? groupLabels(pending) : [];
  const pendingMarks = pending
    ? pending.elements.map((el, i) => ({ el, label: pendingLabels[i] }))
    : [];
  const popupElements = pending
    ? pending.targets.map((t, i) => ({
        label: pendingLabels[i],
        text: `${t.tagName} \u2014 ${t.selector}`,
      }))
    : [];

  const isActive = state !== "inactive";

  // Unified action list: selections first, then edit/resize/style actions
  // This order matches what getState sends to the popup
  const allActions: Action[] = [...selections, ...actions];

  return (
    <>
      {/* Agent cursors — always polls AO; triggers NATS connection when agents found */}
      <AgentCursors natsClient={natsClient} onAgentsDetected={enableNats} shadowRoot={shadowRoot} />

      {isActive && <Toolbar mode={mode} onModeChange={setMode} onClose={deactivate} />}

      {/* Persistent numbered markers for ALL actions — visible even when deactivated */}
      {allActions.length > 0 && (
        <ActionMarkers actions={allActions} highlightedIndex={highlightedActionIndex} />
      )}

      {isActive && mode === "select" && (
        <>
          <Overlay hover={hover} pending={pendingMarks} />
          {state === "selected" && pending && (
            <PopupDialog
              elementRect={pending.targets[0].boundingRect}
              elements={popupElements}
              screenshots={pending.screenshots}
              shadowRoot={shadowRoot}
              picking={picking}
              onStartPicking={handleStartPicking}
              onStopPicking={handleStopPicking}
              onRemoveElement={removeFromGroup}
              onSubmit={handlePopupSubmit}
              onSkip={handlePopupSkip}
              onCancel={handlePopupCancel}
            />
          )}
        </>
      )}

      {isActive && mode === "edit" && (
        <EditMode
          addAction={addAction}
          hostElement={hostElement}
          natsClient={natsClient}
          shadowRoot={shadowRoot}
        />
      )}
      {isActive && mode === "resize" && (
        <ResizeMode addAction={addAction} hostElement={hostElement} />
      )}
      {isActive && mode === "style" && (
        <StylePanel addAction={addAction} hostElement={hostElement} />
      )}
    </>
  );
}

/** Tracks whether Shift is held, so hovering previews what Shift+click will add. */
function useShiftHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setHeld(e.shiftKey);
    const onBlur = () => setHeld(false);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return held;
}
