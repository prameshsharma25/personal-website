#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_ROOT"
export PATH="$PROJECT_ROOT/.local/node/bin:$PATH"
export npm_config_cache="$PROJECT_ROOT/.local/npm-cache"
export NEXT_TELEMETRY_DISABLED=1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22 or place it in .local/node." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  exec npm run dev -- --hostname 127.0.0.1
fi
exec npm "$@"
