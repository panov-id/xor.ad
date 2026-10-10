#!/usr/bin/env bash
# The address-form gate must go red on a key of the other form, and only then.
#
#   scripts/test_check-address-form.sh
#
# Works on a copy of the locale folders (the gate reads --root), so the live
# dictionaries are only read.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/depth/ink" "$work/web/src" "$work/scripts"
cp -r "$root/depth/ink/locales" "$work/depth/ink/locales"
cp -r "$root/web/src/locales" "$work/web/src/locales"
cp "$here/check-address-form.allow" "$work/scripts/"
fresh() { rm -rf "$work/depth/ink/locales" "$work/web/src/locales"; cp -r "$root/depth/ink/locales" "$work/depth/ink/locales"; cp -r "$root/web/src/locales" "$work/web/src/locales"; }
failures=0
expect() {  # expect <code> <substring> <what>
  local out code
  out=$(python3 "$here/check-address-form.py" --root "$work" 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$out"; then printf '  ✓ %s\n' "$3"
  else failures=$((failures + 1)); printf '  ✗ %s (code %s, wanted %s)\n' "$3" "$code" "$1"; printf '%s\n' "$out" | tail -4 | sed 's/^/      | /'; fi
}
put() {  # put <file> <key> <value>
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
p, k, v = sys.argv[1:]
d = json.load(open(p)); d[k] = v
open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
PY
}
echo "CASES"
expect 0 "one form of address per language: ok" "the dictionaries as they are: one form each"
fresh; put "$work/depth/ink/locales/ru.json" write.title "Твоя фраза"
expect 1 "ru: depth write.title is T, the language's own form is V" "a «ты» header in a «вы» language"
fresh; put "$work/depth/ink/locales/pl.json" write.title "Państwo piszą zdanie: Pan wpisuje"
expect 1 "pl: depth write.title is V, the language's own form is T" "a «Pan» line in a «ty» language"
fresh; put "$work/web/src/locales/de.json" web.ui.you "du"
expect 1 "de: web web.ui.you is T" "a «du» key of the web in a «Sie» language"
fresh; put "$work/depth/ink/locales/ro.json" chat.codeHint "comparați-l"
expect 0 "ok" "a listed line addressed to the pair stays allowed"
fresh; put "$work/depth/ink/locales/ro.json" away.pick "alegeți o durată"
expect 1 "ro: depth away.pick is V" "a «dumneavoastră» line in a «tu» language"
echo
[ "$failures" = 0 ] && echo "all cases red where they must be" || { echo "failed: $failures"; exit 1; }
