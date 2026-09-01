#!/usr/bin/env bash
# Ворота слоя фактов одной командой.
#
#   scripts/check-all.sh              ворота слоя фактов
#   scripts/check-all.sh --with-tests и пробы самих ворот
#
# ЭТО НЕ ВСЕ ВОРОТА ПРОЕКТА, но с 01.09.2026 почти все: реестры, парность
# документов, граф памяти, текстовые ворота и те, которым хватает контейнера.
# Снаружи остаётся только то, чему нужен живой прод или три скачанных движка, —
# и у каждого исключения печатается причина, а не одно имя. Панель ревью
# 01.09.2026 нашла первую половину беды: заголовок обещал все ворота, скрипт
# звал шесть из восемнадцати, и «пройдено, провалено 0» читалось как полный
# прогон. Вторая половина нашлась в тот же день: check-seo-live, стоявший в
# списке ворот, был тридцатью четырьмя строками печати без единого сравнения и
# не мог покраснеть вовсе.
#
# Зачем вообще. «Прогнать перед докладом» перестало быть действием и стало
# намерением: часть гоняется, часть забывается, и забытая — ровно та, которая
# нашла бы. Здесь их список один, и он же отвечает на вопрос,
# что именно было проверено.
#
# Стенд поднимается сам. Проверка схемы спрашивает живую базу и без неё выходит
# с кодом 2 — это правильно, но в общем прогоне превращалось бы в вечное «база
# не поднята». Если docker есть, стенд поднимается молча; если нет, ворота
# схемы объявляются пропущенными вслух, а не выдаются за пройденные.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
compose="$root/relay/local/docker-compose.yml"
with_tests=0; [ "${1:-}" = --with-tests ] && with_tests=1
# Команда docker подменяема: без этого ветку «докера нет» нечем проверить —
# он лежит в одном каталоге с awk и python3, и PATH под пробу не порежешь.
docker_cmd="${DOCKER:-docker}"

failed=0; passed=0; skipped=0

run() {  # run <имя> <команда...>
  local name="$1"; shift
  local output; output=$("$@" 2>&1); local code=$?
  local last; last=$(printf '%s' "$output" | grep -v '^$' | tail -1)
  if [ "$code" = 0 ]; then
    passed=$((passed + 1)); printf '  ✓ %-26s %s\n' "$name" "$last"
  else
    failed=$((failed + 1)); printf '  ✗ %-26s (код %s)\n' "$name" "$code"
    printf '%s\n' "$output" | tail -12 | sed 's/^/      | /'
  fi
}

stand_ready() {
  "$docker_cmd" compose -f "$compose" exec -T postgres psql -U relay -d relay -tAc 'select 1' \
    >/dev/null 2>&1
}

echo "ВОРОТА"

if ! command -v "$docker_cmd" >/dev/null 2>&1; then
  skipped=$((skipped + 1))
  printf '  · %-26s docker недоступен — схема не проверена\n' check-facts-schema
elif stand_ready || {
       printf '  … поднимаю стенд для проверки схемы\n'
       "$docker_cmd" compose -f "$compose" up -d postgres >/dev/null 2>&1
       for _ in $(seq 1 30); do stand_ready && break; sleep 1; done
       stand_ready
     }; then
  run check-facts-schema bash "$here/check-facts-schema.sh"
else
  skipped=$((skipped + 1))
  printf '  · %-26s стенд не поднялся — схема не проверена\n' check-facts-schema
fi

run check-facts-coverage  bash "$here/check-facts-coverage.sh"
run check-facts-open      bash "$here/check-facts-open.sh"
run check-facts-decisions bash "$here/check-facts-decisions.sh"
run check-facts-limits    bash "$here/check-facts-limits.sh"
run check-docs-pairing    bash "$here/check-docs-pairing-all.sh"
run ontology              python3 "$here/ontology.py" --check

# Ворота, которым нужен только текст: держать их снаружи было нечем оправдать.
run check-landing-tokens       bash "$here/check-landing-tokens.sh"
run check-retired-terms        bash "$here/check-retired-terms.sh"
run check-rules-quota-sentence bash "$here/check-rules-quota-sentence.sh"

# Ворота, которым нужен контейнер. Докера нет — это пропуск с названной
# причиной, а не провал: провал заставил бы обходить его руками, и обходили бы.
run_in_docker() {  # run_in_docker <имя> <путь>
  if command -v "$docker_cmd" >/dev/null 2>&1; then
    run "$1" bash "$2"
  else
    skipped=$((skipped + 1))
    printf '  · %-26s docker недоступен — не проверено\n' "$1"
  fi
}
run_in_docker check-mermaid            "$here/check-mermaid.sh"
run_in_docker check-panel-contrast     "$here/check-panel-contrast.sh"
run_in_docker check-panel-font-weights "$here/check-panel-font-weights.sh"

if [ "$with_tests" = 1 ]; then
  echo
  echo "ПРОБЫ ВОРОТ"
  run test_ontology            bash "$here/test_ontology.sh"
  run test_check-facts-coverage bash "$here/test_check-facts-coverage.sh"
  run test_check-facts-open     bash "$here/test_check-facts-open.sh"
  [ "$skipped" = 0 ] && run test_check-facts-schema bash "$here/test_check-facts-schema.sh"
fi

# Невключённое называется вслух: молчаливое исключение — та же ложная зелень,
# только медленнее. Голого списка имён мало: имя не объясняет, почему ворота
# снаружи, и через месяц исключение выглядит случайным, а случайное втягивают
# обратно не глядя. Поэтому у каждого — причина.
reason_for() {
  case "$1" in
    check-seo-live)          echo "живые адреса прода" ;;
    check-consent-gate)      echo "живые адреса прода, браузер в контейнере" ;;
    check-analytics-gate)    echo "живые адреса прода, чистый профиль браузера" ;;
    check-webcrypto-support) echo "качает три движка на каждый прогон; это замер, а не ворота" ;;
    check-docs-pairing)      echo "не самостоятельные ворота: зовётся из check-docs-pairing-all" ;;
    *)                       echo "причина не записана — впишите её сюда" ;;
  esac
}

# Включённость определяется по вызываемому ПУТИ, и это третья попытка.
# По любому упоминанию имени — ворота, которым дописали причину, объявлялись
# включёнными и исчезали из списка вместе с объяснением. По строке «run <имя>» —
# терялись двое: check-docs-pairing-all зовётся под меткой check-docs-pairing, а
# check-facts-schema стоит с отступом внутри ветки про докер. Путь врать не умеет:
# файл либо запускается, либо нет.
outside=""
for gate in "$here"/check-*.sh; do
  name=$(basename "$gate" .sh)
  [ "$name" = check-all ] && continue          # это раннер, а не ворота
  grep -qF "\$here/${name}.sh" "$0" || outside="$outside $name"
done

echo
if [ -n "$outside" ]; then
  echo "сюда не входят (гонять отдельно):"
  for name in $outside; do
    printf '  · %-26s %s\n' "$name" "$(reason_for "$name")"
  done
fi
printf 'пройдено %s, провалено %s, пропущено %s\n' "$passed" "$failed" "$skipped"
[ "$failed" -gt 0 ] && exit 1
[ "$skipped" -gt 0 ] && printf 'внимание: пропущенное не проверено и не может считаться зелёным\n'
exit 0
