#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/start-backend.sh"
"$ROOT/scripts/start-frontend-dev.sh"

echo "Skill Creator dev is ready:"
echo "  Frontend: http://127.0.0.1:5173/"
echo "  Backend:  http://127.0.0.1:8010/api/health"
