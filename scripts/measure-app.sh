#!/usr/bin/env bash
# Measures the rendered app/ screens (splash, splash-lang, loading, register-1..3, unlock, locked, the move and away) against the Dusk sheets, in containers:
# build (as check-app.sh), serve the build and the dev server on an INTERNAL docker network (no way out),
# Playwright Chromium from panel-tests-runner:latest at them. Exit 0 all within 2 px, 1 not, 2 spoiled run.
#
#   SHEETS=<dir with w2_*.svg and w1_register-*.svg> scripts/measure-app.sh
#   INTEROP=0 scripts/measure-app.sh     skip the web build and the web<->app identity walks (default: on)
#   CSS_OVERRIDE=':root{--splash-hero-top:134px}' scripts/measure-app.sh     # positive control: must go red
#
# Shots (390 wide, 0.5 scale) land in $SHOTS (default: the session scratchpad's shots/).
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pad=/tmp/claude-1000/-home-eugene-panov-Projects-panov-id-xor-ad/39d2bcd4-67ff-42f5-80ec-45795e475b7a/scratchpad
sheets="${SHEETS:-$pad/nd2/sosed-3-static-waves1-2/sosed-static/mobile}"
shots="${SHOTS:-$pad/shots}"
node_image="node:24.21.0-alpine"
runner="panel-tests-runner:latest"
[ -f "$sheets/w2_splash.svg" ] || { echo "measure-app: SPOILED — no sheets in $sheets (SHEETS=)"; exit 2; }
[ -f "$sheets/w1_register-3.svg" ] || { echo "measure-app: SPOILED — no w1_register-*.svg in $sheets (SHEETS=)"; exit 2; }
[ -f "$root/app/package-lock.json" ] || { echo "measure-app: SPOILED — app/package-lock.json missing"; exit 2; }
lock="$(sha1sum "$root/app/package-lock.json" | cut -c1-12)"
vol="app-node-modules-$lock"
docker volume create "$vol" >/dev/null
docker run --rm -v "$vol":/m alpine:3 chown "$(id -u):$(id -g)" /m
# depth/core imports hash-wasm from depth/node_modules: a volume keyed by depth's lock (as check-app.sh), never the host's tree.
depth_vol="depth-node-modules-$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
docker volume create "$depth_vol" >/dev/null
docker run --rm -v "$depth_vol":/m alpine:3 chown "$(id -u):$(id -g)" /m
out="$(mktemp -d)"; chmod 777 "$out"; mkdir -p "$shots"
net="measure-app-$$"; srv="measure-app-srv-$$"
cleanup() { docker rm -f "$srv" >/dev/null 2>&1; docker network rm "$net" >/dev/null 2>&1; rm -rf "$out"; }
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM

echo "== build (vite build, as check-app.sh)"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -w /repo/app "$node_image" sh -c '
    [ -f ../depth/node_modules/.lock-ok ] || { (cd ../depth && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch ../depth/node_modules/.lock-ok; } || { echo "SPOILED: npm ci in depth failed"; exit 3; }
    [ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && touch node_modules/.lock-ok; } || { echo "SPOILED: npm ci failed"; exit 3; }
    npx vite build --outDir /out/dist --emptyOutDir >/dev/null' || { echo "measure-app: SPOILED (build failed)"; exit 2; }

web_dist=0
if [ "${INTEROP:-1}" != "0" ]; then
  echo "== build the web (interop: an identity made by one face opens in the other)"
  web_lock="$(sha1sum "$root/web/package-lock.json" | cut -c1-12)"; depth_lock="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
  docker volume create "web-types-modules-$web_lock" >/dev/null; docker volume create "depth-node-modules-$depth_lock" >/dev/null
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
    -v "$root":/repo -v "web-types-modules-$web_lock":/repo/web/node_modules -v "depth-node-modules-$depth_lock":/repo/depth/node_modules -v "$out":/out -w /repo "$node_image" sh -c '
      for d in depth web; do
        [ -f "$d/node_modules/.lock-ok" ] || { (cd "$d" && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch "$d/node_modules/.lock-ok"; } || { echo "SPOILED: npm ci in $d failed"; exit 3; }
      done
      cd web && npx vite build --outDir /out/web-dist --emptyOutDir >/dev/null' && web_dist=1 || echo "measure-app: web build failed — interop will be reported NOT VERIFIED"
fi

echo "== serve: preview :4174 (the build), dev :5174 (for ?boot=, and the stand's waits: VITE_STAND=1), switch :4175 (web or app build, one origin); network $net has no way out"
docker network create --internal "$net" >/dev/null
docker run -d --name "$srv" --network "$net" --network-alias app --user "$(id -u):$(id -g)" -e HOME=/tmp -e VITE_STAND=1 \
  -v "$root":/repo -v "$vol":/repo/app/node_modules -v "$depth_vol":/repo/depth/node_modules -v "$out":/out -v "$root/scripts/design/static-switch.mjs":/static-switch.mjs:ro -w /repo/app "$node_image" sh -c '
    npx vite preview --outDir /out/dist --host 0.0.0.0 --port 4174 & node /static-switch.mjs & npx vite --host 0.0.0.0 --port 5174; wait' >/dev/null || { echo "measure-app: SPOILED (serve)"; exit 2; }

run() {   # $1 locale tag, $2 1 = compare with the sheets (they are English), 0 = fonts, overflow, CSP only
  # the runner shares the server's network namespace: the page is http://localhost (WebCrypto needs a secure context)
  docker run --rm --network "container:$srv" -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "${MEASURE:-$root/scripts/design/measure-app.mjs}":/tests/measure-app.mjs:ro -v "$root/scripts/design/sheet-geometry.mjs":/tests/sheet-geometry.mjs:ro \
    -v "$sheets":/sheets:ro -v "$shots":/shots -w /tests \
    -e CSS_OVERRIDE="${CSS_OVERRIDE:-}" -e LANG_TAG="$1" -e GEOMETRY="$2" -e WEB_BUILT="$web_dist" \
    --entrypoint node "$runner" measure-app.mjs
}
echo "== measure: en-US against the sheets (they are in English), then ru-RU for the Cyrillic face and the longer words"
run en-US 1; rc1=$?
run ru-RU 0; rc2=$?
[ "$rc1" -eq 2 ] || [ "$rc2" -eq 2 ] && exit 2
[ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ]
