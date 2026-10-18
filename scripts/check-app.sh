#!/usr/bin/env bash
# The new shell (app/): token file fresh, types, build — in containers (rule 12).
# node_modules come from a volume keyed by the lock file, filled once.
#
#   scripts/check-app.sh     exit 0 green, 1 a check failed, 2 spoiled run
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_image="node:24.21.0-alpine"
py_image="python:3.13-alpine"
fail=0
step() { echo "== $1"; }

step "app-tokens.py --check"
docker run --rm --user "$(id -u):$(id -g)" -v "$root":/repo:ro -w /repo "$py_image" \
  python3 -I scripts/design/app-tokens.py --check || fail=1

step "no raw px in app/src (sizes live in app/tokens)"
if grep -rEn '[0-9]px' "$root/app/src" --include='*.css' --include='*.ts' --include='*.tsx'; then
  echo "raw px outside app/tokens: add a token to app/tokens/layout.css"; fail=1
fi

if [ ! -f "$root/app/package-lock.json" ]; then
  echo "check-app: SPOILED — app/package-lock.json missing"; echo "check-app: RED (spoiled run)"; exit 2
fi
lock="$(sha1sum "$root/app/package-lock.json" | cut -c1-12)"
vol="app-node-modules-$lock"
docker volume create "$vol" >/dev/null
# the volume is created root-owned; hand it to the runner once
docker run --rm -v "$vol":/m alpine:3 chown "$(id -u):$(id -g)" /m
depth_vol="depth-node-modules-$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"   # depth/core's own deps (hash-wasm): a clean checkout has none
docker volume create "$depth_vol" >/dev/null
docker run --rm -v "$depth_vol":/m alpine:3 chown "$(id -u):$(id -g)" /m

step "tsc --noEmit + vite build"
out="$(mktemp -d)"; trap 'rm -rf "$out"' EXIT
chmod 777 "$out"
timeout 600 docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out \
  -w /repo/app "$node_image" sh -c '
    [ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && touch node_modules/.lock-ok; } || { echo "SPOILED: npm ci failed"; exit 3; }
    [ -f ../depth/node_modules/.lock-ok ] || { (cd ../depth && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch ../depth/node_modules/.lock-ok; } || { echo "SPOILED: npm ci in depth failed"; exit 3; }
    npx tsc --noEmit -p . || exit 1
    npx vite build --outDir /out/dist --emptyOutDir || exit 1
    if grep -rEl "fonts\.(googleapis|gstatic)" /out/dist; then echo "external font URL in dist"; exit 1; fi
  '
rc=$?
[ "$rc" -eq 3 ] && { echo "check-app: RED (spoiled run)"; exit 2; }
[ "$rc" -ne 0 ] && fail=1

if [ "$fail" -ne 0 ]; then echo "check-app: RED"; exit 1; fi
echo "check-app: GREEN (tokens fresh, tsc 0 errors, vite build ok, no external font URLs)"
