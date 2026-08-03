#!/usr/bin/env bash
#
# dev-setup.sh — Start all Vex components as separate processes for development.
#
# Each component runs in the foreground with prefixed output so you can
# see which process is logging what. Ctrl+C stops everything.
#
# Usage:
#   ./dev-setup.sh                          # default ports
#   ./dev-setup.sh --ao-port 9000           # custom AO port
#   ./dev-setup.sh --nats-port 5222         # custom NATS port
#   ./dev-setup.sh --with-chrome            # also launch Chrome (extension testing)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults
AO_PORT=8420
NATS_PORT=4222
NATS_WS_PORT=4223
WITH_CHROME=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ao-port)
      AO_PORT="$2"
      shift 2
      ;;
    --nats-port)
      NATS_PORT="$2"
      shift 2
      ;;
    --nats-ws-port)
      NATS_WS_PORT="$2"
      shift 2
      ;;
    --with-chrome)
      WITH_CHROME=true
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# --- Resolve NATS binary ---
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"

case "${PLATFORM}-${ARCH}" in
  Linux-x86_64) NATS_DIR="linux-amd64" ;;
  Darwin-arm64) NATS_DIR="darwin-arm64" ;;
  Darwin-x86_64) NATS_DIR="darwin-x64" ;;
  *)
    echo "Unsupported platform: ${PLATFORM}-${ARCH}"
    exit 1
    ;;
esac

NATS_BIN="${ROOT_DIR}/electron-app/bin/${NATS_DIR}/nats-server"
if [[ ! -x "$NATS_BIN" ]]; then
  echo "NATS binary not found at: $NATS_BIN"
  echo "Falling back to system nats-server..."
  NATS_BIN="$(command -v nats-server 2>/dev/null || true)"
  if [[ -z "$NATS_BIN" ]]; then
    echo "ERROR: nats-server not found. Install it or check electron-app/bin/"
    exit 1
  fi
fi

# --- Directories ---
LOG_DIR="/tmp/vex-logs"
TMP_DIR="/tmp/vex"
mkdir -p "$LOG_DIR" "$TMP_DIR"

# Truncate old logs
: >"$LOG_DIR/nats.log"
: >"$LOG_DIR/ao.log"
: >"$LOG_DIR/vite.log"
: >"$LOG_DIR/electron.log"
: >"$LOG_DIR/chrome.log"

NATS_CONF="${TMP_DIR}/nats-dev.conf"
cat >"$NATS_CONF" <<EOF
listen: 0.0.0.0:${NATS_PORT}
max_payload: 8388608

websocket {
  listen: "0.0.0.0:${NATS_WS_PORT}"
  no_tls: true
}
EOF

# --- Cleanup on exit ---
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Kill any remaining child processes (tee, sed, etc.)
  pkill -P $$ 2>/dev/null || true
  sleep 0.5
  # Force-kill stragglers
  pkill -9 -P $$ 2>/dev/null || true
  wait 2>/dev/null
  echo "All processes stopped."
}

trap cleanup EXIT INT TERM

# --- Helper: run with prefix, tee to log file ---
# Usage: run_prefixed "prefix" "logfile" command args...
# Uses process substitution so $! captures the actual process PID,
# not the PID of a pipeline stage (tee/sed).
run_prefixed() {
  local prefix="$1"
  local logfile="$2"
  shift 2
  "$@" > >(tee -a "$logfile" | sed "s/^/[${prefix}] /") 2>&1 &
  PIDS+=($!)
}

echo "=== Vex Development Environment ==="
echo "  NATS:                port ${NATS_PORT} (ws: ${NATS_WS_PORT})"
echo "  Agent Orchestrator:  port ${AO_PORT}"
echo "  Vite (HMR):          port 5199"
echo "  Electron:            standalone + dev mode (devtools: 9222)"
if [[ "$WITH_CHROME" == true ]]; then
  echo "  Chrome:              devtools port 9333"
fi
echo ""
echo "  Log files:"
echo "    /tmp/vex-logs/nats.log"
echo "    /tmp/vex-logs/ao.log"
echo "    /tmp/vex-logs/vite.log"
echo "    /tmp/vex-logs/electron.log"
if [[ "$WITH_CHROME" == true ]]; then
  echo "    /tmp/vex-logs/chrome.log"
fi
echo ""

# --- 1. Start NATS ---
# Kill any stale process on the NATS ports from a previous run
for port in "$NATS_PORT" "$NATS_WS_PORT"; do
  if lsof -ti ":${port}" >/dev/null 2>&1; then
    echo "Killing stale process on port ${port}..."
    lsof -ti ":${port}" | xargs kill 2>/dev/null || true
    sleep 0.5
  fi
done
echo "Starting NATS server..."
run_prefixed "nats" "$LOG_DIR/nats.log" "$NATS_BIN" -c "$NATS_CONF"
sleep 1

# --- 2. Start Agent Orchestrator ---
# Kill any stale process on the AO port from a previous run
if lsof -ti ":${AO_PORT}" >/dev/null 2>&1; then
  echo "Killing stale process on port ${AO_PORT}..."
  lsof -ti ":${AO_PORT}" | xargs kill 2>/dev/null || true
  sleep 0.5
fi
echo "Starting Agent Orchestrator..."
AO_DIR="${ROOT_DIR}/agent-orchestrator"
AO_PYTHON="${AO_DIR}/.venv/bin/python"
if [[ ! -x "$AO_PYTHON" ]]; then
  echo "Python venv not found. Running: cd agent-orchestrator && uv sync"
  (cd "$AO_DIR" && uv sync)
fi
run_prefixed " ao " "$LOG_DIR/ao.log" "$AO_PYTHON" -m uvicorn agent_orchestrator.main:app --reload --port "$AO_PORT"

# Wait for AO to be healthy
echo "Waiting for Agent Orchestrator..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${AO_PORT}/api/health" >/dev/null 2>&1; then
    echo "Agent Orchestrator is ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "WARNING: Agent Orchestrator health check timed out."
  fi
  sleep 0.5
done

# --- 3. Build main process & start Vite dev server ---
ELECTRON_DIR="${ROOT_DIR}/electron-app"
VITE_PORT=5199

# Ensure Electron dependencies are installed
if [[ ! -d "$ELECTRON_DIR/node_modules" ]]; then
  echo "Installing Electron app dependencies..."
  (cd "$ELECTRON_DIR" && npm install)
fi

# Compile TypeScript (main process needs this; renderer output is unused in dev mode)
echo "Compiling Electron TypeScript..."
(cd "$ELECTRON_DIR" && npx tsc 2>&1 | sed 's/^/[build] /')

# Kill any stale process on the Vite port from a previous run
if lsof -ti ":${VITE_PORT}" >/dev/null 2>&1; then
  echo "Killing stale process on port ${VITE_PORT}..."
  lsof -ti ":${VITE_PORT}" | xargs kill 2>/dev/null || true
  sleep 0.5
fi

# Start Vite dev server for the renderer (HMR enabled)
echo "Starting Vite dev server on port ${VITE_PORT}..."
(cd "$ELECTRON_DIR" && npx vite --port "$VITE_PORT" --strict-port) > >(tee -a "$LOG_DIR/vite.log" | sed "s/^/[vite] /") 2>&1 &
PIDS+=($!)

# Wait for Vite to be ready
echo "Waiting for Vite dev server..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${VITE_PORT}" >/dev/null 2>&1; then
    echo "Vite dev server is ready."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "WARNING: Vite dev server health check timed out."
  fi
  sleep 0.5
done

# --- 4. Start Electron ---
# Kill any stale process on the devtools port from a previous run
DEVTOOLS_PORT=9222
if lsof -ti ":${DEVTOOLS_PORT}" >/dev/null 2>&1; then
  echo "Killing stale process on port ${DEVTOOLS_PORT}..."
  lsof -ti ":${DEVTOOLS_PORT}" | xargs kill 2>/dev/null || true
  sleep 0.5
fi
echo "Starting Electron app (standalone + dev mode)..."
run_prefixed "elec" "$LOG_DIR/electron.log" npx --prefix "$ELECTRON_DIR" electron --no-sandbox --remote-debugging-port=9222 "$ELECTRON_DIR/dist/main/index.js" \
  --standalone --dev --ao-port "$AO_PORT" --nats-port "$NATS_PORT" --vite-port "$VITE_PORT"

# --- 5. Start Chrome browser with CDP (opt-in, for Chrome-extension testing) ---
if [[ "$WITH_CHROME" == true ]]; then
  CHROME_CDP_PORT=9333
  # Kill any stale process on the Chrome CDP port from a previous run
  if lsof -ti ":${CHROME_CDP_PORT}" >/dev/null 2>&1; then
    echo "Killing stale process on port ${CHROME_CDP_PORT}..."
    lsof -ti ":${CHROME_CDP_PORT}" | xargs kill 2>/dev/null || true
    sleep 0.5
  fi

  # Find Chrome/Chromium binary
  CHROME_BIN=""
  for candidate in \
    google-chrome \
    google-chrome-stable \
    chromium \
    chromium-browser \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
      CHROME_BIN="$candidate"
      break
    fi
  done

  if [[ -z "$CHROME_BIN" ]]; then
    echo "WARNING: Chrome/Chromium not found. Skipping browser launch."
  else
    echo "Starting Chrome with CDP on port ${CHROME_CDP_PORT}..."
    "$CHROME_BIN" \
      --remote-debugging-port="${CHROME_CDP_PORT}" \
      --user-data-dir="/tmp/vex-chrome-profile" \
      --no-first-run \
      --no-default-browser-check \
      > >(tee -a "$LOG_DIR/chrome.log" | sed "s/^/[chrome] /") 2>&1 &
    PIDS+=($!)
  fi
fi

echo ""
echo "=== All services running. Press Ctrl+C to stop. ==="
echo ""

# Wait for all background processes
wait
