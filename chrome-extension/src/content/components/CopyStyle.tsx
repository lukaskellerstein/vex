import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, CopyStyleAction } from "../../shared/types";
import { generateSelector } from "../utils/selector";

interface CopyStyleProps {
  addAction: (action: Action) => void;
  hostElement: HTMLElement;
}

type Phase = "idle" | "pick-source" | "pick-target";

const ALL_VISUAL_STYLES = [
  "fontSize",
  "fontFamily",
  "fontWeight",
  "color",
  "backgroundColor",
  "padding",
  "margin",
  "border",
  "borderRadius",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textDecoration",
  "opacity",
  "boxShadow",
] as const;

const TEXT_STYLES = [
  "fontSize",
  "fontFamily",
  "fontWeight",
  "color",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textDecoration",
] as const;

const BOX_STYLES = [
  "padding",
  "margin",
  "border",
  "borderRadius",
  "backgroundColor",
  "boxShadow",
  "opacity",
] as const;

function isOwnElement(el: Element, host: HTMLElement): boolean {
  let node: Element | null = el;
  while (node) {
    if (node === host) return true;
    node = node.parentElement;
  }
  return false;
}

function getStyleSubset(
  computed: CSSStyleDeclaration,
  keys: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = computed.getPropertyValue(
      key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()),
    );
  }
  return result;
}

export function CopyStyle({ addAction, hostElement }: CopyStyleProps) {
  const [phase, setPhase] = useState<Phase>("pick-source");
  const sourceRef = useRef<Element | null>(null);
  const sourceStylesRef = useRef<Record<string, string>>({});
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  const highlightElement = useCallback(
    (el: Element, color: string) => {
      const htmlEl = el as HTMLElement;
      const prev = htmlEl.style.outline;
      htmlEl.style.outline = `2px solid ${color}`;
      return () => {
        htmlEl.style.outline = prev;
      };
    },
    [],
  );

  const flashElement = useCallback((el: Element) => {
    const htmlEl = el as HTMLElement;
    const prev = htmlEl.style.outline;
    htmlEl.style.outline = "2px solid #22c55e";
    setTimeout(() => {
      htmlEl.style.outline = prev;
    }, 600);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        setPhase("idle");
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || isOwnElement(target, hostElement)) return;

      e.preventDefault();
      e.stopPropagation();

      if (phase === "pick-source") {
        sourceRef.current = target;

        // Determine which styles to copy based on modifier keys
        const computed = getComputedStyle(target);
        let keys: readonly string[];
        if (e.shiftKey) {
          keys = TEXT_STYLES;
        } else if (e.altKey) {
          keys = BOX_STYLES;
        } else {
          keys = ALL_VISUAL_STYLES;
        }
        sourceStylesRef.current = getStyleSubset(computed, keys);

        // Visual feedback: blue border on source
        cleanup();
        cleanupRef.current = highlightElement(target, "#3b82f6");

        setPhase("pick-target");
      } else if (phase === "pick-target") {
        const source = sourceRef.current;
        if (!source) return;

        // Apply styles to target
        const htmlTarget = target as HTMLElement;
        const copiedProperties = sourceStylesRef.current;
        for (const [prop, value] of Object.entries(copiedProperties)) {
          const cssProp = prop.replace(
            /[A-Z]/g,
            (m) => "-" + m.toLowerCase(),
          );
          htmlTarget.style.setProperty(cssProp, value);
        }

        // Visual feedback: flash green on target
        flashElement(target);

        // Record action
        const action: CopyStyleAction = {
          type: "copyStyle",
          selector: generateSelector(target),
          fromSelector: generateSelector(source),
          toSelector: generateSelector(target),
          copiedProperties,
          timestamp: new Date().toISOString(),
          screenshotBefore: null,
          screenshotAfter: "",
        };
        addAction(action);

        // Reset for another copy operation
        cleanup();
        sourceRef.current = null;
        sourceStylesRef.current = {};
        setPhase("pick-source");
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleClick, true);
      cleanup();
    };
  }, [phase, hostElement, addAction, cleanup, highlightElement, flashElement]);

  const label =
    phase === "pick-source"
      ? "Click source element (Shift=text only, Alt=box only)"
      : "Click target element to apply styles";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: phase === "pick-source" ? "#3b82f6" : "#f59e0b",
        color: "#fff",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 2147483647,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {label}
    </div>
  );
}
