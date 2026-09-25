#!/usr/bin/env bash
# Contrast of both storefronts' colour tokens, both themes, every accent, by
# arithmetic — the landing's own counter (landing/check-contrast.mjs) run from
# here so that check-all sees it. Until 2026-09-18 that counter was called by
# nothing: not the deploy, not CI, not check-all — and it skipped the status
# colours, so --ok sat at 1.48:1 in the light theme while it printed "every pair
# passes". Runs in the Node image; nothing on the host.
#
#   scripts/check-storefront-contrast.sh            # both storefronts
#   STOREFRONTS="sosed.place" scripts/check-storefront-contrast.sh
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/group-root.sh"; root="$(group_root "$(dirname "${BASH_SOURCE[0]}")/..")"
failed=0; checked=0
for name in ${STOREFRONTS:-sosed.place neighbro.place}; do
  landing="${STOREFRONT_LANDING_DIR:-$root/$name/landing}"
  [ -f "$landing/check-contrast.mjs" ] || { echo "✗ $name: нет landing/check-contrast.mjs" >&2; failed=$((failed + 1)); continue; }
  echo "== $name"
  checked=$((checked + 1))
  docker run --rm -v "$landing":/landing:ro -w /landing node:22-alpine node check-contrast.mjs || failed=$((failed + 1))
done
[ "$checked" -gt 0 ] || { echo "✗ витрин проверено: 0 — проверять было нечего" >&2; exit 3; }
if [ "$failed" -gt 0 ]; then echo "✗ витрин с провалом контраста: $failed"; exit 1; fi
echo "витрин проверено: $checked — каждая пара токенов выше порога"
