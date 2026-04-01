import React, { useRef, useEffect, useCallback, useState } from "react";
import gsap from "gsap";
import { AgentStepItem } from "./AgentStepItem";
import type { AgentStep } from "./AgentStepItem";

interface AgentStepListProps {
  steps: AgentStep[];
  status: string;
}

export function AgentStepList({ steps, status }: AgentStepListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const isRunning = status === "running";

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 40;
  }, []);

  const handleScroll = useCallback(() => {
    setAutoScroll(isAtBottom());
  }, [isAtBottom]);

  // Animate new steps in via GSAP
  const animateNewSteps = useCallback((startIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const stepEls = el.querySelectorAll<HTMLElement>("[data-step-index]");
    const targets: HTMLElement[] = [];
    stepEls.forEach((node) => {
      const idx = parseInt(node.dataset.stepIndex ?? "-1", 10);
      if (idx >= startIndex) targets.push(node);
    });
    if (targets.length === 0) return;

    gsap.fromTo(
      targets,
      { opacity: 0, x: -20, scale: 0.97 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.06,
        onComplete: () => {
          if (isRunning && autoScroll && el) {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }
        },
      },
    );
  }, [isRunning, autoScroll]);

  useEffect(() => {
    const prevCount = prevCountRef.current;
    if (steps.length > prevCount && prevCount > 0) {
      // New steps arrived — animate them
      animateNewSteps(prevCount);
    }
    prevCountRef.current = steps.length;
  }, [steps.length, animateNewSteps]);

  // Auto-scroll when running, only if user is at bottom
  useEffect(() => {
    if (!isRunning || !autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps.length, isRunning, autoScroll]);

  // Group tool_result/tool_error and detail steps (bash_command, write_file, diff)
  // with their preceding tool_call. Skip redundant subagent/skill steps.
  const grouped = React.useMemo(() => {
    const redundant = new Set([
      "subagent_spawn", "subagent_result", "skill_invoke", "skill_result",
    ]);
    // Detail step types that should be absorbed into the preceding tool_call
    const detailTypes = new Set(["bash_command", "write_file", "diff"]);
    const result: { step: AgentStep; resultSteps: AgentStep[] }[] = [];
    for (const s of steps) {
      if (redundant.has(s.type)) continue;
      const prev = result.length > 0 ? result[result.length - 1] : null;
      const prevIsToolCall = prev && (prev.step.type === "tool_call" || prev.step.type === "tool_use");
      // Absorb detail steps into the preceding tool_call's metadata
      if (detailTypes.has(s.type) && prevIsToolCall) {
        prev.step = {
          ...prev.step,
          metadata: {
            ...prev.step.metadata,
            _detail: { type: s.type, content: s.content, metadata: s.metadata },
          },
        };
        continue;
      }
      if (
        (s.type === "tool_result" || s.type === "tool_error") &&
        prevIsToolCall
      ) {
        prev.resultSteps.push(s);
      } else {
        result.push({ step: s, resultSteps: [] });
      }
    }
    return result;
  }, [steps]);

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
      onScroll={handleScroll}
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

        {grouped.map((group, index) => (
          <div
            key={group.step.id}
            data-step-index={index}
            style={{
              position: "relative",
              paddingLeft: "24px",
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
            <AgentStepItem
              step={group.step}
              resultSteps={group.resultSteps.length > 0 ? group.resultSteps : undefined}
            />
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
