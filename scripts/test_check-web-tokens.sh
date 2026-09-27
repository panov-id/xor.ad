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

[ "$failures" = 0 ] && echo "проба check-web-tokens: все случаи как ожидалось" || { echo "проба check-web-tokens: провалено $failures"; exit 1; }
