#!/usr/bin/env bash
# Проба ворот контракта API: каждое расхождение обязано покраснеть.
#
#   scripts/test_check-openapi.sh
#
# Ворота, чьё падение никто не видел, ничего не доказывают (правило проекта).
# Здесь каждый способ, которым yaml расходится с протоколом, кодом или своей
# страницей, воспроизводится на копии — живые docs/api/* и протокол только читаются.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-openapi.sh"
real_spec="$root/docs/api/openapi.yaml"
real_pages="$root/docs/api"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
spec="$work/openapi.yaml"
pages="$work/pages"
witness="$work/каким-был.yaml"
cp "$real_spec" "$witness" || { echo "не удалось снять спецификацию: $real_spec" >&2; exit 2; }
mkdir -p "$pages"
cp "$real_pages/index_RU.html" "$real_pages/index_EN.html" "$pages/" \
  || { echo "не удалось снять страницы API" >&2; exit 2; }
pages_witness="$work/страницы-какими-были"
cp -r "$pages" "$pages_witness"

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local output; output=$(OPENAPI_SPEC="$spec" OPENAPI_PAGES_DIR="$pages" bash "$gate" 2>&1); local code=$?
  if [ "$code" = "$1" ] && printf '%s' "$output" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1)); printf '  ✗ %s (код %s, ждали %s)\n' "$3" "$code" "$1"
    printf '%s\n' "$output" | tail -4 | sed 's/^/      | /'
  fi
}
reset() { cp "$witness" "$spec"; rm -rf "$pages"; cp -r "$pages_witness" "$pages"; }
mutate() {  # mutate <python-выражение над spec>
  reset
  python3 - "$spec" "$1" <<'PY'
import sys, yaml
path, code = sys.argv[1], sys.argv[2]
spec = yaml.safe_load(open(path, encoding="utf-8"))
exec(code, {"spec": spec})
yaml.safe_dump(spec, open(path, "w", encoding="utf-8"), allow_unicode=True, sort_keys=False)
PY
}

echo "СЛУЧАИ"
reset
expect 0 'протокол и код сходятся' 'нынешняя спецификация в порядке'

# Протокол → спецификация: маршрут дописали в таблицу §4 и забыли в yaml.
mutate 'del spec["paths"]["/feed/density"]["get"]'
expect 1 'есть в таблице §4, а в спецификации нет' 'операция протокола пропала из yaml'

# Спецификация → протокол: описанная операция без строки в таблице.
mutate 'spec["paths"]["/probe/invented"] = {"post": {"summary": "x", "x-summary-ru": "x", "tags": ["probe"], "responses": {"200": {"description": "ok"}}, "x-status": "proposed"}}'
expect 1 'не стоит в таблице §4' 'выдуманная proposed-операция без протокола'

mutate 'spec["paths"]["/feed"]["get"]["x-status"] = "maybe"'
expect 1 'вне built | spec | proposed' 'x-status вне словаря'

mutate 'spec["paths"]["/feed"]["post"].pop("x-summary-ru", None)'
expect 1 'нет x-summary-ru' 'операция без русского summary'

# Код → спецификация: у построенной операции путь обязан стоять в её x-source.
mutate 'spec["paths"]["/v1/me"]["get"]["x-source"] = "relay/node/src/routes/health.ts"'
expect 1 'не стоит в своём x-source' 'построенное ссылается на чужой файл'

mutate 'spec["paths"]["/v1/me"]["get"]["x-source"] = "relay/node/src/routes/нет-такого.ts"'
expect 1 'без x-source на существующий файл' 'x-source в никуда'

# Код → спецификация: маршрут построен, а в yaml built его нет.
mutate 'del spec["paths"]["/v1/me"]'
expect 1 'построен, а в спецификации built его нет' 'построенный маршрут пропал из yaml'

# Страница собрана из другого yaml — ворота обязаны это увидеть.
reset
printf '<!-- правка руками -->\n' >> "$pages/index_RU.html"
expect 1 'страницы устарели' 'страница разошлась со спецификацией'

reset
printf 'openapi: 3.1.0\npaths: [не: закрыто\n' > "$spec"
expect 2 'не читается' 'нечитаемый yaml — отдельный исход'

mutate 'spec["paths"] = {}'
expect 3 'сверять нечего' 'ни одной операции — не зелёный результат'

reset
expect 0 'протокол и код сходятся' 'копия после всех проб цела'

number=$((number + 1))
if cmp -s "$real_spec" "$witness" && cmp -s "$real_pages/index_RU.html" "$pages_witness/index_RU.html" \
   && cmp -s "$real_pages/index_EN.html" "$pages_witness/index_EN.html"; then
  printf '  ✓ живые docs/api/* не тронуты ни одним случаем\n'
else
  failures=$((failures + 1)); printf '  ✗ живой docs/api/* изменился — проба пишет туда, куда не должна\n'
fi

echo
if [ "$failures" -gt 0 ]; then printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$number" "$failures"; exit 1; fi
printf 'случаев: %s — каждое расхождение видно\n' "$number"
