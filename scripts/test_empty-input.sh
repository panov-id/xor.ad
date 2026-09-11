#!/usr/bin/env bash
# Один класс дефекта на все ворота: зелень там, где не проверено ничего.
#
#   scripts/test_empty-input.sh
#
# Зачем. 01.09.2026 замер показал, что четверо ворот из четырнадцати на пустом
# входе доходили до конца и печатали успех: «пунктов: 0 — форма на месте»,
# «решений сверено: 0 — даты сходятся везде», «проверено документов: 0 — жалоба
# нигде не режет квоту». Каждые ворота чинились отдельно, и без этой пробы
# следующие ворота повторят то же: печать успеха по нулю — самая дешёвая
# ошибка, которую можно сделать в проверке, и самая незаметная.
#
# Требование одно и общее: получив пустой вход, ворота обязаны отказаться. Каким
# кодом — их дело: наблюдаются все три, 1 (`SystemExit` со строкой), 2 («не с чем
# начать») и 3 («нечего проверять»). А вот 124, 126, 127 и прочее отказом НЕ
# считаются: это `timeout`, потерянный бит исполнения и отсутствующий файл, то
# есть «ворота не запускались». Засчитывать их за успех значило бы повторить в
# самой пробе тот дефект, против которого она написана, — замер 01.09.2026
# показал, что ровно так она и делала.
#
# Два способа подать пустоту, потому что ворота устроены по-разному: у одних
# вход переопределяется переменной, другие считают корень от пути скрипта — им
# подсовывается пустой корень с копией scripts/. Настоящие реестры, документы
# и витрины не трогаются: всё живёт в mktemp.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0
number=0

expect_nonzero() {  # expect_nonzero <имя> <команда...>
  number=$((number + 1))
  local name="$1"; shift
  local output code
  output="$(timeout 120 "$@" 2>&1)"; code=$?
  case "$code" in
    1|2|3)
      printf '  ✓ %-26s отказ, код %s\n' "$name" "$code" ;;
    0)
      failures=$((failures + 1))
      printf '  ✗ %-26s код 0 при пустом входе — ложная зелень\n' "$name"
      printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -2 | sed 's/^/      | /' ;;
    *)
      failures=$((failures + 1))
      printf '  ✗ %-26s стенд негоден: код %s — ворота не запускались\n' "$name" "$code"
      printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -2 | sed 's/^/      | /' ;;
  esac
}

# Пустой реестр — это комментарии и заголовок без единой строки данных: ровно
# то, что останется, если записи вычистят или чтение однажды сломается.
empty_like() {  # empty_like <настоящий файл> <куда>
  mkdir -p "$(dirname "$2")"
  awk 'NR==1 || /^#/ || /^$/ { print; next } { exit }' "$1" > "$2"
}

facts="$work/facts"
for name in decisions limits open noise noise-numbers noise-open; do
  [ -f "$root/docs/facts/$name.tsv" ] && empty_like "$root/docs/facts/$name.tsv" "$facts/$name.tsv"
done
: > "$work/пусто.txt"
mkdir -p "$work/пустой-проект" "$work/пустая-память"

echo "ВОРОТА НА ПУСТОМ ВХОДЕ"

expect_nonzero check-facts-open \
  env FACTS_OPEN="$facts/open.tsv" bash "$root/scripts/check-facts-open.sh"

expect_nonzero check-facts-decisions \
  env FACTS_DECISIONS="$facts/decisions.tsv" bash "$root/scripts/check-facts-decisions.sh"

# Обе стороны, а не одна: пустой реестр при живом протоколе — это расхождение
# (код 1), и на нём защита от пустоты не исполняется. Пустой вход у этих ворот
# означает два нуля сразу, и ровно так они и зеленели до 01.09.2026.
printf '# протокол без таблицы пределов\n\n## 5. Пределы\n\n**конец**\n' > "$work/protocol_RU.md"
expect_nonzero check-facts-limits \
  env FACTS_LIMITS="$facts/limits.tsv" FACTS_PROTOCOL_RU="$work/protocol_RU.md" \
      bash "$root/scripts/check-facts-limits.sh"

expect_nonzero check-facts-coverage \
  env FACTS_DECISIONS="$facts/decisions.tsv" FACTS_NOISE="$facts/noise.tsv" \
      FACTS_LIMITS="$facts/limits.tsv" FACTS_NOISE_NUMBERS="$facts/noise-numbers.tsv" \
      FACTS_OPEN="$facts/open.tsv" FACTS_NOISE_OPEN="$facts/noise-open.tsv" \
      bash "$root/scripts/check-facts-coverage.sh"

expect_nonzero check-panel-reason-labels \
  env REASON_MIGRATION="$work/пусто.txt" REASON_LABELS="$work/пусто.txt" \
      REASON_SCREEN="$work/пусто.txt" bash "$root/scripts/check-panel-reason-labels.sh"

expect_nonzero "ontology --check" \
  python3 "$root/scripts/ontology.py" --check \
    --path "$work/пустой-проект" --memory "$work/пустая-память"

# Узлам подсовывается пул, в котором сверять нечего: бокс объявлен, но адреса
# у него нет. Сеть при этом не трогается — до опроса дело не доходит.
printf '[env.dev]\nimage_tag = "sha-проба"\n' > "$work/environments.toml"
printf '[pool]\ndns_zone = "proba.local"\n\n[[box]]\nid = "n1"\nprovider = "проба"\nenvs = ["dev"]\n' \
  > "$work/inventory.toml"
expect_nonzero check-node-images \
  env NODE_IMAGES_ENVS="$work/environments.toml" \
      NODE_IMAGES_INVENTORY="$work/inventory.toml" \
      bash "$root/scripts/check-node-images.sh"

# Ворота, считающие корень от пути скрипта: копия scripts/ в пустой корень.
fake="$work/группа/xor.ad"
mkdir -p "$fake/scripts" "$fake/docs" \
         "$work/группа/sosed.place/landing" "$work/группа/neighbro.place/landing"
cp "$root/scripts/"*.sh "$fake/scripts/" 2>/dev/null || true

# Вход должен быть пустым, но СУЩЕСТВУЮЩИМ. Замер 01.09.2026: без этих файлов
# check-landing-tokens и check-retired-terms спотыкались о «файла нет» (код 2) и
# до своей ветки «вход есть, но пуст» не доходили ни разу — а именно там у
# check-landing-tokens и жила ложная зелень «проверено токенов: 0».
grep '^#' "$root/docs/retired-terms.txt" > "$fake/docs/retired-terms.txt" || true
: > "$work/группа/sosed.place/landing/index.html"
: > "$work/группа/neighbro.place/landing/index.html"
for gate in check-rules-quota-sentence check-landing-tokens check-retired-terms \
            check-docs-pairing-all; do
  expect_nonzero "$gate" bash "$fake/scripts/$gate.sh"
done

# Невключённое называется вслух — по той же причине, по которой это делает
# check-all.sh: молчаливое исключение неотличимо от забытого. Но одного имени и
# причины мало: «не спрошены» читается как «неизвестно», а это разные вещи.
# Четверо докерных спрошены руками 01.09.2026, и ответ каждого записан здесь —
# все четверо отказались, ложной зелени среди них нет. Замер повторяется, если
# кто-то из них поменяет способ читать свой вход.
echo
echo "проба не гоняет (нужен докер), спрошены руками 01.09.2026:"
printf '  · %-26s код 1 — «в реестре 0, в базе 9»; поднимает postgres\n' check-facts-schema
printf '  · %-26s код 2 — «документов со схемами не найдено»\n' check-mermaid
printf '  · %-26s код 1 — throw «no :root block in App.css» на пустом CSS\n' check-panel-contrast
printf '  · %-26s код 2 — «не нашёл ни одного font-weight в вёрстке»\n' check-panel-font-weights

printf '\nворот спрошено: %d · ложной зелени: %d\n' "$number" "$failures"
[ "$failures" = 0 ] || exit 1
