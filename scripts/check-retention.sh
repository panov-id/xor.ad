#!/usr/bin/env bash
# Сроки хранения: реестр пределов против кода, который их исполняет.
#
#   scripts/check-retention.sh
#   RETENTION_ROOT=<копия> scripts/check-retention.sh   (для пробы на копии)
#
# Зачем. Политика приватности обеих витрин обещает сроки — поддержка и DSA год,
# аудит год, логи 30 дней, бэкап 14, подробные просмотры 14, — а исполняют их
# числа, раскиданные по коду: COLLECTIONS в prune_objects.ts, YEAR_DAYS в
# prune_dsa_records.ts, keep_days в backup-postgres.sh. check-facts-limits
# сверяет реестр с текстами; с кодом его не сверял никто, и число в коде могло
# уйти от обещания молча (панель 15.09.2026, OPS-5 дефект 3; policy.retention.registry).
#
# Здесь каждая строка реестра со сроком привязана к месту в коде, где этот срок
# стоит числом, и число обязано совпасть. Привязка — список ниже: новый срок без
# привязки ворота не увидят, поэтому строка реестра без неё — тоже красный.
#
# Граница: число сверяется там, где оно объявлено, — константа, поле или
# переменная, с разделителем после него (`days: 30,`, `= 365;`), так что
# `days: 30 * 2` не находится и краснеет. Использование константы дальше по
# коду (`YEAR_DAYS * 2`, литерал вместо `${INACTIVE_DAYS}`) ворота не видят.
#
# Коды выхода: 0 — всё сходится; 1 — расхождение; 2 — не читается реестр или код.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${RETENTION_ROOT:-$(cd "$here/.." && pwd)}"

python3 - "$root" <<'EOF'
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
limits = root / "docs/facts/limits.tsv"
try:
    rows = [l.split("\t") for l in limits.read_text(encoding="utf-8").splitlines()
            if l and not l.startswith("#") and not l.startswith("id\t")]
except OSError as e:
    print(f"не читается реестр: {e}", file=sys.stderr); sys.exit(2)
registry = {r[0]: r for r in rows}

# id реестра -> места в коде: (файл, регулярка с одной группой-числом, множитель к дням)
BINDINGS = {
    "logs.retention": [
        ("relay/node/tools/prune_objects.ts", r'directory: "server-logs",\s*days: (\d+),', 1),
        ("relay/node/tools/prune_objects.ts", r'directory: "client-errors",\s*days: (\d+),', 1),
        ("relay/node/tools/prune_objects.ts", r'directory: "client-errors-unattributed",\s*days: (\d+),', 1),
        ("relay/wizard/wizard.py", r"(?m)^LOG_RETENTION_DAYS = (\d+)$", 1),
        ("relay/node/tools/prune_objects.ts", r'directory: "csp-reports",\s*(?://[^\n]*\n\s*)*days: (\d+),', 1),
    ],
    "audit.log.retention": [("relay/node/tools/prune_objects.ts", r'directory: "audit",\s*days: (\d+),', 1)],
    "dsa.records.retention": [("relay/node/tools/prune_dsa_records.ts", r"const YEAR_DAYS = (\d+);", 1)],
    "support.retention": [("relay/node/src/lib/support_sweeper.ts", r"interval '(\d+) year'", 365)],
    "backup.retention": [("relay/wizard/backup-postgres.sh", r"(?m)^keep_days=(\d+)$", 1)],
    "analytics.detail.retention": [("relay/node/tools/prune_pageviews.ts", r"const DEFAULT_DAYS = (\d+);", 1)],
    "identity.inactive.retention": [("relay/node/src/lib/identity_sweeper.ts", r"export const INACTIVE_DAYS = (\d+);", 1)],
    "business.suspension.retention": [("relay/node/src/lib/advertiser_sweeper.ts", r"export const SUSPENSION_KEPT_DAYS = (\d+);", 1)],
    "business.profile.retention": [("relay/node/src/lib/advertiser_sweeper.ts", r"export const PROFILE_RETENTION_DAYS = (\d+);", 1)],
    "identity.deletion.delay": [("relay/node/src/lib/identity_sweeper.ts", r"export const DELETION_DELAY_DAYS = (\d+);", 1)],
}
TO_DAYS = {"дней": 1, "день": 1, "дня": 1, "год": 365, "года": 365, "лет": 365}

problems = []
checked = 0
for rid, places in BINDINGS.items():
    row = registry.get(rid)
    if row is None:
        problems.append(f"{rid}: привязан к коду, а в limits.tsv строки нет"); continue
    unit = row[2].strip()
    if unit not in TO_DAYS:
        problems.append(f"{rid}: единица «{unit}» не срок"); continue
    want = int(row[1].split()[0]) * TO_DAYS[unit]
    for rel, pattern, factor in places:
        path = root / rel
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as e:
            print(f"не читается код: {e}", file=sys.stderr); sys.exit(2)
        found = re.findall(pattern, text)
        if len(found) != 1:
            problems.append(f"{rid}: в {rel} место срока найдено {len(found)} раз — привязка устарела"); continue
        got = int(found[0]) * factor
        checked += 1
        if got != want:
            problems.append(f"{rid}: реестр обещает {want} дн., а {rel} держит {got}")

# Срок узла без привязки: реестр знает его, код — неизвестно где.
for rid, row in registry.items():
    if rid.endswith(".retention") and row[2].strip() in TO_DAYS and rid not in BINDINGS \
       and row[4].strip() in ("узел", "конфиг", "панель"):
        problems.append(f"{rid}: срок в реестре без привязки к коду — добавить в BINDINGS")

for p in problems:
    print(f"  ✗ {p}")
if problems:
    print(f"расхождений: {len(problems)}"); sys.exit(1)
print(f"сроков сверено с кодом: {checked} мест по {len(BINDINGS)} строкам реестра — сходятся")
EOF
