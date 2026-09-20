#!/usr/bin/env bash
# Проба починки порванных описаний: каждый разрез обязан склеиться, и ничего кроме.
#
#   scripts/test_fix-openapi-flow-descriptions.sh
#
# Скрипт, чьё падение никто не видел, ничего не доказывает (правило проекта). Здесь
# порванные описания воспроизводятся на копии — живой docs/api/openapi.yaml только
# читается, — и после починки разбор сверяется ключ за ключом: хвосты-пустышки обязаны
# исчезнуть, новых ключей не появиться, а соседнее описание остаться нетронутым.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fix="$here/fix-openapi-flow-descriptions.py"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

say() { printf '  %s %s\n' "$1" "$2"; }
ok() { say "✓" "$1"; }
bad() { say "✗" "$1"; failures=$((failures + 1)); }

# Каждый случай — минимальная спецификация с одним разрезом.
make_spec() {
  cat > "$work/openapi.yaml" <<YAML
openapi: 3.1.0
info: {title: проба, version: "1"}
paths: {}
components:
  schemas:
    Проба:
      type: object
      properties:
$1
YAML
}

# 1. Незакавыченное русское описание с запятой — классический разрез.
make_spec '        поле: {type: string, description: A name, awaiting a verdict., x-description-ru: Имя, ждущее вердикта.}'
python3 "$fix" "$work/openapi.yaml" > /dev/null
python3 - "$work/openapi.yaml" <<'PY' && ok "русское описание склеено целиком" || bad "русское описание не склеилось"
import sys, yaml
spec = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
field = spec["components"]["schemas"]["Проба"]["properties"]["поле"]
assert set(field) == {"type", "description", "x-description-ru"}, sorted(field)
assert field["description"] == "A name, awaiting a verdict.", field["description"]
assert field["x-description-ru"] == "Имя, ждущее вердикта.", field["x-description-ru"]
PY

# 2. Левое описание не имеет права проглотить правое (строка 665 канона, 20.09.2026).
make_spec '        поле: {type: string, description: base64url, at most N bytes., x-description-ru: base64url, не больше N байт.}'
python3 "$fix" "$work/openapi.yaml" > /dev/null
python3 - "$work/openapi.yaml" <<'PY' && ok "два описания на строке склеены порознь" || bad "одно описание проглотило другое"
import sys, yaml
field = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))["components"]["schemas"]["Проба"]["properties"]["поле"]
assert field["description"] == "base64url, at most N bytes.", field["description"]
assert field["x-description-ru"] == "base64url, не больше N байт.", field["x-description-ru"]
PY

# 3. Уже закавыченное описание рядом с порванным не трогается.
make_spec '        поле: {type: string, description: "Quoted, intact.", x-description-ru: Русское, порванное.}'
python3 "$fix" "$work/openapi.yaml" > /dev/null
python3 - "$work/openapi.yaml" <<'PY' && ok "закавыченный сосед не тронут" || bad "закавыченный сосед пострадал"
import sys, yaml
field = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))["components"]["schemas"]["Проба"]["properties"]["поле"]
assert field["description"] == "Quoted, intact.", field["description"]
assert field["x-description-ru"] == "Русское, порванное.", field["x-description-ru"]
PY

# 4. --check не правит файл и краснеет.
make_spec '        поле: {type: string, x-description-ru: Имя, ждущее вердикта.}'
before="$(md5sum < "$work/openapi.yaml")"
python3 "$fix" --check "$work/openapi.yaml" > /dev/null
code=$?
after="$(md5sum < "$work/openapi.yaml")"
if [ "$code" = 1 ] && [ "$before" = "$after" ]; then
  ok "--check краснеет и файл не трогает"
else
  bad "--check: код $code, файл изменён: $([ "$before" = "$after" ] && echo нет || echo да)"
fi

# 5. Целый файл остаётся целым и код нулевой.
make_spec '        поле: {type: string, description: "Whole, already.", x-description-ru: "Целое, уже."}'
before="$(md5sum < "$work/openapi.yaml")"
python3 "$fix" "$work/openapi.yaml" > /dev/null
code=$?
after="$(md5sum < "$work/openapi.yaml")"
if [ "$code" = 0 ] && [ "$before" = "$after" ]; then
  ok "на целом файле — ноль и ни одной правки"
else
  bad "на целом файле: код $code, файл изменён: $([ "$before" = "$after" ] && echo нет || echo да)"
fi

if [ "$failures" != 0 ]; then
  echo "проб не прошло: $failures"
  exit 1
fi
echo "починка описаний: все пробы зелёные"
