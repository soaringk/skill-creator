#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/data/skill-creator-frontend.pid"
LOG_FILE="$ROOT/data/skill-creator-frontend.log"

mkdir -p "$ROOT/data"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Skill Creator frontend already running with pid $existing_pid"
    exit 0
  fi
fi

cd "$ROOT/frontend"
nohup npm run dev >>"$LOG_FILE" 2>&1 &
disown

sleep 0.5
pid="$(pgrep -f "$ROOT/frontend/node_modules/.bin/vite --host 127.0.0.1 --port 5173" | head -n 1 || true)"

if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
  echo "Frontend did not start. Log: $LOG_FILE" >&2
  sed -n '1,120p' "$LOG_FILE" >&2 || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "$pid" > "$PID_FILE"

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
    echo "Started Skill Creator frontend dev server on 127.0.0.1:5173 with pid $pid"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Frontend exited during startup. Log: $LOG_FILE" >&2
    sed -n '1,120p' "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 1
done

echo "Frontend did not become reachable within 30s. Log: $LOG_FILE" >&2
echo "Log: $LOG_FILE"
exit 1
