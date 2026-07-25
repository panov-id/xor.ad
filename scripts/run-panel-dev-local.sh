#!/usr/bin/env bash
# Panel dev server against the local relay stand, inside a Node container so
# nothing is installed on the host. Uses the panel's existing node_modules.
#
#   panel  -> http://localhost:<port> (default 5174)
#   relay  -> http://localhost:8081 (start it with relay/local/docker-compose.yml)
#
# Port 5173 is left to docker-compose.panel.yml, which points at the gateway
# instead of the stand — both can run side by side.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${1:-5174}"

docker run --rm --name panel-dev-local \
  -v "$root/panel":/panel \
  -w /panel \
  -e VITE_RELAY_API_URL=http://localhost:8081 \
  -p "$port:$port" \
  node:20-alpine \
  npx vite --host 0.0.0.0 --port "$port"
