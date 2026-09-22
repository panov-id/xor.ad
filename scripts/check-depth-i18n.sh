#!/usr/bin/env bash
# Every language the storefronts speak must answer in the terminal too.
#
# The set is the storefronts' own (the owner's decision, 2026-09-22). English
# is the reference: a key present there and missing elsewhere is a hole, and a
# key only somewhere else is a leftover. A placeholder that appears in the
# English line must appear in the translation, or a screen shows {name} to a
# person instead of a name.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$root/depth/ink/locales"
# From the declared array, not from the shape of a literal: a grep for any
# two-letter string would call "ok" a language, and a head -17 would silently
# drop the eighteenth (operations lens, 2026-09-22).
expected=17
langs=$(sed -n '/^export const LANGUAGES = \[/,/\] as const;/p' "$root/depth/ink/strings.ts" |
  grep -oE '"[a-z]{2}"' | tr -d '"')
count=$(echo "$langs" | wc -w)
if [ "$count" -ne "$expected" ]; then
  echo "  ✗ языков объявлено $count, а ожидается $expected — правьте strings.ts или это число" >&2
  exit 1
fi
problems=0
for lang in $langs; do
  file="$dir/$lang.json"
  if [ ! -f "$file" ]; then echo "  ✗ нет файла: depth/ink/locales/$lang.json"; problems=$((problems+1)); continue; fi
  out=$(python3 - "$dir/en.json" "$file" "$lang" 2>&1 <<'PY'
import json,re,sys
en=json.load(open(sys.argv[1])); other=json.load(open(sys.argv[2])); lang=sys.argv[3]
bad=[]
for k,v in en.items():
    if k not in other or not str(other[k]).strip(): bad.append(f"нет ключа {k}"); continue
    want=set(re.findall(r"\{(\w+)\}",v)); got=set(re.findall(r"\{(\w+)\}",str(other[k])))
    if want!=got: bad.append(f"{k}: подстановки {sorted(want)} против {sorted(got)}")
for k in other:
    if k not in en: bad.append(f"лишний ключ {k}")
shown = bad[:5]
if len(bad) > len(shown): shown.append(f"и ещё {len(bad) - 5}")
print("\n".join(f"  ✗ {lang}: {b}" for b in shown))
sys.exit(1 if bad else 0)
PY
) || { echo "$out"; problems=$((problems+1)); }
done
if [ "$problems" -ne 0 ]; then echo "неполных языков: $problems" >&2; exit 1; fi
echo "языков полных: $count"
