#!/usr/bin/env bash
# Обе витрины объявляют один набор токенов — именами, а с 10.10.2026 ещё и значениями.
#
# Значения: цвета и правила кнопок/полей/ссылок витрины не пишет сама. Они лежат между
# `/* BEGIN kit … */` и `/* END kit */` в landing/index.html, их порождает
# scripts/design/themes-css.py --landing из web/themes/<бренд>/*.json и web/src/styles.css
# (решено кворумом, design.2026-10-10.landing-kit-generated). Второй шаг этого ворота —
# `themes-css.py --landing --check`: блок сверяется переменная за переменной и правило за
# правилом, а цветовая переменная вне блока (тот же `--border: #725a3f`, `--ok`) красная.
# Соседей можно подменить: SOSED_PLACE_DIR и NEIGHBRO_PLACE_DIR — корни репозиториев.
#
# Имена. Значения у витрин теперь берутся из тем, а акцент — бренд темы. Имена
# разошлись сами и молча: к 31.08.2026 у одной витрины
# было `--ok`, которого не было у другой, у другой `--mono` и `--sans`, которых не
# было у первой, а шрифтовые стеки лежали вписанными в восемнадцать правил. Пока
# приложение не начато, это стоит час; после — это два словаря в одном продукте.
#
# Токены картинок (`--img-*`) в набор не входят: это ассеты страницы, а не палитра.
#
# Коды выхода: 0 — наборы имён совпали и значения равны темам; 1 — имена разошлись;
# 4 — значения разошлись с темами (имя, ожидалось, получено печатаются); 2 — нет файла витрины;
# 3 — сравнивать было нечего, общих токенов ноль. Третий добавлен 01.09.2026 по
# замеру: с пустыми index.html гейт печатал «набор имён у витрин один» и выходил
# нулём — два пустых набора совпадают идеально и не значат ничего.
set -euo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/group-root.sh"; root="$(group_root "$(dirname "${BASH_SOURCE[0]}")/..")"
names() {
  grep -o -- '--[a-z0-9-]*\s*:' "$1" | sed 's/[[:space:]]*:$//' | grep -v -- '--img-' | sort -u
}

a="${SOSED_PLACE_DIR:-$root/sosed.place}/landing/index.html"
b="${NEIGHBRO_PLACE_DIR:-$root/neighbro.place}/landing/index.html"
for f in "$a" "$b"; do [ -f "$f" ] || { echo "нет файла $f" >&2; exit 2; }; done

only_a="$(comm -23 <(names "$a") <(names "$b"))"
only_b="$(comm -13 <(names "$a") <(names "$b"))"
common="$(comm -12 <(names "$a") <(names "$b") | wc -l)"

if [ -n "$only_a" ] || [ -n "$only_b" ]; then
  echo "наборы токенов витрин разошлись:" >&2
  [ -n "$only_a" ] && echo "$only_a" | sed 's/^/  ✗ только у sosed:    /' >&2
  [ -n "$only_b" ] && echo "$only_b" | sed 's/^/  ✗ только у neighbro: /' >&2
  echo >&2
  echo "  значения могут расходиться — имена нет. Заведите недостающее у обеих." >&2
  exit 1
fi

if [ "$common" -eq 0 ]; then
  echo "ни одного токена в витринах — сравнивать было нечего, это не зелёный результат" >&2
  exit 3
fi
echo "проверено токенов: $common — набор имён у витрин один"

# Значения: тот же путь к соседям, что у имён, отдаём генератору через окружение.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! SOSED_PLACE_DIR="$(dirname "$(dirname "$a")")" NEIGHBRO_PLACE_DIR="$(dirname "$(dirname "$b")")" \
     python3 "$here/design/themes-css.py" --landing --check >&2; then
  echo >&2
  echo "  значения витрин разошлись с web/themes и ядром: scripts/design/themes-css.py --landing" >&2
  exit 4
fi
echo "значения витрин равны темам и правилам ядра (themes-css.py --landing --check)"
