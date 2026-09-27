#!/usr/bin/env bash
# The probe of scripts/check-web-design.sh: the gate must go red when every
# screen's padding moves by 8 (the break drawn by the page, WEB_BREAK=pad8 in
# shoot-web.mjs), and name the shots that grew; and stay green on the shots
# its baseline was taken from. Two shoots on stands of their own, ~16 min.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

echo "== clean shoot"
SHOTS_OUT=testing/screenshots/web-probe-clean "$root/scripts/design/shoot-web.sh" >/dev/null || { echo "✗ clean shoot failed"; exit 1; }
out="$(SHOTS_OUT=testing/screenshots/web-probe-clean "$root/scripts/check-web-design.sh")"; code=$?
if [ "$code" = 0 ]; then echo "✓ clean: green — $(printf '%s' "$out" | tail -1)"; else echo "✗ clean shots went red:"; printf '%s\n' "$out"; fail=1; fi

echo "== broken shoot: padding +8"
WEB_BREAK=pad8 SHOTS_OUT=testing/screenshots/web-probe-break "$root/scripts/design/shoot-web.sh" >/dev/null || { echo "✗ broken shoot failed"; exit 1; }
out="$(SHOTS_OUT=testing/screenshots/web-probe-break "$root/scripts/check-web-design.sh")"; code=$?
if [ "$code" = 1 ] && printf '%s' "$out" | grep -q 'выросло'; then
  echo "✓ padding +8: red — $(printf '%s' "$out" | tail -1)"
  printf '%s\n' "$out" | grep '✗ ' | head -5 | sed 's/^/    /'
else
  echo "✗ padding +8 did not turn the gate red (code $code):"; printf '%s\n' "$out"; fail=1
fi
exit "$fail"
