#!/usr/bin/env bash
# Raw HTML controls in the web screens, outside the kit (docs/design/kit_RU.md §5):
# the numbers the kit doc quotes are this script's, not remembered.
#   scripts/count-raw-controls.sh
set -euo pipefail
cd "$(dirname "$0")/../web/src"
files=(screens/*.tsx adv/*.tsx App.tsx)
for tag in button input select textarea a; do
  n=$(grep -o "<$tag[ >]" "${files[@]}" 2>/dev/null | wc -l)
  printf '%-9s %s\n' "$tag" "$n"
done
printf '%-9s %s\n' "brand-px" "$(grep -oE '[0-9.]+px' brands/*/*.css | wc -l)"
