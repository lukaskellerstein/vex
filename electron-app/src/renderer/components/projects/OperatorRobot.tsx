import { Bot } from "lucide-react";
import React, { useMemo } from "react";

interface OperatorRobotProps {
  size?: number;
  idle?: boolean;
}

export function OperatorRobot({ size = 20, idle = false }: OperatorRobotProps) {
  // Each instance gets a random delay and slightly different pulse speed
  const delay = useMemo(() => -(Math.random() * 3).toFixed(2), []);
  const duration = useMemo(() => (1.2 + Math.random() * 1.6).toFixed(2), []);

  if (idle) {
    return (
      <Bot
        size={size}
        strokeWidth={1.5}
        style={{ color: "var(--foreground-muted)", opacity: 0.7 }}
      />
    );
  }

  return (
    <Bot
      size={size}
      strokeWidth={1.5}
      style={{
        color: "#4ade80",
        animation: `agent-pulse ${duration}s ease-in-out infinite ${delay}s`,
      }}
    />
  );
}
