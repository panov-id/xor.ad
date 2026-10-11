#!/usr/bin/env bash
# The adaptive gate (owner 11.10.2026; docs/design/kit_RU.md §10): reads the walks widths.sh wrote and is
# red when a step failed, a screen scrolls sideways or puts something past the edge, or the feed is not
# the width decided for its screen: 375 on 393, 720 on 768, 1280 on 1440, 1600 on 2560 and 3440.
#   scripts/textwalk/widths.sh <dir> && scripts/textwalk/check-widths.sh <dir>
set -uo pipefail
dir="${1:?dir with <brand>-<width>.txt from widths.sh}"
declare -A want=([393]=375 [768]=720 [1440]=1280 [2560]=1600 [3440]=1600)
red=0; seen=0
for brand in sosed neighbro; do
  for w in 393 768 1440 2560 3440; do
    f="$dir/$brand-$w.txt"
    if [ ! -s "$f" ] || ! grep -q 'WALK END' "$f"; then echo "✗ $brand $w: no finished walk in $f"; red=1; continue; fi
    seen=$((seen + 1))
    n=$(grep -c 'STEP FAILED' "$f"); [ "$n" -eq 0 ] || { echo "✗ $brand $w: $n steps failed — $(grep -m1 'STEP FAILED' "$f" | cut -c1-120)"; red=1; }
    n=$(grep -c 'SIDEWAYS-SCROLL' "$f"); [ "$n" -eq 0 ] || { echo "✗ $brand $w: $n screens scroll sideways"; red=1; }
    n=$(grep -c 'PAST-EDGE' "$f"); [ "$n" -eq 0 ] || { echo "✗ $brand $w: $n screens put something past the edge — $(grep -m1 -o 'PAST-EDGE.*' "$f")"; red=1; }
    n=$(grep -c 'SMALL-TAPS' "$f"); [ "$n" -eq 0 ] || { echo "✗ $brand $w: $n screens with a target under 24×24 (WCAG 2.5.8) — $(grep -m1 -o 'SMALL-TAPS.*' "$f" | cut -c1-120)"; red=1; }
    got=$(awk '/\[feed\]/{on=1} on&&/layout:/{match($0,/\(([0-9]+)\)/,m); print m[1]; exit}' "$f")
    [ "$got" = "${want[$w]}" ] || { echo "✗ $brand $w: the feed is ${got:-unmeasured} wide, decided ${want[$w]}"; red=1; }
  done
done
if [ "$red" -eq 0 ]; then echo "check-widths: GREEN — $seen walks, no failed step, no sideways scroll, no target under 24, the feed 375/720/1280/1600/1600"; else echo "check-widths: RED"; fi
exit "$red"
