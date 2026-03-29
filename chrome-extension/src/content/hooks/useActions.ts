import { useCallback, useRef, useState } from "react";
import type { Action, InteractionMode } from "../../shared/types";

export function useActions() {
  const [actions, setActions] = useState<Action[]>([]);
  const [mode, setMode] = useState<InteractionMode>("select");
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const addAction = useCallback((action: Action) => {
    setActions((prev) => {
      const next = [...prev, action];
      actionsRef.current = next;
      return next;
    });
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      actionsRef.current = next;
      return next;
    });
  }, []);

  const updateInstruction = useCallback(
    (index: number, instruction: string) => {
      setActions((prev) => {
        const next = prev.map((action, i) => {
          if (i !== index) return action;
          if (action.type === "select") {
            return { ...action, instruction };
          }
          return action;
        });
        actionsRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearActions = useCallback(() => {
    setActions([]);
    actionsRef.current = [];
  }, []);

  return {
    actions,
    mode,
    actionsRef,
    addAction,
    removeAction,
    updateInstruction,
    clearActions,
    setMode,
  };
}
