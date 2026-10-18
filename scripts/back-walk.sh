#!/usr/bin/env bash
# Walks the feed card's «back» in the real app/ (scripts/design/back-walk.mjs, 9 checks: open/Back, the card's own back,
# two cards in a row, double tap, reload inside the grace, reload past it with the PIN), in containers:
# build (as measure-app.sh), serve the build (:4174) and the stand's dev server (:5174, VITE_STAND=1) on an INTERNAL
# docker network (no way out), Playwright Chromium from panel-tests-runner:latest at them, the node a stub in the page.
# Exit 0 all pass, 1 a check failed, 2 spoiled run.
#
#   scripts/back-walk.sh
#   ROOT=<a copy of the tree> scripts/back-walk.sh     break-run against a copy (app/ and depth/ are built from ROOT)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="${ROOT:-$here}"
walk="$here/scripts/design/back-walk.mjs"
node_image="node:24.21.0-alpine"
runner="panel-tests-runner:latest"
[ -f "$root/app/package-lock.json" ] || { echo "back-walk: SPOILED — $root/app/package-lock.json missing"; exit 2; }
[ -f "$walk" ] || { echo "back-walk: SPOILED — $walk missing"; exit 2; }
lock="$(sha1sum "$root/app/package-lock.json" | cut -c1-12)"
vol="app-node-modules-$lock"
docker volume create "$vol" >/dev/null
docker run --rm -v "$vol":/m alpine:3 chown "$(id -u):$(id -g)" /m
# depth/core imports hash-wasm from depth/node_modules: a volume keyed by depth's lock (as measure-app.sh).
depth_vol="depth-node-modules-$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
docker volume create "$depth_vol" >/dev/null
docker run --rm -v "$depth_vol":/m alpine:3 chown "$(id -u):$(id -g)" /m
out="$(mktemp -d)"; chmod 777 "$out"
net="back-walk-$$"; srv="back-walk-srv-$$"
cleanup() { docker rm -f "$srv" >/dev/null 2>&1; docker network rm "$net" >/dev/null 2>&1; rm -rf "$out"; }
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM

echo "== build (vite build) from $root"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -w /repo/app "$node_image" sh -c '
    [ -f ../depth/node_modules/.lock-ok ] || { (cd ../depth && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch ../depth/node_modules/.lock-ok; } || { echo "SPOILED: npm ci in depth failed"; exit 3; }
    [ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && touch node_modules/.lock-ok; } || { echo "SPOILED: npm ci failed"; exit 3; }
    npx vite build --outDir /out/dist --emptyOutDir >/dev/null' || { echo "back-walk: SPOILED (build failed)"; exit 2; }

echo "== serve: preview :4174 (the build), dev :5174 (VITE_STAND=1: the grace from sessionStorage); network $net has no way out"
docker network create --internal "$net" >/dev/null
docker run -d --name "$srv" --network "$net" --user "$(id -u):$(id -g)" -e HOME=/tmp -e VITE_STAND=1 \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -w /repo/app "$node_image" sh -c '
    npx vite preview --outDir /out/dist --host 0.0.0.0 --port 4174 & npx vite --host 0.0.0.0 --port 5174; wait' >/dev/null || { echo "back-walk: SPOILED (serve)"; exit 2; }

up=0
for i in $(seq 1 90); do
  docker run --rm --network "container:$srv" --entrypoint node "$runner" -e "Promise.all(['http://localhost:4174/','http://localhost:5174/'].map(u=>fetch(u).then(r=>{if(!r.ok)throw 0}))).then(()=>process.exit(0),()=>process.exit(1))" && { up=1; break; }
  sleep 2
done
[ "$up" = 1 ] || { echo "back-walk: SPOILED (servers never answered)"; exit 2; }

docker run --rm --network "container:$srv" -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e PREVIEW_URL=http://localhost:4174 -e DEV_URL=http://localhost:5174 \
  -v "$walk":/tests/back-walk.mjs:ro -w /tests --entrypoint node "$runner" back-walk.mjs
rc=$?
[ "$rc" -le 1 ] || { echo "back-walk: SPOILED (runner rc=$rc)"; exit 2; }
exit "$rc"
