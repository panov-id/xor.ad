#!/usr/bin/env bash
# Один круг доводки — одна команда: все ворота трёх репозиториев и один итог.
#
#   scripts/harden-cycle.sh
#
# Зачем. 14–15.09.2026 круг проверялся руками: пять проверок реестров, сравнение
# витрин, контрольный grep. Дважды это пропустило красное. Сначала `tail -2`
# показал зелёную строку проверки парности, а итог над ней был красным. Потом
# коммит ушёл после красной парности, потому что цепочка команд не останавливалась
# на её выводе. Здесь решает код выхода каждых ворот, а не глаз.
#
# Что входит:
#   xor.ad       scripts/check-all.sh — реестры, парность всех трёх репозиториев,
#                снятые формулировки, зеркало экранов, схемы, контраст панели
#   витрины      парность, редакции юр-текстов, согласованность переводов,
#                полоса «документы изменились», i18n, заголовки безопасности,
#                секреты в аргументах, разрешённые к выкладке файлы
#   между ними   юр-тексты sosed.place и neighbro.place совпадают с точностью до бренда
#
# Node не ставится на хост: витрины зовут его через deploy/run-node.sh, а тест
# заголовков — в одноразовом node:22-alpine с репозиторием только для чтения.
#
# Коды выхода: 0 — всё зелёное; 1 — хотя бы одни ворота красные.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
group="$(cd "$root/.." && pwd)"
faces="${FACES:-sosed.place neighbro.place}"

failed=0; passed=0

run() {  # run <имя> <каталог> <команда...>
  local name="$1" dir="$2"; shift 2
  local output; output=$(cd "$dir" && "$@" 2>&1); local code=$?
  local last; last=$(printf '%s' "$output" | grep -v '^\s*$' | tail -1)
  if [ "$code" = 0 ]; then
    passed=$((passed + 1)); printf '  ✓ %-34s %s\n' "$name" "${last:0:110}"
  else
    failed=$((failed + 1)); printf '  ✗ %-34s (код %s)\n' "$name" "$code"
    printf '%s\n' "$output" | tail -15 | sed 's/^/      | /'
  fi
}

# check-docs-pairing печатает MISMATCH, а код выхода у него исторически бывает 0 —
# поэтому здесь краснеет по тексту, а не только по коду.
pairing() {
  local output; output=$(bash scripts/check-docs-pairing.sh 2>&1); local code=$?
  printf '%s\n' "$output"
  if printf '%s' "$output" | grep -q "MISMATCH"; then return 1; fi
  return "$code"
}

brand_modulo() {  # сверка юр-текстов витрин с точностью до бренда
  local a="$group/sosed.place/landing/legal" b="$group/neighbro.place/landing/legal" bad=0 n=0
  local norm='s/sosed\.place/X.place/g;s/Neighbro/X/g;s/neighbro/X/g;s/sosed/X/g'
  for f in "$b"/*.md; do
    local name; name=$(basename "$f")
    [ -f "$a/$name" ] || { echo "нет у sosed.place: $name"; bad=1; continue; }
    n=$((n + 1))
    if ! diff -q <(sed "$norm" "$a/$name") <(sed "$norm" "$f") >/dev/null; then
      echo "расходятся не только брендом: $name"; bad=1
    fi
  done
  [ "$n" -gt 0 ] || { echo "сверять было нечего"; return 3; }
  [ "$bad" = 0 ] && echo "файлов сверено: $n — совпадают с точностью до бренда"
  return "$bad"
}

echo "XOR.AD"
run check-all "$root" bash scripts/check-all.sh

for face in $faces; do
  dir="$group/$face"
  echo
  echo "${face^^}"
  run "$face pairing"              "$dir" pairing
  run "$face legal-revisions"      "$dir" python3 deploy/check-legal-revisions.py
  run "$face legal-consistency"    "$dir" bash deploy/run-node.sh landing/check-legal-consistency.mjs
  run "$face legal-bar"            "$dir" bash deploy/run-node.sh landing/check-legal-bar.mjs landing/index.html
  run "$face i18n"                 "$dir" bash deploy/run-node.sh landing/check-i18n.mjs landing/index.html
  run "$face security-headers"     "$dir" docker run --rm -v "$dir:/work:ro" -w /work node:22-alpine \
        sh -c 'apk add --no-cache bash python3 >/dev/null 2>&1 && bash landing/test-security-headers.sh'
  run "$face no-secrets-in-argv"   "$dir" python3 deploy/test-no-secrets-in-argv.py
  run "$face shipped-files"        "$dir" python3 deploy/test-check-shipped-files.py
done

echo
echo "МЕЖДУ ВИТРИНАМИ"
run "legal texts modulo brand" "$group" brand_modulo

echo
printf 'пройдено %s, провалено %s\n' "$passed" "$failed"
[ "$failed" -gt 0 ] && exit 1
exit 0
