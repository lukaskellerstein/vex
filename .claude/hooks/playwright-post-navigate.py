#!/usr/bin/env python3
"""PostToolUse hook: park Playwright browser windows out of the way.

Finds every Playwright-spawned browser window (verified through the process
ancestry, so hand-opened browsers are left alone) that is not already on the
scratch workspace, and moves it there -- i3 workspace 100-120 on Linux, the
`playwright` space on macOS. Windows that cannot be moved (yabai without its
scripting addition) are floated instead so they at least stop disturbing the
tiling layout.
"""

import sys
import time

import wm

WINDOW_APPEAR_DELAY = 0.5  # seconds to wait for a freshly spawned window


def main() -> None:
    manager = wm.detect()
    if manager.name == "none":
        sys.exit(0)

    focus = manager.focus_token()

    time.sleep(WINDOW_APPEAR_DELAY)

    # The Vex dev environment parks its Electron window on its own space (see
    # dev-env.py). That window has npx/node in its ancestry, so it looks
    # Playwright-owned -- without this it would be dragged straight off the
    # `vex` space on the first browser_navigate.
    parked = wm.reserved_spaces(manager)

    candidates = [
        window
        for window in manager.browser_windows()
        if window["workspace"] not in parked
        and not manager.is_scratch(window["workspace"])
        and wm.is_playwright_browser(window["pid"])
    ]
    if not candidates:
        sys.exit(0)

    scratch = manager.scratch()
    if scratch is None:
        # No scratch workspace reachable -- float the windows instead.
        for window in candidates:
            manager.stash(window)
    else:
        for window in manager.park(candidates, scratch):
            manager.stash(window)

    manager.restore_focus(focus)
    sys.exit(0)


if __name__ == "__main__":
    main()
