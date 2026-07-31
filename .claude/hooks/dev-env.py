#!/usr/bin/env python3
"""Start, inspect, and stop the Vex development environment.

`dev-setup.sh` evicts rather than coexists: it kills whatever holds each of its
ports before claiming them. Two instances therefore cannot run side by side, and
launching blindly would terminate a session someone else is using. `status` is
the guard -- it reports occupancy so the caller can ask before evicting, and
`start` refuses outright unless `--force` says otherwise.

On macOS the Electron window is moved to its own yabai space (labelled `vex`) as
soon as it appears, so the dev app never lands on top of what you are doing.
Every window operation degrades to a no-op when yabai is absent.

Usage:
    dev-env.py status
    dev-env.py start [--no-chrome] [--force]
    dev-env.py stop
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import wm

ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = Path("/tmp/vex-logs")
STATE_FILE = Path("/tmp/vex/dev-env.json")

# Every port dev-setup.sh claims -- and therefore every port it will kill.
PORTS = {
    "NATS": 4222,
    "NATS ws": 4223,
    "Agent Orchestrator": 8420,
    "Vite": 5199,
    "Electron CDP": 9222,
    "Chrome CDP": 9333,
}

WINDOW_TIMEOUT = 90  # seconds to wait for the Electron window to appear
POLL_INTERVAL = 1.0


def port_pids(port: int) -> list[int]:
    """PIDs listening on a TCP port; empty when the port is free."""
    try:
        out = subprocess.run(
            ["lsof", "-ti", f":{port}"], capture_output=True, text=True, timeout=5
        )
    except Exception:
        return []
    return [int(p) for p in out.stdout.split() if p.strip().isdigit()]


def occupancy() -> dict[str, list[int]]:
    """Occupied ports only, keyed by human-readable name."""
    return {name: pids for name, pids in ((n, port_pids(p)) for n, p in PORTS.items()) if pids}


def describe(pid: int) -> str:
    try:
        out = subprocess.run(
            ["ps", "-p", str(pid), "-o", "comm="], capture_output=True, text=True, timeout=5
        )
        return out.stdout.strip() or "?"
    except Exception:
        return "?"


def cmd_status() -> int:
    """Exit 0 when nothing is running, 1 when something holds a port."""
    busy = occupancy()
    if not busy:
        print("Vex dev environment: NOT RUNNING (all ports free)")
        return 0

    print("Vex dev environment: RUNNING")
    for name, pids in busy.items():
        for pid in pids:
            print(f"  {name:<20} port {PORTS[name]:<5} pid {pid:<8} ({describe(pid)})")

    state = read_state()
    if state:
        print(f"\n  started by dev-env.py (pid {state.get('pid')}) at {state.get('started')}")
    else:
        print("\n  not started by dev-env.py -- most likely yours or another agent's")
    print("\n  dev-setup.sh kills these before claiming its ports; restarting evicts them.")
    return 1


def read_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def write_state(pid: int) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(
            json.dumps({"pid": pid, "started": time.strftime("%Y-%m-%d %H:%M:%S")})
        )
    except Exception:
        pass


def window_ids(manager) -> set:
    return {w["id"] for w in manager.browser_windows()}


# Apps dev-setup.sh launches that own a window we want on the vex space.
PLACEMENT_RULES = (
    ("vex-electron", "^Electron$"),
    ("vex-chrome", "^Google Chrome$"),
)


def clear_placement_rules() -> None:
    """Drop placement rules a previous run left behind unmatched."""
    for label, _ in PLACEMENT_RULES:
        wm.run(["yabai", "-m", "rule", "--remove", label])


def add_placement_rules(space: int) -> bool:
    """Send the dev windows straight to `space` at creation time.

    This is what keeps them off your current workspace: yabai applies the rule
    as the window is created, so it is never drawn where you are working and
    then moved. Two details matter --

      --one-shot   each rule fires for the next matching window and deletes
                   itself. A standing `^Google Chrome$` rule would otherwise
                   capture every Chrome window you open by hand.
      space=N      no `^` prefix. With `^` yabai follows the window to its new
                   space, which would drag you off your workspace; without it
                   the window moves and your focus stays put.
    """
    ok = True
    for label, app in PLACEMENT_RULES:
        added = wm.run(
            [
                "yabai", "-m", "rule", "--add", "--one-shot",
                f"label={label}", f"app={app}", f"space={space}",
            ]
        )
        ok = ok and added is not None
    return ok


def wait_for_windows(manager, before: set) -> list[dict]:
    """New browser/Electron windows, once they have stopped arriving."""
    deadline = time.time() + WINDOW_TIMEOUT
    while time.time() < deadline:
        if [w for w in manager.browser_windows() if w["id"] not in before]:
            # Electron and Chrome start seconds apart; let the stragglers land.
            time.sleep(2.0)
            return [w for w in manager.browser_windows() if w["id"] not in before]
        time.sleep(POLL_INTERVAL)
    return []


def settle_windows(manager, before: set, space, focus_before) -> None:
    """Report where the new windows landed, relocating any the rules missed."""
    fresh = wait_for_windows(manager, before)
    if not fresh:
        print(f"  no new window within {WINDOW_TIMEOUT}s")
        return

    strays = [w for w in fresh if w["workspace"] != space] if space is not None else fresh
    if not strays:
        landed = ", ".join(f"{w['app']} (pid {w['pid']})" for w in fresh)
        print(f"  opened directly on space {space} [{wm.VEX_SPACE_LABEL}]: {landed}")
        return

    # A rule did not apply (app name mismatch, or no scripting addition).
    # Fall back to moving the window, then undo the focus change that causes.
    if space is None:
        for window in strays:
            manager.stash(window)
        print("  no space available (yabai scripting addition?) -- floated instead")
    else:
        for window in manager.park(strays, space):
            manager.stash(window)
        moved = ", ".join(f"{w['app']} (pid {w['pid']})" for w in strays)
        print(f"  rule missed, moved after the fact: {moved}")
    manager.restore_focus(focus_before)


def cmd_start(with_chrome: bool, force: bool) -> int:
    busy = occupancy()
    if busy and not force:
        print("REFUSING TO START -- these ports are already in use:")
        for name, pids in busy.items():
            for pid in pids:
                print(f"  {name:<20} port {PORTS[name]:<5} pid {pid} ({describe(pid)})")
        print(
            "\ndev-setup.sh would kill all of them. Confirm with the user that this\n"
            "will not disrupt another agent's work, then re-run with --force."
        )
        return 1

    script = ROOT / "dev-setup.sh"
    if not script.is_file():
        print(f"ERROR: {script} not found")
        return 2

    manager = wm.detect(label=wm.VEX_SPACE_LABEL, adoptable=wm.VEX_ADOPTABLE_LABELS)
    before = window_ids(manager)
    # Captured before anything launches: once the dev windows appear they hold
    # focus, and restoring *that* would be what drags you onto the vex space.
    focus_before = manager.focus_token()

    # The space has to exist before the rules reference it -- yabai resolves the
    # label to an index when the rule is added, not when it fires.
    space = manager.scratch() if manager.name == "yabai" else None
    clear_placement_rules()
    if space is not None and add_placement_rules(space):
        print(f"  windows will open directly on space {space} [{wm.VEX_SPACE_LABEL}]")

    argv = [str(script)] + (["--with-chrome"] if with_chrome else [])
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = LOG_DIR / "dev-setup.log"

    print(f"Starting: {' '.join(argv)}")
    with open(log, "w") as handle:
        # start_new_session detaches it into its own process group, so it
        # outlives this script and `stop` can signal the whole group at once.
        process = subprocess.Popen(
            argv,
            cwd=str(ROOT),
            stdout=handle,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    write_state(process.pid)
    print(f"  pid {process.pid}, log: {log}")

    settle_windows(manager, before, space, focus_before)

    ready = {name: PORTS[name] for name in ("Agent Orchestrator", "Electron CDP")}
    if with_chrome:
        ready["Chrome CDP"] = PORTS["Chrome CDP"]
    for name, port in ready.items():
        state = "up" if port_pids(port) else "NOT UP"
        print(f"  {name:<20} port {port:<5} {state}")

    if process.poll() is not None:
        print(f"\nERROR: dev-setup.sh exited early (code {process.returncode}); see {log}")
        return 3
    return 0


def cmd_stop() -> int:
    clear_placement_rules()
    state = read_state()
    pid = state.get("pid")
    if not pid:
        print("No dev-env.py-managed instance recorded.")
        return cmd_status()

    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
        print(f"Sent SIGTERM to process group {pid}")
    except ProcessLookupError:
        print(f"Process {pid} already gone")
    except Exception as exc:
        print(f"Could not stop {pid}: {exc}")
        return 1

    STATE_FILE.unlink(missing_ok=True)
    time.sleep(1.5)
    leftover = occupancy()
    print("All ports free." if not leftover else f"Still held: {list(leftover)}")

    # Give back the vex space once its windows are gone, so repeated
    # start/stop cycles do not leave a trail of empty spaces behind.
    wm.detect(label=wm.VEX_SPACE_LABEL, adoptable=wm.VEX_ADOPTABLE_LABELS).release_scratch()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="report which dev-environment ports are in use")
    start = sub.add_parser("start", help="start the dev environment")
    start.add_argument(
        "--no-chrome", action="store_true", help="skip Chrome (no extension testing)"
    )
    start.add_argument(
        "--force", action="store_true", help="start even though ports are occupied"
    )
    sub.add_parser("stop", help="stop the instance started by dev-env.py")

    args = parser.parse_args()
    if args.command == "status":
        return cmd_status()
    if args.command == "start":
        return cmd_start(with_chrome=not args.no_chrome, force=args.force)
    return cmd_stop()


if __name__ == "__main__":
    sys.exit(main())
