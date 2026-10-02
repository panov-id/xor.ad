#!/usr/bin/env bash
# The probe of scripts/check-web-design.sh: the gate must go red when every
# screen's padding moves by 8 (the break drawn by the page, WEB_BREAK=pad8 in
# shoot-web.mjs), and name the shots that grew; and stay green on the shots
# its baseline was taken from. Since 02.10.2026 each shoot is both brands
# against panel/design/sheets-sosed and sheets-neighbro: four stands, ~30 min.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0
# PROBE_REUSE=1 takes the shots already in place instead of shooting again
# (to see a break of the gate itself red without two more stands).
reuse() { [ -n "${PROBE_REUSE:-}" ] && [ -f "$root/$1/shots.tsv" ]; }

echo "== clean shoot"
reuse testing/screenshots/web-probe-clean || SHOTS_OUT=testing/screenshots/web-probe-clean "$root/scripts/design/shoot-web.sh" >/dev/null || { echo "✗ clean shoot failed"; exit 1; }
out="$(SHOTS_OUT=testing/screenshots/web-probe-clean "$root/scripts/check-web-design.sh")"; code=$?
if [ "$code" = 0 ]; then echo "✓ clean: green — $(printf '%s' "$out" | tail -1)"; else echo "✗ clean shots went red:"; printf '%s\n' "$out"; fail=1; fi

echo "== write-baseline only lowers"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk -F'\t' 'BEGIN { OFS = "\t" } /^sosed-Feed-dark\t/ { $2 = "0.00"; $3 = "0" } /^sosed-Arrival-dark\t/ { $2 = "99.00"; $3 = "999" } { print }' \
  "$root/scripts/design/web-design-baseline.tsv" > "$tmp"
WEB_DESIGN_BASELINE="$tmp" SHOTS_OUT=testing/screenshots/web-probe-clean "$root/scripts/check-web-design.sh" --write-baseline >/dev/null
feed="$(grep -P '^sosed-Feed-dark\t' "$tmp")"; splash="$(grep -P '^sosed-Arrival-dark\t' "$tmp" | cut -f2)"
if [ "$feed" = "$(printf 'sosed-Feed-dark\t0.00\t0')" ] && awk -v s="$splash" 'BEGIN { exit !(s < 99) }'; then
  echo "✓ write-baseline: a lower line kept (sosed-Feed-dark 0.00 0), a higher one lowered (sosed-Arrival-dark 99.00 → $splash)"
else
  echo "✗ write-baseline raised or kept the bar: sosed-Feed-dark «$feed», sosed-Arrival-dark $splash (was 99.00)"; fail=1
fi

echo "== broken shoot: padding +8"
reuse testing/screenshots/web-probe-break || WEB_BREAK=pad8 SHOTS_OUT=testing/screenshots/web-probe-break "$root/scripts/design/shoot-web.sh" >/dev/null || { echo "✗ broken shoot failed"; exit 1; }
out="$(SHOTS_OUT=testing/screenshots/web-probe-break "$root/scripts/check-web-design.sh")"; code=$?
if [ "$code" = 1 ] && printf '%s' "$out" | grep -q 'выросло'; then
  echo "✓ padding +8: red — $(printf '%s' "$out" | tail -1)"
  printf '%s\n' "$out" | grep '✗ ' | head -5 | sed 's/^/    /'
else
  echo "✗ padding +8 did not turn the gate red (code $code):"; printf '%s\n' "$out"; fail=1
fi
exit "$fail"
