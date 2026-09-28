import type { Action, ElementTarget } from "./types";

/** Every element an action points at: the primary one first, then any extras. */
export function actionElements(action: Action): ElementTarget[] {
  if (action.type !== "select") return [];
  return [action, ...(action.extraElements ?? [])];
}

/** Badge text for one element of an action: "3" alone, "3.1", "3.2" in a group. */
export function elementLabel(actionNumber: number, index: number, count: number): string {
  return count > 1 ? `${actionNumber}.${index + 1}` : String(actionNumber);
}
