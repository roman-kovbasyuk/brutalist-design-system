#!/bin/sh
set -eu
# Match Codex's official app-tools runtime. exec preserves its authorized parent.
observatory_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${CODEX_MCP_NODE_PATH:-}" ] && [ -x "$CODEX_MCP_NODE_PATH" ]; then
  exec "$CODEX_MCP_NODE_PATH" "$observatory_dir/server.mjs"
fi
exec node "$observatory_dir/server.mjs"
