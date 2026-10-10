#!/usr/bin/env bash
# Probe of the web colour gate (check-web-tokens.sh): one fixture per kind of
# colour of its own, each must turn the gate red and be named; the allowed
# forms — var(--…), transparent, currentColor, color-mix of tokens, colours in
# comments — must leave it green. The fixtures live in mktemp; WEB_SRC points
# the gate there.
#
#   scripts/test_check-web-tokens.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gate="$here/check-web-tokens.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
failures=0
export PX_BASELINE="$work/no-baseline"   # the colour cases run against a baseline of none; the px cases set their own

clean() {
  rm -rf "$work/src"; mkdir -p "$work/src"
  cat > "$work/src/ok.css" <<'CSS'
/* #ff0000 and red in a comment do not count */
.a { color: var(--fg); background: transparent; border: 1px solid var(--border); }
.b { background: color-mix(in srgb, var(--chip) 10%, transparent); outline: 2px solid currentColor; }
.c { white-space: nowrap; border: 0; text-decoration: none; background: none; color: inherit; }
CSS
  cat > "$work/src/ok.tsx" <<'TSX'
// color: "red" in a comment does not count
export const A = () => <p style={{ color: "var(--muted)" }} className="red-herring">white paper</p>;
TSX
}

expect() {  # expect <code> <text in output> <what>
  local output; output=$(WEB_SRC="$work/src" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s\n' "$3"
  else printf '  ✗ %s — ожидали код %s и «%s», получили код %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
}

red() {  # red <file> <line> <text the gate must name> <what>
  clean; printf '%s\n' "$2" >> "$work/src/$1"; expect 1 "$3" "$4"
}

clean; expect 0 "GREEN" "только токены, transparent, currentColor, color-mix токенов, цвета в комментариях — зелёный"

red ok.css  '.x { color: #ff0000; }'                        '#ff0000'                  "hex — красный"
red ok.css  '.x { color: rgb(255 0 0); }'                   'rgb('                     "rgb() — красный"
red ok.css  '.x { color: hsl(0 100% 50%); }'                'hsl('                     "hsl() — красный"
red ok.css  '.x { color: oklch(62% 0.2 30); }'              'oklch('                   "oklch() — красный"
red ok.css  '.x { color: hwb(0 0% 0%); }'                   'hwb('                     "hwb() — красный"
red ok.css  '.x { color: lab(50% 40 30); }'                 'lab('                     "lab() — красный"
red ok.css  '.x { color: lch(50% 40 30); }'                 'lch('                     "lch() — красный"
red ok.css  '.x { color: red; }'                            'ok.css'                   "именованный red в color — красный"
red ok.css  '.x { background: white; }'                     'white'                    "именованный white в background — красный"
red ok.css  '.x { border: 1px solid rebeccapurple; }'       'rebeccapurple'            "именованный цвет в border — красный"
red ok.css  '.x { --own: navy; }'                           'navy'                     "именованный цвет в своей переменной — красный"
red ok.css  '.x { background: color-mix(in srgb, red 10%, transparent); }' 'color-mix(… red …)' "color-mix с именем цвета — красный"
red ok.tsx  'export const B = () => <p style={{ color: "red" }} />;' 'red'             "именованный цвет в style TSX — красный"

rm -rf "$work/src"; mkdir -p "$work/src"
expect 1 "nothing was checked" "пустой каталог — красный, а не зелёный ноль"

# --- px literals (К7а): brands/** and screens/*.css outside tokens.css; the ratchet baseline ---
# The fixtures use a baseline of their own (none = every file has 0); the real tree is only read.
clean_px() {
  clean; mkdir -p "$work/src/brands/x" "$work/src/screens/logic"
  printf '%s\n' '/* 12px in a comment does not count */' '.a { padding: var(--s-3); border-radius: var(--card-r); font-size: var(--fs-body); }' > "$work/src/brands/x/ok.css"
  printf '%s\n' '.s { gap: var(--s-2); }' > "$work/src/screens/s.css"
  printf '%s\n' '.t { padding: 10px; }' > "$work/src/screens/logic/deep.css"   # screens/*.css only, not deeper
  printf '%s\n' ':root { --s-3: 12px; }' > "$work/src/tokens.css"             # tokens.css is where px belong
}
px_red() {  # px_red <file> <line> <text the gate must name> <what>
  clean_px; printf '%s\n' "$2" >> "$work/src/$1"; expect 1 "$3" "$4"
}
clean_px; expect 0 "GREEN" "px: токены, px в комментарии, px в tokens.css и глубже screens/*.css — зелёный"
px_red brands/x/ok.css '.x { padding: 12px; }'          'ok.css:3: 12px'  "px: литерал в brands/** — красный, с файлом:строкой"
px_red brands/x/ok.css '.x { border: 1.5px solid var(--line); }' '1.5px'  "px: дробный литерал — красный"
px_red screens/s.css   '.x { min-height: 44px; }'       's.css:2: 44px'   "px: литерал в screens/*.css — красный, с файлом:строкой"
px_red brands/x/ok.css '@media (min-width: 600px) { .x { gap: var(--s-1); } }' '600px' "px: литерал в медиа-условии — красный"

# a baseline allows exactly its count: more is red, equal is green, fewer is red until the baseline is lowered
clean_px; printf '%s\n' '.x { padding: 12px; }' >> "$work/src/brands/x/ok.css"
printf '%s\n' '# comment' 'brands/x/ok.css 1' > "$work/baseline"
PX_BASELINE="$work/baseline" expect 0 "GREEN" "px: литерал в пределах базы — зелёный"
printf '%s\n' '.y { margin: 7px; }' >> "$work/src/brands/x/ok.css"
PX_BASELINE="$work/baseline" expect 1 "2 px literals, baseline 1" "px: литерал сверх базы — красный, с числом"
clean_px; printf '%s\n' 'brands/x/ok.css 3' > "$work/baseline"
PX_BASELINE="$work/baseline" expect 1 "lower the baseline" "px: литералов меньше базы — красный, пока база не снижена"

# the real tree, copied: clean is green on its own baseline; one px literal inserted into the copy is red, named by file:line.
# The probe never writes to web/src.
real_copy() {
  rm -rf "$work/real"; mkdir -p "$work/real"; cp -r "$here/../web/src" "$work/real/src"
}
real_copy
output=$(WEB_SRC="$work/real/src" PX_BASELINE="$here/check-web-tokens.px-baseline" bash "$gate" 2>&1); code=$?
if [ "$code" = 0 ] && grep -qF GREEN <<< "$output"; then echo "  ✓ копия настоящего web/src на настоящей базе — зелёный"
else printf '  ✗ копия настоящего web/src — ожидали зелёный, получили код %s:\n%s\n' "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
printf '%s\n' '.probe { margin: 9px; }' >> "$work/real/src/brands/sosed/blocks.css"
output=$(WEB_SRC="$work/real/src" PX_BASELINE="$here/check-web-tokens.px-baseline" bash "$gate" 2>&1); code=$?
if [ "$code" = 1 ] && grep -qF "blocks.css:" <<< "$output" && grep -qF "9px" <<< "$output"; then echo "  ✓ px в копии blocks.css — красный, файл:строка и литерал названы"
else printf '  ✗ px в копии blocks.css — ожидали красный с файлом:строкой, получили код %s:\n%s\n' "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
unset PX_BASELINE

[ "$failures" = 0 ] && echo "проба check-web-tokens: все случаи как ожидалось" || { echo "проба check-web-tokens: провалено $failures"; exit 1; }
