#!/usr/bin/env bash
set -euo pipefail

PROJECT_NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

if [ -s "${PROJECT_NVM_DIR}/nvm.sh" ]; then
  # npm scripts do not load nvm automatically, so select the project version here.
  . "${PROJECT_NVM_DIR}/nvm.sh"
  nvm use --silent >/dev/null
fi

PROJECT_NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "${PROJECT_NODE_MAJOR}" -lt 22 ]; then
  echo "PatternDrop requires Node.js 22 or newer (current: $(node -v))." >&2
  echo "Install it with: nvm install 22 && nvm use 22" >&2
  exit 1
fi

exec env WRANGLER_LOG_PATH=.wrangler/wrangler.log "$@"
