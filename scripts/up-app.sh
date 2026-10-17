#!/usr/bin/env bash
# The new app shell (app/) for a person to look at, beside the local stand of up-local.sh: a vite dev server
# in a container on the stand's network, talking to the stand's node. Nothing on the host (rule 12).
#
#   scripts/up-app.sh        # up on http://127.0.0.1:5174
#   scripts/up-app.sh down
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
name=xor-local-app
docker rm -f "$name" >/dev/null 2>&1 || true
[[ "${1:-}" == down ]] && exit 0
docker network inspect xor-local-sosed_default >/dev/null 2>&1 || { echo "no local stand: scripts/up-local.sh first" >&2; exit 1; }
# node_modules: the same volume check-app.sh fills, keyed by the lock file
vol="app-node-modules-$(sha1sum "$root/app/package-lock.json" | cut -c1-12)"
docker volume inspect "$vol" >/dev/null 2>&1 || { echo "no $vol: scripts/check-app.sh first" >&2; exit 1; }
# the stand's storefront key (public, the one its web page is built with); the app's default is the e2e one
key="$(docker inspect xor-local-sosed-web-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^VITE_API_KEY=//p')"
docker run -d --name "$name" -e VITE_API_KEY="$key" --user 1000:1000 -v "$vol:/repo/app/node_modules" --network xor-local-sosed_default \
  -p 127.0.0.1:5174:5174 -e APP_NODE_URL=http://node:8080 \
  -v "$root:/repo" -w /repo/app node:20-alpine npm run dev >/dev/null
for _ in $(seq 30); do
  if docker exec "$name" wget -qO- http://127.0.0.1:5174/ >/dev/null 2>&1; then echo "app: http://127.0.0.1:5174"; exit 0; fi
  sleep 1
done
docker logs "$name" 2>&1 | tail -20; exit 1
