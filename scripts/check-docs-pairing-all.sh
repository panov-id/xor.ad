#!/usr/bin/env bash
# Парность документов во всех трёх репозиториях группы, а не только в гейте.
#
# Зачем отдельный скрипт. Обход парности идёт от корня репозитория, а витрины
# подключены к гейту симлинками — и симлинки отбрасываются намеренно, чтобы пары
# не считались дважды. Вместе с ними отбрасывалась и проверка: сорок экранных пар
# витрин не сверялись **ни разу**, при том что весь продукт описан именно там.
#
#   scripts/check-docs-pairing-all.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUP="$(cd "$HERE/../.." && pwd)"
FAIL=0

# Вывод берётся целиком, а не последней строкой: у падающей проверки последняя
# строка пуста, и «tail -1» печатал имя репозитория с пустотой — то есть падение
# выглядело как успех. Поймано контролем 28.08.2026, до первого настоящего
# расхождения.
for repo in xor.ad sosed.place neighbro.place; do
  [ -d "$GROUP/$repo" ] || { echo "нет репозитория $repo" >&2; FAIL=1; continue; }
  if [ "$repo" = "xor.ad" ]; then
    output="$(bash "$HERE/check-docs-pairing.sh" 2>&1)"
  else
    output="$(bash "$HERE/check-docs-pairing.sh" --root "$GROUP/$repo" 2>&1)"
  fi
  status=$?
  if [ "$status" -eq 0 ]; then
    printf '%-16s %s\n' "$repo" "$(printf '%s' "$output" | grep -E 'пар проверено' | tail -1)"
  else
    FAIL=1
    printf '%-16s РАСХОЖДЕНИЕ\n' "$repo"
    printf '%s\n' "$output" | grep -E 'MISMATCH|только в|пар с расхождением' | sed 's/^/    /'
  fi
done

exit $FAIL
