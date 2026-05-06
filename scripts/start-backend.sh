#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/data/skill-creator.pid"
LOG_FILE="$ROOT/data/skill-creator.log"

mkdir -p "$ROOT/data"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Skill Creator backend already running with pid $existing_pid"
    exit 0
  fi
fi

cd "$ROOT"
setsid -f env PYTHONPATH=backend \
  "$ROOT/.venv/bin/uvicorn" skill_creator_service.main:app --host 127.0.0.1 --port 8010 \
  >"$LOG_FILE" 2>&1

sleep 0.2
pid="$(pgrep -f "$ROOT/.venv/bin/uvicorn skill_creator_service.main:app --host 127.0.0.1 --port 8010" | head -n 1 || true)"
if [[ -z "$pid" ]]; then
  echo "Backend did not start. Log: $LOG_FILE" >&2
  sed -n '1,120p' "$LOG_FILE" >&2 || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "$pid" > "$PID_FILE"

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8010/api/health >/dev/null 2>&1; then
    echo "Started Skill Creator backend on 127.0.0.1:8010 with pid $pid"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "Backend exited during startup. Log: $LOG_FILE" >&2
    sed -n '1,120p' "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 1
done

echo "Backend did not become healthy within 30s. Log: $LOG_FILE" >&2
echo "Log: $LOG_FILE"
exit 1
