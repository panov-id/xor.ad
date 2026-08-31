#!/usr/bin/env bash
# Проверка проверки: каждый случай, который scripts/ontology.py обязан ловить,
# здесь сначала ломается и обязан покраснеть.
#
#   scripts/test_ontology.sh
#
# Зачем. Правило проекта: тест, который ни разу не падал, ничего не доказывает.
# У онтологии это особенно легко нарушить — «дефектов нет» печатается и тогда,
# когда скрипт просто не нашёл ни памяти, ни реестров и молча посчитал пустоту
# целой. Поэтому каждый случай идёт парой: сломанное состояние обязано дать
# ожидаемую строку, целое — не дать её.
#
# Настоящая память и настоящие реестры не трогаются: и проект, и память
# собираются во временном каталоге, скрипт наводится на них --path и --memory.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ontology="$here/ontology.py"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0
case_number=0

note() {  # note <каталог> <имя> <тип> <тело>
  mkdir -p "$1"
  { printf -- '---\nname: %s\ndescription: %s\nmetadata:\n  type: %s\n---\n\n' "$2" "проба $2" "$3"
    printf '%s\n' "$4"; } > "$1/$2.md"
}

index() {  # index <каталог> <имя>...
  local dir="$1"; shift
  printf '# Память пробы\n\n' > "$dir/MEMORY.md"
  for name in "$@"; do printf -- '- [%s](%s.md) — проба\n' "$name" "$name" >> "$dir/MEMORY.md"; done
}

expect() {  # expect да|нет <подстрока> <описание> -- <аргументы ontology.py>
  local want="$1" needle="$2" what="$3"; shift 4
  case_number=$((case_number + 1))
  local output; output="$("$ontology" "$@" 2>&1)"
  local seen=нет
  printf '%s' "$output" | grep -qF -- "$needle" && seen=да
  if [ "$seen" = "$want" ]; then
    printf '  ✓ %s\n' "$what"
  else
    failures=$((failures + 1))
    printf '  ✗ %s\n      ждали «%s»: %s, получили: %s\n' "$what" "$needle" "$want" "$seen"
    printf '%s\n' "$output" | sed 's/^/      | /' | head -12
  fi
}

# --- стенд ------------------------------------------------------------------
project="$work/project"; memory="$work/memory"
mkdir -p "$project/docs/facts" "$memory"
printf 'id\tvalues\tunit\n' > "$project/docs/facts/limits.tsv"
printf 'phrase.length\t128\tсимволов\n' >> "$project/docs/facts/limits.tsv"
printf 'shared.id\t7\tштук\n' >> "$project/docs/facts/limits.tsv"
printf 'id\topened\tdue\twhat\tblocks\n' > "$project/docs/facts/open.tsv"
printf 'G1\t2026-08-01\t2026-08-02\tпросроченный пункт пробы\tвыкат\n' >> "$project/docs/facts/open.tsv"
printf 'shared.id\t2026-08-01\t-\tодноимённый в другом реестре\t-\n' >> "$project/docs/facts/open.tsv"
config="$project/docs/facts/ontology.json"
write_config() {  # write_config <реестры-json>
  cat > "$config" <<JSON
{ "documents": [], "gates": [],
  "registries": $1,
  "open_items": {"registry": "open", "due": "due", "what": "what", "blocks": "blocks"} }
JSON
}
both='[{"name":"limits","file":"docs/facts/limits.tsv","id":"id","what":"пределы","checked_by":"-"},
       {"name":"open","file":"docs/facts/open.tsv","id":"id","what":"открытое","checked_by":"-"}]'
write_config "$both"

echo "СЛУЧАИ"

# 1. Положительный контроль: ссылка на существующий факт графа не ломает.
note "$memory" anchor project '- проверяется: [[fact:phrase.length]]'
index "$memory" anchor
expect нет 'ссылка на несуществующий факт' 'существующий [[fact:]] не считается дефектом' \
  -- --check --path "$project" --memory "$memory"
expect да 'дефектов нет' 'граф с опорой на факт объявлен целым' \
  -- --check --path "$project" --memory "$memory"

# 2. Ссылка на факт, которого в реестрах нет.
note "$memory" anchor project '- проверяется: [[fact:phrase.lenght]]'
expect да 'ссылка на несуществующий факт — [[fact:phrase.lenght]]' \
  'опечатка в id факта ловится' -- --check --path "$project" --memory "$memory"

# 3. Один id в двух реестрах: голый адрес перестаёт быть адресом.
note "$memory" anchor project '- проверяется: [[fact:shared.id]]'
expect да 'неоднозначен' 'одноимённый факт требует уточнения «реестр/id»' \
  -- --check --path "$project" --memory "$memory"
note "$memory" anchor project '- проверяется: [[fact:limits/shared.id]]'
expect нет 'неоднозначен' 'уточнённый «реестр/id» принимается' \
  -- --check --path "$project" --memory "$memory"

# 4. Недопустимая пара типов: справочник ничего не «проверяет».
note "$memory" anchor reference '- проверяется: [[fact:phrase.length]]'
expect да 'связь «проверяется» недопустима от reference' 'пара типов проверяется' \
  -- --check --path "$project" --memory "$memory"

# 5. Просроченный пункт, который не держит ни одна заметка.
note "$memory" anchor project '- проверяется: [[fact:phrase.length]]'
expect да 'просроченный пункт G1' 'истёкший срок всплывает в пробелах' \
  -- --check --path "$project" --memory "$memory"
note "$memory" anchor project '- ограничивает: [[fact:open/G1]]'
expect нет 'просроченный пункт G1' 'упомянутый в памяти срок не повторяется' \
  -- --check --path "$project" --memory "$memory"

# 6. Реестр объявлен, а файла нет.
write_config '[{"name":"limits","file":"docs/facts/missing.tsv","id":"id","what":"-","checked_by":"-"}]'
expect да 'реестр limits: файла нет' 'пропавший реестр ловится' \
  -- --check --path "$project" --memory "$memory"

# 7. Битый конфиг — сообщение, а не трассировка.
printf '{ не json\n' > "$config"
expect да 'ontology.json не разбирается' 'битый конфиг сообщает о себе' \
  -- --state --path "$project" --memory "$memory"
expect нет 'Traceback' 'битый конфиг не роняет скрипт' \
  -- --state --path "$project" --memory "$memory"
write_config "$both"

# 8. Пустая память не выдаётся за целый граф.
empty="$work/empty"; mkdir -p "$empty"
expect да 'памяти нет вовсе' 'пустая память названа пустой, а не целой' \
  -- --check --path "$project" --memory "$empty"

# --- число платформы требует опоры --------------------------------------------
# Расхождение «клиент ждёт 146, реестр держит 128» я нашёл руками, читая заметку.
# Машинно оно всплывает только если требовать, чтобы число с единицей опиралось
# на строку реестра.
note "$memory" anchor project '- проверяется: [[fact:phrase.length]]'
note "$memory" loose project 'Предел имени — 24 графемы, и он живёт на узле.'
index "$memory" anchor loose
expect да 'называет число платформы' 'число без опоры на реестр всплывает пробелом' \
  -- --check --path "$project" --memory "$memory"
note "$memory" loose project 'Предел имени — 24 графемы.

- проверяется: [[fact:limits/phrase.length]]'
expect нет 'называет число платформы' 'опёртое на реестр число пробелом не считается' \
  -- --check --path "$project" --memory "$memory"
note "$memory" loose project 'Пишу пост раз в 12 дней, это порядок работы.

- следует из: [[anchor]]'
expect нет 'называет число платформы' 'срок работы под правило не подпадает' \
  -- --check --path "$project" --memory "$memory"
rm -f "$memory/loose.md"; index "$memory" anchor

# --- склонения ----------------------------------------------------------------
# Строку про граф читают каждый старт сессии, и «24 узлов» в ней сообщает ровно
# одно: её никто не читал. Отдельно 11–14 — они ведут себя как «много» вопреки
# последней цифре.
case_number=$((case_number + 1))
forms=$("$ontology" --path "$project" --memory "$memory" --brief >/dev/null 2>&1; python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('o', '$ontology')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
print(' '.join(module.plural(n, 'узел', 'узла', 'узлов') for n in (1, 2, 5, 11, 21, 114)))")
if [ "$forms" = "1 узел 2 узла 5 узлов 11 узлов 21 узел 114 узлов" ]; then
  printf '  ✓ числительные склоняются, включая 11–14\n'
else
  failures=$((failures + 1)); printf '  ✗ числительные: получили «%s»\n' "$forms"
fi

# --- хук старта сессии --------------------------------------------------------
# Проверка, о которой никто не узнает, — не проверка: строка про граф попадает в
# контекст только через хук, и падать он не имеет права ни при каком состоянии
# скрипта. Хука на машине может не быть — тогда случаи пропускаются, а не краснеют.
hook="${CLAUDE_HOME:-$HOME/.claude}/hooks/session-start.sh"
if [ ! -f "$hook" ]; then
  printf '\n  · хук старта не найден (%s) — случаи хука пропущены\n' "$hook"
else
  home="$work/home"; probe="$work/probe"
  mkdir -p "$home/scripts" "$probe/scripts" "$probe/docs/facts"
  cp "$here/../docs/facts/"*.tsv "$here/../docs/facts/ontology.json" "$probe/docs/facts/" 2>/dev/null
  cp "$ontology" "$probe/scripts/ontology.py"
  cp "${CLAUDE_HOME:-$HOME/.claude}/scripts/session-age.sh" "$home/scripts/" 2>/dev/null
  probe_slug=$(printf '%s' "$probe" | sed 's/[^A-Za-z0-9]/-/g')
  probe_memory="$home/projects/$probe_slug/memory"; mkdir -p "$probe_memory"
  note "$probe_memory" anchor project '- проверяется: [[fact:phrase.length]]'
  index "$probe_memory" anchor

  hook_says() {  # hook_says → что хук напечатал про граф
    printf '{"cwd":"%s"}' "$probe" | CLAUDE_HOME="$home" SESSION_START_RAW=1 \
      SESSION_START_STATE="$work/hook.last" bash "$hook" 2>&1
  }
  expect_hook() {  # expect_hook да|нет <подстрока> <описание>
    case_number=$((case_number + 1))
    local output; output=$(hook_says); local code=$?
    local seen=нет
    printf '%s' "$output" | grep -qF -- "$2" && seen=да
    if [ "$seen" = "$1" ] && [ "$code" = 0 ]; then
      printf '  ✓ %s\n' "$3"
    else
      failures=$((failures + 1))
      printf '  ✗ %s (код хука %s, «%s»: %s)\n' "$3" "$code" "$2" "$seen"
    fi
  }

  expect_hook да 'граф памяти цел' 'хук печатает целый граф'
  printf -- '\n- следует из: [[note-that-never-was]]\n' >> "$probe_memory/anchor.md"
  expect_hook да 'ссылка в никуда' 'хук показывает дефект, а не молчит о нём'
  note "$probe_memory" anchor project '- проверяется: [[fact:phrase.length]]'
  chmod -x "$probe/scripts/ontology.py"
  expect_hook нет 'граф памяти' 'без бита исполнения строки нет, хук цел'
  chmod +x "$probe/scripts/ontology.py"
  printf '#!/usr/bin/env python3\nraise SystemExit("сломан нарочно")\n' > "$probe/scripts/ontology.py"
  expect_hook нет 'граф памяти' 'падающий скрипт не роняет хук'
fi

echo
if [ "$failures" -gt 0 ]; then
  printf 'случаев: %s — ПРОВАЛОВ: %s\n' "$case_number" "$failures"; exit 1
fi
printf 'случаев: %s — все ведут себя как объявлено\n' "$case_number"
