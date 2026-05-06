#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/data/skill-creator-frontend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No pid file found; frontend is not managed by this script."
  exit 0
fi

pid="$(cat "$PID_FILE")"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "Stopped Skill Creator frontend pid $pid"
else
  echo "Pid $pid is not running."
fi

rm -f "$PID_FILE"
