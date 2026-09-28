import { type RefObject, useCallback, useEffect, useRef } from "react";
import { actionElements, elementLabel } from "../../shared/select-elements";
import type { Action, BoundingRect } from "../../shared/types";
import type { HoverInfo } from "../hooks/useHoverHighlight";

export interface PendingMark {
  el: Element;
  label: string;
}

interface OverlayProps {
  hover: HoverInfo | null;
  pending: PendingMark[];
}

const ACTION_BADGE_COLORS: Record<string, string> = {
  select: "#16a34a",
  insert: "#22c55e",
  editText: "#eab308",
  delete: "#ef4444",
  duplicate: "#06b6d4",
  move: "#8b5cf6",
  wrap: "#64748b",
  resize: "#a855f7",
  styleChange: "#f97316",
  replaceImage: "#ec4899",
  generateSection: "#14b8a6",
  copyStyle: "#6366f1",
};

/** Keep a fixed-position box on top of an element while the page scrolls or
 *  resizes; hide it while the element is not in the DOM. */
function useFollowElement(ref: RefObject<HTMLDivElement>, resolve: () => Element | null) {
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      let target: Element | null = null;
      try {
        target = resolve();
      } catch {
        // selector may be invalid
      }
      if (!target?.isConnected) {
        ref.current.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      ref.current.style.display = "block";
      ref.current.style.top = rect.y + "px";
      ref.current.style.left = rect.x + "px";
      ref.current.style.width = rect.width + "px";
      ref.current.style.height = rect.height + "px";
    };

    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [ref, resolve]);
}

function PendingHighlight({ el, label }: PendingMark) {
  const ref = useRef<HTMLDivElement>(null);
  const resolve = useCallback(() => el, [el]);
  useFollowElement(ref, resolve);
  return (
    <div ref={ref} className="cs-pending">
      <div className="cs-badge">{label}</div>
    </div>
  );
}

function HoverHighlight({ rect, label }: { rect: BoundingRect; label: string }) {
  return (
    <div
      className="cs-highlight"
      style={{
        display: "block",
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
      }}
    >
      <div className="cs-highlight-label">{label}</div>
    </div>
  );
}

export function Overlay({ hover, pending }: OverlayProps) {
  return (
    <div className="cs-overlay">
      {hover && <HoverHighlight rect={hover.rect} label={hover.label} />}
      {pending.map((mark) => (
        <PendingHighlight key={mark.label} el={mark.el} label={mark.label} />
      ))}
    </div>
  );
}

// --- Action markers: persistent numbered badges for ALL actions across all modes ---

function ActionHighlight({
  selector,
  type,
  label,
  highlighted,
}: {
  selector: string;
  type: Action["type"];
  label: string;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const resolve = useCallback(() => document.querySelector(selector), [selector]);
  useFollowElement(ref, resolve);

  const borderColor = ACTION_BADGE_COLORS[type] ?? "#6366f1";

  return (
    <div
      ref={ref}
      className={`cs-action-marker ${highlighted ? "cs-action-marker-highlighted" : ""}`}
      style={{ borderColor }}
    >
      <div className="cs-badge" style={{ background: borderColor }}>
        {label}
      </div>
    </div>
  );
}

interface ActionMarkersProps {
  actions: Action[];
  highlightedIndex: number | null;
}

export function ActionMarkers({ actions, highlightedIndex }: ActionMarkersProps) {
  if (actions.length === 0) return null;
  return (
    <div className="cs-overlay">
      {actions.flatMap((action, i) => {
        const elements = actionElements(action);
        const selectors =
          elements.length > 0 ? elements.map((el) => el.selector) : [action.selector];
        return selectors.map((selector, j) => (
          <ActionHighlight
            key={`${i}:${j}:${selector}`}
            selector={selector}
            type={action.type}
            label={elementLabel(i + 1, j, selectors.length)}
            highlighted={highlightedIndex === i}
          />
        ));
      })}
    </div>
  );
}
