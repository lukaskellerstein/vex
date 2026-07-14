import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ResizeAction } from "../../shared/types";
import { generateSelector } from "../utils/selector";
import { computeDeltas, isSmallChange } from "../utils/delta";
import { captureScreenshot } from "../hooks/useScreenshot";
import { registerVisualRevert } from "../hooks/useUndo";

interface ResizeModeProps {
  addAction: (action: Action) => void;
  hostElement: HTMLElement;
}

type HandlePosition =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

interface HandleInfo {
  position: HandlePosition;
  cursor: string;
  xFactor: number; // -1 = left edge, 0 = no x, 1 = right edge
  yFactor: number; // -1 = top edge, 0 = no y, 1 = bottom edge
}

const HANDLES: HandleInfo[] = [
  { position: "nw", cursor: "nwse-resize", xFactor: -1, yFactor: -1 },
  { position: "n", cursor: "ns-resize", xFactor: 0, yFactor: -1 },
  { position: "ne", cursor: "nesw-resize", xFactor: 1, yFactor: -1 },
  { position: "e", cursor: "ew-resize", xFactor: 1, yFactor: 0 },
  { position: "se", cursor: "nwse-resize", xFactor: 1, yFactor: 1 },
  { position: "s", cursor: "ns-resize", xFactor: 0, yFactor: 1 },
  { position: "sw", cursor: "nesw-resize", xFactor: -1, yFactor: 1 },
  { position: "w", cursor: "ew-resize", xFactor: -1, yFactor: 0 },
];

const RESIZE_STYLE_PROPS = [
  "width",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
];

function getResizeStyles(el: Element): Record<string, string> {
  const computed = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of RESIZE_STYLE_PROPS) {
    const cssProp = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    styles[prop] = computed.getPropertyValue(cssProp);
  }
  return styles;
}

function getBoxValues(el: Element): {
  padding: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
} {
  const cs = getComputedStyle(el);
  return {
    padding: {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    },
    margin: {
      top: parseFloat(cs.marginTop) || 0,
      right: parseFloat(cs.marginRight) || 0,
      bottom: parseFloat(cs.marginBottom) || 0,
      left: parseFloat(cs.marginLeft) || 0,
    },
  };
}

function restoreStyles(el: HTMLElement, styles: Record<string, string>) {
  for (const [prop, value] of Object.entries(styles)) {
    const cssProp = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    el.style.setProperty(cssProp, value);
  }
}

function elementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return tag + "#" + el.id;
  if (el.classList.length) return tag + "." + el.classList[0];
  return tag;
}

export function ResizeMode({ addAction, hostElement }: ResizeModeProps) {
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [boxValues, setBoxValues] = useState<ReturnType<typeof getBoxValues> | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Hover state for when no element is selected
  const [hoverEl, setHoverEl] = useState<{ rect: DOMRect; label: string } | null>(null);

  const dragRef = useRef<{
    handle: HandleInfo;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPaddingTop: number;
    startPaddingRight: number;
    startPaddingBottom: number;
    startPaddingLeft: number;
    beforeStyles: Record<string, string>;
    screenshotBefore: string | null;
  } | null>(null);

  const pendingActionRef = useRef<ResizeAction | null>(null);
  const selectedElRef = useRef(selectedEl);
  selectedElRef.current = selectedEl;

  const updateRect = useCallback(() => {
    if (!selectedElRef.current) return;
    const r = selectedElRef.current.getBoundingClientRect();
    setRect(r);
    setBoxValues(getBoxValues(selectedElRef.current));
  }, []);

  // Keep rect in sync on scroll/resize
  useEffect(() => {
    if (!selectedEl) return;
    updateRect();
    document.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      document.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [selectedEl, updateRect]);

  // Hover highlight when no element is selected
  useEffect(() => {
    if (selectedEl) {
      setHoverEl(null);
      return;
    }

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || hostElement.contains(el) || el === hostElement) {
        setHoverEl(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setHoverEl({ rect: r, label: elementLabel(el) });
    };

    const onMouseLeave = () => setHoverEl(null);

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [selectedEl, hostElement]);

  // Click to select element
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (showConfirm) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || hostElement.contains(el) || el === hostElement) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      if (selectedEl && el !== selectedEl) {
        setSelectedEl(null);
        setRect(null);
        setBoxValues(null);
        return;
      }

      if (el === selectedEl) return;

      setSelectedEl(el as HTMLElement);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [selectedEl, hostElement, showConfirm]);

  // Escape is handled globally in App.tsx — deactivates the entire extension
  // Revert pending resize changes on unmount
  useEffect(() => {
    return () => {
      if (pendingActionRef.current && selectedElRef.current) {
        restoreStyles(selectedElRef.current, pendingActionRef.current.beforeStyles);
        pendingActionRef.current = null;
      }
    };
  }, []);

  // Handle drag
  const onHandleMouseDown = useCallback(
    async (e: React.MouseEvent, handle: HandleInfo) => {
      if (!selectedEl) return;
      e.preventDefault();
      e.stopPropagation();

      const cs = getComputedStyle(selectedEl);
      const beforeStyles = getResizeStyles(selectedEl);

      let screenshotBefore: string | null = null;
      try {
        screenshotBefore = await captureScreenshot(selectedEl, 0, hostElement);
      } catch {
        screenshotBefore = null;
      }

      dragRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: parseFloat(cs.width) || selectedEl.offsetWidth,
        startHeight: parseFloat(cs.height) || selectedEl.offsetHeight,
        startPaddingTop: parseFloat(cs.paddingTop) || 0,
        startPaddingRight: parseFloat(cs.paddingRight) || 0,
        startPaddingBottom: parseFloat(cs.paddingBottom) || 0,
        startPaddingLeft: parseFloat(cs.paddingLeft) || 0,
        beforeStyles,
        screenshotBefore,
      };
    },
    [selectedEl, hostElement],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !selectedEl) return;
      const { handle, startX, startY, startWidth, startHeight } =
        dragRef.current;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (handle.xFactor !== 0) {
        const newWidth = Math.max(
          20,
          startWidth + dx * handle.xFactor,
        );
        selectedEl.style.width = `${newWidth}px`;
      }

      if (handle.yFactor !== 0) {
        const newHeight = Math.max(
          20,
          startHeight + dy * handle.yFactor,
        );
        selectedEl.style.height = `${newHeight}px`;
      }

      updateRect();
    };

    const onMouseUp = async () => {
      if (!dragRef.current || !selectedEl) return;
      const { beforeStyles, screenshotBefore } = dragRef.current;
      dragRef.current = null;

      const afterStyles = getResizeStyles(selectedEl);
      const deltas = computeDeltas(beforeStyles, afterStyles);

      if (deltas.length === 0) return;

      let screenshotAfter = "";
      try {
        screenshotAfter = await captureScreenshot(selectedEl, 0, hostElement);
      } catch {
        screenshotAfter = "";
      }

      const action: ResizeAction = {
        type: "resize",
        selector: generateSelector(selectedEl),
        timestamp: new Date().toISOString(),
        screenshotBefore,
        screenshotAfter,
        beforeStyles,
        afterStyles,
        deltas,
      };

      const hasSmallChanges = deltas.some(isSmallChange);
      if (hasSmallChanges) {
        pendingActionRef.current = action;
        setShowConfirm(true);
      } else {
        addAction(action);
        const el = selectedEl;
        registerVisualRevert(() => restoreStyles(el, beforeStyles));
      }

      updateRect();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [selectedEl, hostElement, addAction, updateRect]);

  const handleKeep = useCallback(() => {
    if (pendingActionRef.current) {
      const { beforeStyles } = pendingActionRef.current;
      addAction(pendingActionRef.current);
      const el = selectedElRef.current;
      if (el) {
        registerVisualRevert(() => restoreStyles(el, beforeStyles));
      }
      pendingActionRef.current = null;
    }
    setShowConfirm(false);
  }, [addAction]);

  const handleDiscard = useCallback(() => {
    // Revert styles
    if (pendingActionRef.current && selectedEl) {
      restoreStyles(selectedEl, pendingActionRef.current.beforeStyles);
      updateRect();
    }
    pendingActionRef.current = null;
    setShowConfirm(false);
  }, [selectedEl, updateRect]);

  // Show hover highlight when no element is selected
  if (!selectedEl || !rect) {
    return (
      <div className="cs-overlay">
        {hoverEl && (
          <>
            <div
              className="cs-highlight"
              style={{
                top: hoverEl.rect.top,
                left: hoverEl.rect.left,
                width: hoverEl.rect.width,
                height: hoverEl.rect.height,
              }}
            />
            <div
              className="cs-highlight-label"
              style={{
                position: "fixed",
                top: hoverEl.rect.top - 22,
                left: hoverEl.rect.left,
              }}
            >
              {hoverEl.label}
            </div>
          </>
        )}
      </div>
    );
  }

  const handleSize = 8;
  const half = handleSize / 2;

  const handlePositions: Record<HandlePosition, { top: number; left: number }> =
    {
      nw: { top: rect.top - half, left: rect.left - half },
      n: {
        top: rect.top - half,
        left: rect.left + rect.width / 2 - half,
      },
      ne: { top: rect.top - half, left: rect.right - half },
      e: {
        top: rect.top + rect.height / 2 - half,
        left: rect.right - half,
      },
      se: { top: rect.bottom - half, left: rect.right - half },
      s: {
        top: rect.bottom - half,
        left: rect.left + rect.width / 2 - half,
      },
      sw: { top: rect.bottom - half, left: rect.left - half },
      w: {
        top: rect.top + rect.height / 2 - half,
        left: rect.left - half,
      },
    };

  const pad = boxValues?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const mar = boxValues?.margin ?? { top: 0, right: 0, bottom: 0, left: 0 };

  return (
    <>
      {/* Margin overlay (orange) */}
      {mar.top > 0 && (
        <div
          className="cs-resize-margin"
          style={{
            position: "fixed",
            top: rect.top - mar.top,
            left: rect.left - mar.left,
            width: rect.width + mar.left + mar.right,
            height: mar.top,
          }}
        />
      )}
      {mar.bottom > 0 && (
        <div
          className="cs-resize-margin"
          style={{
            position: "fixed",
            top: rect.bottom,
            left: rect.left - mar.left,
            width: rect.width + mar.left + mar.right,
            height: mar.bottom,
          }}
        />
      )}
      {mar.left > 0 && (
        <div
          className="cs-resize-margin"
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left - mar.left,
            width: mar.left,
            height: rect.height,
          }}
        />
      )}
      {mar.right > 0 && (
        <div
          className="cs-resize-margin"
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.right,
            width: mar.right,
            height: rect.height,
          }}
        />
      )}

      {/* Padding overlay (green) */}
      {pad.top > 0 && (
        <div
          className="cs-resize-padding"
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: pad.top,
          }}
        />
      )}
      {pad.bottom > 0 && (
        <div
          className="cs-resize-padding"
          style={{
            position: "fixed",
            top: rect.bottom - pad.bottom,
            left: rect.left,
            width: rect.width,
            height: pad.bottom,
          }}
        />
      )}
      {pad.left > 0 && (
        <div
          className="cs-resize-padding"
          style={{
            position: "fixed",
            top: rect.top + pad.top,
            left: rect.left,
            width: pad.left,
            height: rect.height - pad.top - pad.bottom,
          }}
        />
      )}
      {pad.right > 0 && (
        <div
          className="cs-resize-padding"
          style={{
            position: "fixed",
            top: rect.top + pad.top,
            left: rect.right - pad.right,
            width: pad.right,
            height: rect.height - pad.top - pad.bottom,
          }}
        />
      )}

      {/* Selection border */}
      <div
        className="cs-resize-border"
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* Resize handles */}
      {HANDLES.map((handle) => {
        const pos = handlePositions[handle.position];
        return (
          <div
            key={handle.position}
            className="cs-resize-handle"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: handleSize,
              height: handleSize,
              cursor: handle.cursor,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => onHandleMouseDown(e, handle)}
          />
        );
      })}

      {/* Keep/Discard popup */}
      {showConfirm && (
        <div
          className="cs-resize-confirm"
          style={{
            position: "fixed",
            top: rect.bottom + 8,
            left: rect.left + rect.width / 2 - 80,
            pointerEvents: "auto",
          }}
        >
          <span className="cs-resize-confirm-text">
            Small change detected
          </span>
          <button className="cs-btn cs-resize-keep" onClick={handleKeep}>
            Keep
          </button>
          <button
            className="cs-btn cs-resize-discard"
            onClick={handleDiscard}
          >
            Discard
          </button>
        </div>
      )}
    </>
  );
}
