#!/usr/bin/env bash
# The «every screen drawn» gate (owner 11.10.2026: «draw all screens, 100%»): every row of
# docs/design/screens-inventory.tsv has its sheet panel/design/adaptive-<brand>-<sheet>.svg for BOTH brands.
#   scripts/design/check-screens-drawn.sh          prints the coverage, red below 100%
#   scripts/design/check-screens-drawn.sh --list   also lists what is missing
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
inv="$root/docs/design/screens-inventory.tsv"
total=0; drawn=0; missing=()
while IFS=$'\t' read -r id src sheet what; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  total=$((total + 1))
  if [ -f "$root/panel/design/adaptive-sosed-$sheet.svg" ] && [ -f "$root/panel/design/adaptive-neighbro-$sheet.svg" ]; then
    drawn=$((drawn + 1))
  else
    missing+=("$id ($sheet) — $what")
  fi
done < "$inv"
pct=$(( total ? drawn * 100 / total : 0 ))
if [ "${1:-}" = "--list" ] && [ "${#missing[@]}" -gt 0 ]; then printf '  ✗ %s\n' "${missing[@]}"; fi
if [ "$drawn" -eq "$total" ]; then echo "check-screens-drawn: GREEN — $drawn/$total screens and states drawn for both brands"; exit 0; fi
echo "check-screens-drawn: RED — $drawn/$total drawn ($pct%), ${#missing[@]} missing (--list)"; exit 1
