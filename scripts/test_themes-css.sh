#!/usr/bin/env bash
# Probe of scripts/design/themes-css.py: it must go red, legibly, on a stale
# output and on a missing token, and green again once restored. Works on
# copies in mktemp (themes and outputs); restore is from a copy, never git.
#
#   scripts/test_themes-css.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$here/.."
gen="$here/design/themes-css.py"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp -r "$root/web/themes" "$work/themes"; mkdir -p "$work/out"
python3 "$gen" --themes "$work/themes" --out-dir "$work/out" >/dev/null
failures=0

expect() {  # expect <code> <text in output> <what>
  local output; output=$(python3 "$gen" --check --themes "$work/themes" --out-dir "$work/out" 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — expected code %s and "%s", got %s:\n%s\n' "$3" "$1" "$2" "$code" "$(tail -4 <<< "$output")"; failures=$((failures + 1)); fi
}

expect 0 "GREEN" "fresh outputs: green"
expect 0 "WARN" "known shortfalls are listed as WARN"

cp "$work/out/themes.gen.css" "$work/css.bak"
printf '/* stale */\n' >> "$work/out/themes.gen.css"
expect 1 "stale: themes.gen.css" "a stale CSS: red and named"
cp "$work/css.bak" "$work/out/themes.gen.css"
expect 0 "GREEN" "restored CSS: green"

f="$work/themes/sosed/light.json"; cp "$f" "$work/light.bak"
python3 - "$f" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); del d["tokens"]["focus"]; json.dump(d, open(sys.argv[1], "w"))
PY
expect 1 "sosed/light.json: missing token 'focus'" "a missing token: red and named"
cp "$work/light.bak" "$f"

python3 - "$f" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["tokens"]["fg-muted"] = d["tokens"]["bg"]; json.dump(d, open(sys.argv[1], "w"))
PY
expect 1 "fg-muted on bg" "text under 4.5:1: red and named"
cp "$work/light.bak" "$f"
expect 0 "GREEN" "restored theme: green"

[ "$failures" -eq 0 ] && echo "test_themes-css: GREEN" || { echo "test_themes-css: RED — $failures"; exit 1; }
