import React, { useRef, useEffect } from "react";
import { AgentStepItem } from "./AgentStepItem";
import type { AgentStep } from "./AgentStepItem";

interface AgentStepListProps {
  steps: AgentStep[];
  status: string;
}

export function AgentStepList({ steps, status }: AgentStepListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isRunning = status === "running";

  // Auto-scroll to bottom when new steps arrive while running
  useEffect(() => {
    if (!isRunning) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps.length, isRunning]);

  if (steps.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          color: "var(--foreground-dim)",
          fontSize: "14px",
        }}
      >
        No trace steps recorded
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", position: "relative" }}>
        {/* Timeline line */}
        <div
          style={{
            position: "absolute",
            left: "6px",
            top: "20px",
            bottom: "20px",
            width: "2px",
            background: "var(--border)",
            pointerEvents: "none",
          }}
        />

        {steps.map((step, index) => (
          <div
            key={step.id}
            style={{
              position: "relative",
              paddingLeft: "24px",
              animation: `fade-in-up 0.3s ease-out ${index * 0.04}s both`,
            }}
          >
            {/* Timeline node */}
            <div
              style={{
                position: "absolute",
                left: "2px",
                top: "14px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "var(--surface-elevated)",
                border: "2px solid var(--border)",
                zIndex: 1,
              }}
            />
            <AgentStepItem step={step} />
          </div>
        ))}

        {/* Running indicator */}
        {isRunning && (
          <div
            style={{
              position: "relative",
              paddingLeft: "24px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 4px 12px 24px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "3px",
                top: "16px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--primary)",
                animation: "status-pulse 1.5s ease-out infinite",
              }}
            />
            <span
              style={{
                fontSize: "12px",
                color: "var(--foreground-dim)",
                fontStyle: "italic",
              }}
            >
              Agent is working...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
