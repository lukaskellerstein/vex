import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingRect, SelectionState } from "../../shared/types";

function isOwnElement(el: Element, hostId: string): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.id === hostId) return true;
    node = node.parentElement;
  }
  return false;
}

function elementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return tag + "#" + el.id;
  if (el.classList.length) return tag + "." + el.classList[0];
  return tag;
}

export interface HoverInfo {
  rect: BoundingRect;
  label: string;
  element: Element;
}

export function useHoverHighlight(
  state: SelectionState,
  hostId: string,
) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoveredRef = useRef<Element | null>(null);

  const checkElement = useCallback(
    (el: Element | null): boolean => {
      return Boolean(el && !isOwnElement(el, hostId));
    },
    [hostId],
  );

  useEffect(() => {
    if (state !== "idle") {
      setHover(null);
      hoveredRef.current = null;
      return;
    }

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !checkElement(el)) {
        setHover(null);
        hoveredRef.current = null;
        return;
      }
      hoveredRef.current = el;
      const rect = el.getBoundingClientRect();
      setHover({
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        label: elementLabel(el),
        element: el,
      });
    };

    const onScroll = () => {
      if (hoveredRef.current) {
        const rect = hoveredRef.current.getBoundingClientRect();
        setHover((prev) =>
          prev
            ? {
                ...prev,
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
              }
            : null,
        );
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [state, checkElement]);

  return { hover, hoveredRef, isOwnElement: (el: Element) => isOwnElement(el, hostId) };
}
