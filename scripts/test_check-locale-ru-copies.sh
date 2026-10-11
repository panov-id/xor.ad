#!/usr/bin/env bash
# The Russian-copy gate must go red on a Russian copy, and only then.
#
#   scripts/test_check-locale-ru-copies.sh
#
# Works on a copy of the locale folders (the gate reads --root), so the live
# dictionaries are only read.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/depth/ink" "$work/web/src" "$work/scripts"
fresh() { rm -rf "$work/depth/ink/locales" "$work/web/src/locales"; cp -r "$root/depth/ink/locales" "$work/depth/ink/locales"; cp -r "$root/web/src/locales" "$work/web/src/locales"; cp "$here/check-locale-ru-copies.allow" "$work/scripts/"; }
failures=0
expect() {  # expect <code> <substring> <what>
  local out code
  out=$(python3 "$here/check-locale-ru-copies.py" --root "$work" 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$out"; then printf '  ✓ %s\n' "$3"
  else failures=$((failures + 1)); printf '  ✗ %s (code %s, wanted %s)\n' "$3" "$code" "$1"; printf '%s\n' "$out" | tail -4 | sed 's/^/      | /'; fi
}
# check-web-i18n.sh reads the same allow list (G-RU2): run it on the copy too. Its root is
# its own parent folder, so the copy carries the script, web/src and depth/ink.
cp -r "$root/web/src/." "$work/web/src/"; cp -r "$root/depth/ink/." "$work/depth/ink/"; cp "$here/check-web-i18n.sh" "$work/scripts/"
expect_web() {  # expect_web <code> <substring> <what>
  local out code
  out=$(bash "$work/scripts/check-web-i18n.sh" 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$out"; then printf '  ✓ %s\n' "$3"
  else failures=$((failures + 1)); printf '  ✗ %s (code %s, wanted %s)\n' "$3" "$code" "$1"; printf '%s\n' "$out" | tail -4 | sed 's/^/      | /'; fi
}
put() {  # put <file> <key> <value-from-ru|literal>
  python3 - "$@" <<'PY'
import json, os, sys
p, k, v = sys.argv[1:]
if v == "@ru":
    v = json.load(open(os.path.join(os.path.dirname(p), "ru.json")))[k]
d = json.load(open(p)); d[k] = v
open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
PY
}
echo "CASES"
fresh
expect 0 "no Russian copies: 30 dictionaries" "the dictionaries as they are: clean"
fresh; put "$work/depth/ink/locales/de.json" board.draw_deck @ru
expect 1 "de: depth board.draw_deck has Cyrillic in a non-Cyrillic language" "TR1 again: a Russian board.* line in German"
fresh; put "$work/web/src/locales/hy.json" web.suit.S @ru
expect 1 "hy: web web.suit.S has Cyrillic" "a Russian suit in Armenian (non-Latin script)"
fresh; put "$work/depth/ink/locales/kk.json" board.draw_deck @ru
expect 1 "kk: depth board.draw_deck is a copy of Russian" "a Russian copy in a Cyrillic language"
fresh; put "$work/depth/ink/locales/kk.json" board.draw_deck @ru
printf 'kk\tdepth\tboard.draw_deck\tshared word\n' >> "$work/scripts/check-locale-ru-copies.allow"
expect 0 "no Russian copies" "the same copy listed in the allow file passes"
fresh; put "$work/depth/ink/locales/uz.json" board.card "karta {card}"
expect 0 "no Russian copies" "a Latin value equal to nothing Russian passes"
fresh; put "$work/web/src/locales/uk.json" web.ui.code "kод-змінено"
expect 1 "uk: web web.ui.code no longer reads as Russian — drop it from check-locale-ru-copies.allow" "a stale allow line is red here"
expect_web 1 "uk: web.ui.code уже не совпадает с ru — убрать из check-locale-ru-copies.allow" "…and in check-web-i18n, from the same list"
fresh; grep -v $'^uk\tweb\tweb.ui.code\t' "$root/scripts/check-locale-ru-copies.allow" > "$work/scripts/check-locale-ru-copies.allow"
expect 1 "uk: web web.ui.code is a copy of Russian" "a copy dropped from the list is red here"
expect_web 1 "uk: web.ui.code осталась русской" "…and in check-web-i18n: one list, no second to forget"
fresh
expect_web 0 "веб говорит словарями" "check-web-i18n on the copy as it is: green"
fresh; rm "$work/web/src/locales/ru.json"
expect 2 "ru.json" "a missing ru.json is a broken tree, not green"
echo
if [ "$failures" -ne 0 ]; then echo "FAILED: $failures"; exit 1; fi
echo "all cases pass"
