#!/usr/bin/env bash
# Черновик реестра решений: смотреть можно, стирать нельзя.
#
#   scripts/test_seed-facts-decisions.sh
#
# 07.09.2026 --write переписал docs/facts/decisions.tsv целиком и снёс отобранное
# руками: 93 сверенных решения превратились в 157 строк и 168 расхождений. Проба
# держит границу, проведённую после этого: без флагов и с --propose файл не
# меняется ни на байт, --write не пишет вовсе, а --force перед перезаписью
# называет, сколько строк исчезнет.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
tool="$here/seed-facts-decisions.py"
real="$root/docs/facts/decisions.tsv"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
witness="$work/каким-был.tsv"
registry="$work/decisions.tsv"
cp "$real" "$witness" || { echo "не снялся реестр: $real" >&2; exit 2; }
cp "$witness" "$registry"

failures=0; number=0
run() { FACTS_DECISIONS="$registry" python3 "$tool" "$@" 2>&1; }
expect() {  # expect <код> <подстрока> <описание> [флаги...]
  number=$((number + 1))
  local code_wanted="$1" needle="$2" what="$3"; shift 3
  local output; output=$(run "$@"); local code=$?
  if [ "$code" = "$code_wanted" ] && printf '%s' "$output" | grep -qF -- "$needle"; then
    printf '  ✓ %s\n' "$what"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$what" "$code" "$code_wanted"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
unchanged() {  # unchanged <описание>
  number=$((number + 1))
  if cmp -s "$witness" "$registry"; then
    printf '  ✓ %s\n' "$1"
  else
    failures=$((failures + 1)); printf '  ✗ %s — реестр изменился\n' "$1"
    cp "$witness" "$registry"
  fi
}

echo "СЛУЧАИ"

expect 0 'сопоставлено однозначно' 'без флагов — только отчёт'
unchanged 'без флагов реестр не тронут'

expect 0 'кандидаты' '--propose печатает кандидатов' --propose
unchanged '--propose реестр не тронут'

# Кандидаты печатаются готовой строкой TSV: шесть колонок, как в реестре.
number=$((number + 1))
columns=$(run --propose | grep -v '^#' | grep -c $'\t.*\t.*\t.*\t.*\t')
if [ "$columns" -gt 0 ]; then
  printf '  ✓ кандидат печатается строкой TSV в шесть колонок (%s строк)\n' "$columns"
else
  failures=$((failures + 1)); printf '  ✗ кандидат печатается строкой TSV в шесть колонок\n'
fi

expect 2 'больше не пишет в реестр' '--write отказывается писать' --write
unchanged '--write реестр не тронут'

# --force остаётся, но обязан назвать цену до того, как её возьмёт.
expect 0 'перезапись потеряет строк' '--force называет, сколько отобранного исчезнет' --force
number=$((number + 1))
if ! cmp -s "$witness" "$registry"; then
  printf '  ✓ --force действительно переписал\n'
else
  failures=$((failures + 1)); printf '  ✗ --force ничего не переписал\n'
fi
cp "$witness" "$registry"

# Живой реестр не тронут: всё шло по копии из FACTS_DECISIONS.
number=$((number + 1))
if cmp -s "$witness" "$real"; then
  printf '  ✓ живой реестр не тронут\n'
else
  failures=$((failures + 1)); printf '  ✗ живой реестр изменился — проба писала не туда\n'
fi

printf '\nслучаев: %s, провалено: %s\n' "$number" "$failures"
[ "$failures" = 0 ]
