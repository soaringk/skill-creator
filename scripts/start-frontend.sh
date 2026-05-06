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
npm run build
cd "$ROOT"
setsid -f node scripts/serve-frontend.mjs >"$LOG_FILE" 2>&1

sleep 0.5
pid="$(pgrep -f "node scripts/serve-frontend.mjs" | head -n 1 || true)"

if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
  echo "Frontend did not start. Log: $LOG_FILE" >&2
  sed -n '1,120p' "$LOG_FILE" >&2 || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "$pid" > "$PID_FILE"

for _ in {1..30}; do
  if curl -fsS -H 'Host: kefan.life' http://127.0.0.1:5173/tools/skill-creator/ >/dev/null 2>&1; then
    echo "Started Skill Creator frontend on 127.0.0.1:5173 with pid $pid"
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
