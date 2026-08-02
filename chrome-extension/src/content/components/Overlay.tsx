import { useEffect, useRef } from "react";
import type { Action, BoundingRect, Selection } from "../../shared/types";
import type { HoverInfo } from "../hooks/useHoverHighlight";

interface OverlayProps {
  hover: HoverInfo | null;
  selections: Selection[];
  pendingSelection: Selection | null;
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

function SelectionHighlight({ selection, index }: { selection: Selection; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      try {
        const target = document.querySelector(selection.selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        ref.current.style.top = rect.y + "px";
        ref.current.style.left = rect.x + "px";
        ref.current.style.width = rect.width + "px";
        ref.current.style.height = rect.height + "px";
      } catch {
        // selector may be invalid
      }
    };

    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [selection.selector]);

  const rect = selection.boundingRect;

  return (
    <div
      ref={ref}
      className="cs-selected"
      style={{
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
      }}
    >
      <div className="cs-badge">{index + 1}</div>
    </div>
  );
}

function PendingHighlight({ rect }: { rect: BoundingRect }) {
  return (
    <div
      className="cs-pending"
      style={{
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
      }}
    />
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

export function Overlay({ hover, selections, pendingSelection }: OverlayProps) {
  return (
    <div className="cs-overlay">
      {hover && <HoverHighlight rect={hover.rect} label={hover.label} />}
      {pendingSelection && <PendingHighlight rect={pendingSelection.boundingRect} />}
      {selections.map((sel, i) => (
        <SelectionHighlight key={sel.selector + i} selection={sel} index={i} />
      ))}
    </div>
  );
}

// --- Action markers: persistent numbered badges for ALL actions across all modes ---

function ActionHighlight({
  action,
  index,
  highlighted,
}: {
  action: Action;
  index: number;
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      try {
        const target = document.querySelector(action.selector);
        if (!target) {
          ref.current.style.display = "none";
          return;
        }
        const rect = target.getBoundingClientRect();
        ref.current.style.display = "block";
        ref.current.style.top = rect.y + "px";
        ref.current.style.left = rect.x + "px";
        ref.current.style.width = rect.width + "px";
        ref.current.style.height = rect.height + "px";
      } catch {
        if (ref.current) ref.current.style.display = "none";
      }
    };

    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [action.selector]);

  const borderColor = ACTION_BADGE_COLORS[action.type] ?? "#6366f1";

  return (
    <div
      ref={ref}
      className={`cs-action-marker ${highlighted ? "cs-action-marker-highlighted" : ""}`}
      style={{ borderColor }}
    >
      <div className="cs-badge" style={{ background: borderColor }}>
        {index + 1}
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
      {actions.map((action, i) => (
        <ActionHighlight
          key={action.selector + i}
          action={action}
          index={i}
          highlighted={highlightedIndex === i}
        />
      ))}
    </div>
  );
}
