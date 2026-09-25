#!/usr/bin/env bash
# Проба ворот контраста витрин: они обязаны покраснеть на сломанном токене.
#
#   scripts/test_check-storefront-contrast.sh
#
# Заведена 18.09.2026 вместе с воротами. Причина — правило проекта «проба,
# которая ни разу не падала, ничего не доказывает» и живой случай: счётчик
# витрины неделю печатал «every pair passes», не считая --ok, который в светлой
# теме стоял на 1.48:1. Живой лендинг только читается: копия в mktemp, токен
# ломается в копии, ворота направляются на неё через STOREFRONT_LANDING_DIR.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/group-root.sh"; root="$(group_root "$here/..")"
gate="$here/check-storefront-contrast.sh"
real="$root/sosed.place/landing"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/landing" && cp "$real/index.html" "$real/check-contrast.mjs" "$work/landing/" || { echo "не удалось снять лендинг" >&2; exit 2; }

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(STOREFRONTS="sosed.place" STOREFRONT_LANDING_DIR="$work/landing" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}

echo "СЛУЧАИ"
expect 0 'every pair passes' 'живой лендинг проходит'

# --ok в светлой теме возвращается к тёмному значению — тот самый провал 1.48:1.
sed -i 's/--ok:#4b712c;/--ok:#9ecb7a;/g' "$work/landing/index.html"
expect 1 'FAIL status ok on the page' 'статусный цвет светлой темы ниже 4.5:1 — красно'

cp "$real/index.html" "$work/landing/index.html"
# Рамка тёмной темы обратно к 1.49:1 — нетекстовый порог 3:1.
sed -i 's/--border:#725a3f;/--border:#3a2e20;/' "$work/landing/index.html"
expect 1 'FAIL the border on the page' 'рамка тёмной темы ниже 3:1 — красно'

cp "$real/index.html" "$work/landing/index.html"
rm "$work/landing/check-contrast.mjs"
expect 3 'проверять было нечего' 'без счётчика ворота отказываются, а не отчитываются нулём'

echo
if [ "$failures" -gt 0 ]; then echo "провалено: $failures из $number"; exit 1; fi
echo "случаев: $number — ворота краснеют там, где должны"
