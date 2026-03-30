import React, { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "right" | "bottom";
}

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const style: React.CSSProperties = {
    position: "absolute",
    whiteSpace: "nowrap",
    padding: "4px 8px",
    background: "var(--surface-elevated)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontSize: "11px",
    pointerEvents: "none",
    zIndex: 50,
    animation: "fade-in 0.15s ease",
    ...(side === "right"
      ? { left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "8px" }
      : { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "6px" }),
  };

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && <div style={style}>{content}</div>}
    </div>
  );
}
