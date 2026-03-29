import { useEffect, useRef } from "react";
import type { BoundingRect, Selection } from "../../shared/types";
import type { HoverInfo } from "../hooks/useHoverHighlight";

interface OverlayProps {
  hover: HoverInfo | null;
  selections: Selection[];
  pendingSelection: Selection | null;
}

function SelectionHighlight({
  selection,
  index,
}: {
  selection: Selection;
  index: number;
}) {
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
