import { useCallback, useEffect, useRef, useState } from "react";

const MAX_STACK = 50;

export function useUndo() {
  const stackRef = useRef<Array<() => void>>([]);
  const [canUndo, setCanUndo] = useState(false);

  const pushUndo = useCallback((undo: () => void) => {
    stackRef.current.push(undo);
    if (stackRef.current.length > MAX_STACK) {
      stackRef.current.shift();
    }
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const fn = stackRef.current.pop();
    if (fn) fn();
    setCanUndo(stackRef.current.length > 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== "z") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      undo();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [undo]);

  return { pushUndo, undo, canUndo };
}
