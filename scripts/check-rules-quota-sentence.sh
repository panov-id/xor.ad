#!/usr/bin/env bash
# Сторожит одно предложение в опубликованных правилах — на всех языках сразу.
#
# 26.08.2026 решено: жалоба и блокировка НЕ трогают квоту автора. 27.08.2026
# отменённое утверждение удалили — и правка обошла семь языков, потому что искала
# по словарю переводов: в немецком стоит «Veröffentlichungskontingent», в
# грузинском квота записана своим алфавитом. Одиннадцать мест в документе,
# который человек принимает галочкой, врали ему ещё двое суток.
#
# Реестр отменённых формулировок такое не ловит: он умеет искать лишнее, а здесь
# нужно ещё и требовать нужное. Поэтому проверка двусторонняя:
#   1. ни в одном файле нет ни одного отменённого предложения;
#   2. в каждом файле стоит верное — на своём языке.
#
#   scripts/check-rules-quota-sentence.sh
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

python3 - "$ROOT_DIR" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

RETIRED = [
    "зніжаюць квоту", "знижують квоту", "senken das Veröffentlichungskontingent",
    "նվազեցնում են հեղինակի", "ამცირებს ავტორის", "reduc cota de postare",
    "квотаи нашри муаллифро кам", "снижают квоту публикаций",
    "reduce the author's posting quota",
]

# Ключевой кусок верного предложения на каждом языке. Не всё предложение: точка
# и тире у переводов гуляют, а обещание — нет.
REQUIRED = {
    "AZ": "kvotasına toxunmur", "BE": "не закранаюць квоту", "DE": "berühren die Beitragsquote",
    "EL": "δεν αγγίζουν το όριο", "EN": "do not touch the author's posting quota",
    "ES": "no afectan a la cuota", "FR": "ne touchent pas au quota",
    "HY": "չեն շոշափում հեղինակի", "KA": "კვოტას არ ეხება", "KK": "квотасына тимейді",
    "KY": "квотасына тийбейт", "PL": "nie naruszają limitu publikacji",
    "RO": "nu afectează cota de publicare", "RU": "не трогают квоту публикаций",
    "TG": "даст намерасонанд", "UK": "не чіпають квоту", "UZ": "kvotasiga tegmaydi",
}

problems = checked = 0
for repo in ("sosed.place", "neighbro.place"):
    for path in sorted((root / repo / "landing" / "legal").glob("community-guidelines_*.md")):
        language = path.stem.split("_")[1]
        text = path.read_text(encoding="utf-8")
        checked += 1
        for phrase in RETIRED:
            if phrase in text:
                print(f"  ! {repo}/{language}: отменённое утверждение на месте — «{phrase}»")
                problems += 1
        needle = REQUIRED.get(language)
        if needle is None:
            print(f"  ! {repo}/{language}: язык не описан в проверке — добавьте предложение")
            problems += 1
        elif needle not in text:
            print(f"  ! {repo}/{language}: верного предложения нет")
            problems += 1

if problems:
    print(f"\nдокументов проверено: {checked}, расхождений: {problems}")
    raise SystemExit(1)
print(f"проверено документов: {checked} — жалоба нигде не режет квоту, и всюду сказано, что не режет")
PY
