import { useCallback, useEffect, useState } from "react";

const MAX_STACK = 200;

// Module-level stack so committed visual changes can be reverted even after
// the mode component that applied them has unmounted (e.g. on batch send).
const undoStack: Array<() => void> = [];

export function registerVisualRevert(revert: () => void) {
  undoStack.push(revert);
  if (undoStack.length > MAX_STACK) {
    undoStack.shift();
  }
}

/** Revert all committed visual changes, newest first. */
export function revertAllVisualChanges() {
  while (undoStack.length > 0) {
    undoStack.pop()!();
  }
}

export function useUndo() {
  const [canUndo, setCanUndo] = useState(undoStack.length > 0);

  const pushUndo = useCallback((undo: () => void) => {
    registerVisualRevert(undo);
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const fn = undoStack.pop();
    if (fn) fn();
    setCanUndo(undoStack.length > 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== "z") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
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
