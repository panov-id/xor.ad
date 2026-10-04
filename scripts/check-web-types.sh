#!/usr/bin/env bash
# The web face's types: tsc --noEmit over web/, in a container (rule 12).
#
# Nothing else checked them: the stand builds the page with a bare
# `npx vite build` (docker-compose.web.yml), which strips types without reading
# them, and check-all had no web tsc at all (W16-D1, 04.10.2026).
#
# The web imports depth/core, so the whole repository is mounted and both
# depth and web get their node_modules — from volumes keyed by each lock file,
# filled once. A run that cannot resolve its own modules is not a red: it says
# nothing about the code. Such a run is reported apart, with exit 2 —
# massive TS2307 "Cannot find module" is how it shows (measured: web/ mounted
# alone gave 109 errors, 73 of them TS2307, on a tree with none).
#
#   scripts/check-web-types.sh     exit 0 green, 1 type errors, 2 spoiled run
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_image="node:24.21.0-alpine"
web_lock="$(sha1sum "$root/web/package-lock.json" | cut -c1-12)"
depth_lock="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
log="$(mktemp)"; trap 'rm -f "$log"' EXIT

timeout 600 docker run --rm \
  -v "$root":/repo \
  -v "web-types-modules-$web_lock":/repo/web/node_modules \
  -v "depth-node-modules-$depth_lock":/repo/depth/node_modules \
  -w /repo "$node_image" sh -c '
    for d in depth web; do
      [ -f "$d/node_modules/.lock-ok" ] || { (cd "$d" && npm ci --no-audit --no-fund >/dev/null 2>&1) && touch "$d/node_modules/.lock-ok"; } ||
        { echo "SPOILED: npm ci in $d failed"; exit 0; }
    done
    cd web && npx tsc --noEmit -p .' >"$log" 2>&1
code=$?

errors=$(grep -c 'error TS' "$log")
missing=$(grep -c 'error TS2307' "$log")
if grep -q '^SPOILED' "$log" || [ "$missing" -ge 5 ] || { [ "$code" -ne 0 ] && [ "$errors" -eq 0 ]; }; then
  grep -m3 -E '^SPOILED|error TS2307' "$log" | sed 's/^/  /'
  [ "$errors" -eq 0 ] && tail -5 "$log" | sed 's/^/  /'
  echo "брак прогона tsc веба: модули не разрешились (TS2307: $missing, выход $code) — о коде это ничего не говорит"
  exit 2
fi
if [ "$errors" -gt 0 ]; then
  grep 'error TS' "$log" | head -10 | sed 's/^/  ✗ web\//'
  [ "$errors" -gt 10 ] && echo "  … и ещё $((errors - 10))"
  echo "tsc веба, ошибок: $errors"
  exit 1
fi
echo "tsc веба, ошибок: 0"
