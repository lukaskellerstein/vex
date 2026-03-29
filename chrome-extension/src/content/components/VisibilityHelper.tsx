import { useCallback, useEffect, useRef, useState } from "react";

interface VisibilityHelperProps {
  hostElement: HTMLElement;
}

interface ElementVisualization {
  element: Element;
  rect: DOMRect;
  display: string;
  margin: { top: number; right: number; bottom: number; left: number };
  padding: { top: number; right: number; bottom: number; left: number };
}

function parseBoxValue(value: string): number {
  return parseFloat(value) || 0;
}

function getBoxValues(
  computed: CSSStyleDeclaration,
  prefix: "margin" | "padding",
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: parseBoxValue(computed.getPropertyValue(`${prefix}-top`)),
    right: parseBoxValue(computed.getPropertyValue(`${prefix}-right`)),
    bottom: parseBoxValue(computed.getPropertyValue(`${prefix}-bottom`)),
    left: parseBoxValue(computed.getPropertyValue(`${prefix}-left`)),
  };
}

function isOwnElement(el: Element, host: HTMLElement): boolean {
  let node: Element | null = el;
  while (node) {
    if (node === host) return true;
    node = node.parentElement;
  }
  return false;
}

export function VisibilityHelper({ hostElement }: VisibilityHelperProps) {
  const [visualizations, setVisualizations] = useState<ElementVisualization[]>(
    [],
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleElementsRef = useRef<Set<Element>>(new Set());
  const rafRef = useRef<number | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const computeVisualizations = useCallback(() => {
    const results: ElementVisualization[] = [];
    for (const el of visibleElementsRef.current) {
      if (isOwnElement(el, hostElement)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const computed = getComputedStyle(el);
      results.push({
        element: el,
        rect,
        display: computed.display,
        margin: getBoxValues(computed, "margin"),
        padding: getBoxValues(computed, "padding"),
      });
    }
    setVisualizations(results);
  }, [hostElement]);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      computeVisualizations();
    });
  }, [computeVisualizations]);

  // Add global outline style and set up IntersectionObserver
  useEffect(() => {
    // Inject global outline style
    const style = document.createElement("style");
    style.textContent = `
      *:not([id="${hostElement.id}"]):not([id="${hostElement.id}"] *) {
        outline: 1px dashed rgba(156, 163, 175, 0.5) !important;
      }
    `;
    document.head.appendChild(style);
    styleRef.current = style;

    // Set up IntersectionObserver for viewport-only rendering
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleElementsRef.current.add(entry.target);
          } else {
            visibleElementsRef.current.delete(entry.target);
          }
        }
        scheduleUpdate();
      },
      { threshold: 0 },
    );
    observerRef.current = observer;

    // Observe all elements on the page
    const allElements = document.querySelectorAll("body *");
    for (const el of allElements) {
      if (!isOwnElement(el, hostElement)) {
        observer.observe(el);
      }
    }

    // Listen for scroll/resize to update positions
    const onUpdate = () => scheduleUpdate();
    document.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);

    return () => {
      document.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      observer.disconnect();
      observerRef.current = null;
      visibleElementsRef.current.clear();

      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, [hostElement, scheduleUpdate]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2147483646,
      }}
    >
      {visualizations.map((vis, i) => {
        const { rect, margin, padding, display } = vis;
        const isFlex = display === "flex" || display === "inline-flex";
        const isGrid = display === "grid" || display === "inline-grid";

        return (
          <div key={i}>
            {/* Margin overlay (orange) */}
            {margin.top > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top - margin.top,
                  left: rect.left,
                  width: rect.width,
                  height: margin.top,
                  backgroundColor: "rgba(251, 146, 60, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {margin.bottom > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.bottom,
                  left: rect.left,
                  width: rect.width,
                  height: margin.bottom,
                  backgroundColor: "rgba(251, 146, 60, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {margin.left > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.left - margin.left,
                  width: margin.left,
                  height: rect.height,
                  backgroundColor: "rgba(251, 146, 60, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {margin.right > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.right,
                  width: margin.right,
                  height: rect.height,
                  backgroundColor: "rgba(251, 146, 60, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Padding overlay (green) */}
            {padding.top > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: padding.top,
                  backgroundColor: "rgba(74, 222, 128, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {padding.bottom > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.bottom - padding.bottom,
                  left: rect.left,
                  width: rect.width,
                  height: padding.bottom,
                  backgroundColor: "rgba(74, 222, 128, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {padding.left > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.left,
                  width: padding.left,
                  height: rect.height,
                  backgroundColor: "rgba(74, 222, 128, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}
            {padding.right > 0 && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.right - padding.right,
                  width: padding.right,
                  height: rect.height,
                  backgroundColor: "rgba(74, 222, 128, 0.3)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Flex/Grid badge */}
            {(isFlex || isGrid) && (
              <div
                style={{
                  position: "fixed",
                  top: rect.top + 2,
                  left: rect.left + 2,
                  backgroundColor: isFlex ? "#8b5cf6" : "#06b6d4",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 4px",
                  borderRadius: 3,
                  lineHeight: "14px",
                  pointerEvents: "none",
                }}
              >
                {isFlex ? "flex" : "grid"}
              </div>
            )}
          </div>
        );
      })}

      {/* Status indicator */}
      <div
        style={{
          position: "fixed",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#6b7280",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        Visibility Helper (read-only) — Press Esc to exit
      </div>
    </div>
  );
}
