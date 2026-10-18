#!/usr/bin/env bash
# Measures the rendered app/ talks against the Dusk sheets of wave 3 (mobile w3_inbox, w3_likes, w3_match, w3_match-waiting;
# 4 sheets; scripts/design/measure-app-w3.mjs), in containers: build (as check-app.sh), serve the build on an INTERNAL
# docker network (no way out), Playwright Chromium from panel-tests-runner:latest at it. Exit 0 all within 2 px and
# every walk ok, 1 not, 2 spoiled run.
#
#   SHEETS=<dir with w3_*.svg> scripts/measure-app-w3.sh
#   ONLY=inbox scripts/measure-app-w3.sh                                     # some sheets only
#   CSS_OVERRIDE=':root{--tk-row-h:80px}' scripts/measure-app-w3.sh          # positive control: must go red
#
# Shots (390 wide) land in $SHOTS (default: this session's scratchpad shots-w3/).
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pad=/tmp/claude-1000/-home-eugene-panov-Projects-panov-id-xor-ad/39d2bcd4-67ff-42f5-80ec-45795e475b7a/scratchpad
sheets="${SHEETS:-$pad/nd2/sosed-4-static-waves3-4/sosed-static/mobile}"
shots="${SHOTS:-$pad/shots-w3}"
node_image="node:24.21.0-alpine"
runner="panel-tests-runner:latest"
[ -f "$sheets/w3_inbox.svg" ] || { echo "measure-app-w3: SPOILED — no w3_*.svg in $sheets (SHEETS=)"; exit 2; }
[ -f "$root/app/package-lock.json" ] || { echo "measure-app-w3: SPOILED — app/package-lock.json missing"; exit 2; }
vol="app-node-modules-$(sha1sum "$root/app/package-lock.json" | cut -c1-12)"
depth_vol="depth-node-modules-$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"   # depth/core's own deps (hash-wasm)
for v in "$vol" "$depth_vol"; do docker volume create "$v" >/dev/null; docker run --rm -v "$v":/m alpine:3 chown "$(id -u):$(id -g)" /m; done
out="$(mktemp -d)"; chmod 777 "$out"; mkdir -p "$shots"
net="measure-w3-$$"; srv="measure-w3-srv-$$"
cleanup() { docker rm -f "$srv" >/dev/null 2>&1; docker network rm "$net" >/dev/null 2>&1; rm -rf "$out"; }
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM

echo "== build (vite build, as check-app.sh)"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -w /repo/app "$node_image" sh -c '
    [ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && touch node_modules/.lock-ok; } || { echo "SPOILED: npm ci failed"; exit 3; }
    [ -f ../depth/node_modules/.lock-ok ] || { (cd ../depth && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch ../depth/node_modules/.lock-ok; } || { echo "SPOILED: npm ci in depth failed"; exit 3; }
    npx vite build --outDir /out/dist --emptyOutDir >/dev/null' || { echo "measure-app-w3: SPOILED (build failed)"; exit 2; }

echo "== serve: preview :4174 (the build, with its CSP); network $net has no way out"
docker network create --internal "$net" >/dev/null
docker run -d --name "$srv" --network "$net" --network-alias app --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -w /repo/app "$node_image" \
  sh -c 'npx vite preview --outDir /out/dist --host 0.0.0.0 --port 4174' >/dev/null || { echo "measure-app-w3: SPOILED (serve)"; exit 2; }

run() {   # $1 locale tag, $2 1 = compare with the sheets (they are English), 0 = fonts, overflow, walks, CSP only
  docker run --rm --network "container:$srv" -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$root/scripts/design/measure-app-w3.mjs":/tests/measure-app-w3.mjs:ro -v "$root/scripts/design/sheet-geometry.mjs":/tests/sheet-geometry.mjs:ro \
    -v "$sheets":/sheets:ro -v "$shots":/shots -w /tests \
    -e CSS_OVERRIDE="${CSS_OVERRIDE:-}" -e LANG_TAG="$1" -e GEOMETRY="$2" -e ONLY="${ONLY:-}" \
    --entrypoint node "$runner" measure-app-w3.mjs
}
echo "== measure: en-US against the sheets (they are in English), then ru-RU for the Cyrillic face and the longer words"
run en-US 1; rc1=$?
run ru-RU 0; rc2=$?
{ [ "$rc1" -eq 2 ] || [ "$rc2" -eq 2 ]; } && exit 2
[ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ]
