import { useCallback, useEffect, useRef, useState } from "react";
import type { InteractionMode } from "../../shared/types";

interface ToolbarProps {
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  onClose: () => void;
}

const MODE_BUTTONS: { mode: InteractionMode; label: string; shortcut: string; icon: string }[] = [
  { mode: "select", label: "Select", shortcut: "1", icon: "\u25B3" },
  { mode: "edit", label: "Edit", shortcut: "2", icon: "\u270E" },
  { mode: "resize", label: "Resize", shortcut: "3", icon: "\u2922" },
  { mode: "style", label: "Style", shortcut: "4", icon: "\u25C9" },
];

export function Toolbar({ mode, onModeChange, onClose }: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 12 });
  const [centered, setCentered] = useState(false);
  const dragState = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    if (!centered && toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      setPosition({ x: (window.innerWidth - rect.width) / 2, y: 12 });
      setCentered(true);
    }
  }, [centered]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["BUTTON", "SELECT", "INPUT", "TEXTAREA", "IMG"].includes(tag)) return;
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
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      setPosition({
        x: e.clientX - dragState.current.offsetX,
        y: e.clientY - dragState.current.offsetY,
      });
    };
    const onUp = () => {
      dragState.current.dragging = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
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
            onClick={() => onModeChange(mode === btn.mode ? "idle" : btn.mode)}
            title={`${btn.label} (${btn.shortcut})`}
          >
            <span className="cs-toolbar-icon">{btn.icon}</span>
            <span className="cs-toolbar-label">{btn.label}</span>
            <span className="cs-toolbar-shortcut">{btn.shortcut}</span>
          </button>
        ))}
        <div className="cs-toolbar-divider" />
        <button className="cs-toolbar-btn cs-toolbar-close-btn" onClick={onClose} title="Close VEX">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
