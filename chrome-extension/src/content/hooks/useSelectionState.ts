import { useCallback, useRef, useState } from "react";
import type { Selection, SelectionState } from "../../shared/types";

export function useSelectionState() {
  const [state, setState] = useState<SelectionState>("inactive");
  const [selections, setSelections] = useState<Selection[]>([]);
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;

  const activate = useCallback(() => setState("idle"), []);
  const deactivate = useCallback(() => setState("inactive"), []);

  const toggle = useCallback(() => {
    setState((prev) => (prev === "inactive" ? "idle" : "inactive"));
  }, []);

  const enterSelected = useCallback(() => setState("selected"), []);
  const exitSelected = useCallback(() => setState("idle"), []);

  const addSelection = useCallback((sel: Selection) => {
    setSelections((prev) => {
      const next = [...prev, sel];
      selectionsRef.current = next;
      return next;
    });
  }, []);

  const removeSelectionAt = useCallback((index: number) => {
    setSelections((prev) => {
      const next = prev.filter((_, i) => i !== index);
      selectionsRef.current = next;
      return next;
    });
  }, []);

  const clearSelections = useCallback(() => {
    setSelections([]);
    selectionsRef.current = [];
  }, []);

  return {
    state,
    selections,
    selectionsRef,
    activate,
    deactivate,
    toggle,
    enterSelected,
    exitSelected,
    addSelection,
    removeSelectionAt,
    clearSelections,
  };
}
