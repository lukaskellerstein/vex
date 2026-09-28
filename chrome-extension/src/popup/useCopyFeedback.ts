import { useCallback, useState } from "react";

type CopyState = "idle" | "copied" | "error";

/** Runs a copy and shows its outcome on the button for a moment. */
export function useCopyFeedback(copy: () => Promise<void>) {
  const [state, setState] = useState<CopyState>("idle");
  const run = useCallback(() => {
    copy().then(
      () => setState("copied"),
      (err: unknown) => {
        console.error("Vex: copy failed", err);
        setState("error");
      },
    );
    setTimeout(() => setState("idle"), 1500);
  }, [copy]);
  return { state, run };
}
