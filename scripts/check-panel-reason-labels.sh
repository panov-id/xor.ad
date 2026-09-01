#!/usr/bin/env bash
# Подписи причин в панели против списка причин в базе.
#
#   scripts/check-panel-reason-labels.sh
#
# Причина снимка живёт в трёх местах: ограничение CHECK в db/014, тип
# CaptureReason в узле и две карты подписей в панели. Первые две уже связаны
# пробой узла (test/dsa_snapshot_reason.test.ts, она читает миграцию файлом).
# Третья до 01.09.2026 не была связана ни с чем — и разошлась молча: узел писал
# шесть значений, панель знала ноль и показывала все шесть как «never held».
#
# Расхождение здесь не падает и не краснеет само. Оно выглядит как работающий
# экран, на котором дефект неотличим от правила, и стоит ночи разбора очереди.
# Поэтому сверка машинная, в обе стороны: подпись без причины — мусор, причина
# без подписи — та самая немота.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
migration="${REASON_MIGRATION:-$root/relay/node/db/014_dsa_notice_out_of_scope.sql}"
labels="${REASON_LABELS:-$root/panel/src/pages/dsa-notices/reasons.ts}"
screen="${REASON_SCREEN:-$root/panel/src/pages/dsa-notices/list.tsx}"

[ -f "$migration" ] || { echo "нет миграции: $migration" >&2; exit 2; }
[ -f "$labels" ] || { echo "нет модуля подписей: $labels" >&2; exit 2; }
[ -f "$screen" ] || { echo "нет экрана: $screen" >&2; exit 2; }

python3 - "$migration" "$labels" "$screen" <<'PY'
import re
import sys

migration_path, labels_path, screen_path = sys.argv[1], sys.argv[2], sys.argv[3]
migration = open(migration_path, encoding="utf-8").read()
labels = open(labels_path, encoding="utf-8").read()
screen = open(screen_path, encoding="utf-8").read()

# Из миграции берётся именно список внутри `snapshot_reason IN (...)`, а не все
# строки в кавычках: в файле есть ещё комментарии и имена ограничений, и они
# попали бы в «причины» вместе с остальным.
block = re.search(r"snapshot_reason\s+IN\s*\((.*?)\)", migration, re.S)
if not block:
    sys.exit("в миграции не нашёлся список snapshot_reason IN (...)")
expected = set(re.findall(r"'([a-z_]+)'", block.group(1)))
if not expected:
    sys.exit("список причин в миграции пуст — сверять не с чем")


def keys_of(name):
    found = re.search(name + r"\s*:\s*Record<string, string>\s*=\s*\{(.*?)\n\};", labels, re.S)
    if not found:
        sys.exit(f"в модуле подписей не нашлась карта {name}")
    return set(re.findall(r"^\s{2}([a-z_]+)\s*:", found.group(1), re.M))


problems = []
checked = 0

for name in ("REASON_SHORT", "REASON_LONG"):
    keys = keys_of(name)
    for reason in sorted(expected):
        checked += 1
        if reason not in keys:
            problems.append(f"{name}: нет подписи для причины «{reason}» — покажется сырым значением")
    for extra in sorted(keys - expected):
        checked += 1
        problems.append(f"{name}: подпись «{extra}» не соответствует ни одной причине из базы")

# Обе карты обязаны совпадать между собой: короткая в списке и длинная в модалке
# описывают одно и то же, и причина, попавшая в одну и забытая в другой, даёт
# экран, где список знает больше, чем карточка.
short, long = keys_of("REASON_SHORT"), keys_of("REASON_LONG")
checked += 1
if short != long:
    problems.append(f"карты разошлись между собой: только в короткой {sorted(short - long)}, "
                    f"только в длинной {sorted(long - short)}")

# Экран обязан звать модуль, а не носить свою копию карт: две копии разойдутся
# ровно так же, как разошлись панель и база. Плюс поле в типе — без него строка
# придёт, TypeScript её не увидит, и ячейка молча вернётся к «never held».
checked += 1
if "copyCell" not in screen or "longReason" not in screen:
    problems.append("экран не зовёт copyCell/longReason из модуля подписей")
checked += 1
if not re.search(r"snapshot_reason\s*:\s*string \| null", screen):
    problems.append("в типе Notice нет поля snapshot_reason — подписи не к чему приложить")

if problems:
    for line in problems:
        print(f"  ✗ {line}")
    print(f"\nпричин в базе: {len(expected)}, сверок: {checked}, расхождений: {len(problems)}")
    sys.exit(1)

print(f"причин в базе: {len(expected)}, сверок сделано: {checked} — "
      f"у каждой причины есть обе подписи, лишних нет")
PY
