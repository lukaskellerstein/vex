import { useCallback, useEffect, useRef, useState } from "react";
import type { InteractionMode } from "../../shared/types";

interface ToolbarProps {
  mode: InteractionMode;
  actionCount: number;
  onModeChange: (mode: InteractionMode) => void;
  onSend: () => void;
}

interface ModeButton {
  mode: InteractionMode;
  label: string;
  shortcut: string;
  icon: string;
}

const MODE_BUTTONS: ModeButton[] = [
  { mode: "select", label: "Select", shortcut: "1", icon: "\u25B3" },
  { mode: "edit", label: "Edit", shortcut: "2", icon: "\u270E" },
  { mode: "resize", label: "Resize", shortcut: "3", icon: "\u2922" },
  { mode: "style", label: "Style", shortcut: "4", icon: "\u25C9" },
  { mode: "copyStyle", label: "Copy Style", shortcut: "5", icon: "\u2398" },
  { mode: "visibility", label: "Visibility", shortcut: "6", icon: "\u25C9" },
];

export function Toolbar({
  mode,
  actionCount,
  onModeChange,
  onSend,
}: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 12 });
  const [centered, setCentered] = useState(false);
  const dragState = useRef<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
  }>({ dragging: false, offsetX: 0, offsetY: 0 });

  // Center on first render
  useEffect(() => {
    if (!centered && toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      setPosition({ x: (window.innerWidth - rect.width) / 2, y: 12 });
      setCentered(true);
    }
  }, [centered]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't drag from buttons
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      dragState.current = {
        dragging: true,
        offsetX: e.clientX - position.x,
        offsetY: e.clientY - position.y,
      };
      e.preventDefault();
    },
    [position],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      setPosition({
        x: e.clientX - dragState.current.offsetX,
        y: e.clientY - dragState.current.offsetY,
      });
    };

    const onMouseUp = () => {
      dragState.current.dragging = false;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      ref={toolbarRef}
      className="cs-toolbar"
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 2147483647,
        pointerEvents: "auto",
      }}
      onMouseDown={onMouseDown}
    >
      <div className="cs-toolbar-modes">
        {MODE_BUTTONS.map((btn) => (
          <button
            key={btn.mode}
            className={`cs-toolbar-btn ${mode === btn.mode ? "cs-toolbar-btn-active" : ""}`}
            onClick={() => onModeChange(btn.mode)}
            title={`${btn.label} (${btn.shortcut})`}
          >
            <span className="cs-toolbar-icon">{btn.icon}</span>
            <span className="cs-toolbar-label">{btn.label}</span>
            <span className="cs-toolbar-shortcut">{btn.shortcut}</span>
          </button>
        ))}
      </div>

      <div className="cs-toolbar-divider" />

      <button className="cs-toolbar-send" onClick={onSend}>
        Send
        {actionCount > 0 && (
          <span className="cs-toolbar-count">{actionCount}</span>
        )}
      </button>
    </div>
  );
}
