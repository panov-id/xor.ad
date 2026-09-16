#!/usr/bin/env bash
# Контракт API против протокола, кода и собственной страницы.
#
#   scripts/check-openapi.sh
#
# Зачем. 15.09.2026 владелец добавил в проектирование слой API: docs/api/openapi.yaml —
# канон контракта, спецификация первая. Канон, который никто не сверяет, через
# неделю врёт: маршрут дописывают в протокол и забывают в yaml, или строят в коде
# и не описывают вовсе. Здесь сверка идёт в обе стороны с каждым источником.
#
#   форма        у каждой операции summary, x-summary-ru, tags, responses и x-status
#                из built | spec | proposed; у built — x-source на существующий файл
#   протокол     строка `| \`МЕТОД путь\` |` таблиц §4 protocol_RU.md и protocol_EN.md
#                ↔ операция spec/proposed в yaml; путь с :id равен пути с {id}
#   код          строка «МЕТОД /путь» или литерал /admin/…, /v1/… в relay/node/src/routes
#                ↔ операция built в yaml; у built путь обязан стоять в своём x-source
#   страница     docs/api/index_RU.html и index_EN.html собраны из нынешнего yaml
#
# Коды выхода: 0 — сошлось; 1 — расхождение; 2 — нет спецификации или она не
# читается; 3 — операций ноль, сверять нечего.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
export OPENAPI_SPEC="${OPENAPI_SPEC:-$root/docs/api/openapi.yaml}"
export OPENAPI_PROTOCOL_RU="${OPENAPI_PROTOCOL_RU:-$root/docs/protocol_RU.md}"
export OPENAPI_PROTOCOL_EN="${OPENAPI_PROTOCOL_EN:-$root/docs/protocol_EN.md}"
export OPENAPI_ROUTES_DIR="${OPENAPI_ROUTES_DIR:-$root/relay/node/src/routes}"
export OPENAPI_PAGES_DIR="${OPENAPI_PAGES_DIR:-$root/docs/api}"
export OPENAPI_ROOT="$root"

[ -f "$OPENAPI_SPEC" ] || { echo "нет спецификации: $OPENAPI_SPEC" >&2; exit 2; }

python3 - <<'PY'
import os, pathlib, re, sys
import yaml

root = pathlib.Path(os.environ["OPENAPI_ROOT"])
spec_path = pathlib.Path(os.environ["OPENAPI_SPEC"])
methods = ("get", "post", "put", "patch", "delete")
statuses = {"built", "spec", "proposed"}
problems = []

try:
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
except yaml.YAMLError as problem:
    print(f"спецификация не читается: {problem}", file=sys.stderr)
    sys.exit(2)

# Дубли ключей и порванные flow-описания (панель 16.09.2026, CON-21): PyYAML молча берёт
# последний из двух одинаковых ключей, а незакавыченное описание с запятой внутри
# `{…}` режется на два ключа — схема кривая, парсер не падает. Ловим оба обходом дерева.
class _Dups(yaml.SafeLoader):
    pass
def _mapping(loader, node):
    seen = set()
    for k, _v in node.value:
        if k.tag == "tag:yaml.org,2002:merge":
            continue
        key = loader.construct_object(k)
        if key in seen:
            problems.append(f"дубль ключа «{key}» в строке {k.start_mark.line + 1}")
        if isinstance(key, str) and (key.endswith(")." ) or key.endswith("true.") or key.endswith("false.")):
            problems.append(f"порванное flow-описание: ключ «{key}» в строке {k.start_mark.line + 1} — возьмите текст в кавычки")
        seen.add(key)
    return loader.construct_mapping(node)
_Dups.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)
yaml.load(spec_path.read_text(encoding="utf-8"), Loader=_Dups)
if not isinstance(spec, dict) or not str(spec.get("openapi", "")).startswith("3.1"):
    problems.append("спецификация не OpenAPI 3.1: поле openapi обязано начинаться с 3.1")

def norm(path):
    return re.sub(r":([A-Za-z_][A-Za-z0-9_]*)", r"{\1}", path.rstrip("/") or "/")

ops = {}
for path, item in (spec.get("paths") or {}).items() if isinstance(spec, dict) else []:
    for method in methods:
        if method not in (item or {}):
            continue
        op = item[method] or {}
        key = (method.upper(), norm(path))
        ops[key] = op
        name = f"{method.upper()} {path}"
        for field in ("summary", "x-summary-ru", "tags", "responses"):
            if not op.get(field):
                problems.append(f"{name}: нет {field}")
        status = op.get("x-status")
        if status not in statuses:
            problems.append(f"{name}: x-status «{status}» вне built | spec | proposed")
        if status == "built":
            source = op.get("x-source", "")
            target = root / source
            if not source or not target.is_file():
                problems.append(f"{name}: построенное без x-source на существующий файл — «{source}»")
            else:
                literal = re.sub(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", r":\1", path)
                if literal not in target.read_text(encoding="utf-8"):
                    problems.append(f"{name}: путь «{literal}» не стоит в своём x-source {source}")

if not ops:
    print("в спецификации ни одной операции — сверять нечего, это не зелёный результат")
    sys.exit(3)

row = re.compile(r"^\|\s*`(GET|POST|PUT|PATCH|DELETE)\s+(/[^`\s]*)`\s*\|")
for env in ("OPENAPI_PROTOCOL_RU", "OPENAPI_PROTOCOL_EN"):
    protocol = pathlib.Path(os.environ[env])
    if not protocol.is_file():
        print(f"нет протокола: {protocol}", file=sys.stderr)
        sys.exit(2)
    inside, rows = False, set()
    for line in protocol.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = line.startswith("## 4.")
        if inside and (m := row.match(line)):
            rows.add((m.group(1), norm(m.group(2))))
    for method, path in sorted(rows):
        if (method, path) not in ops:
            problems.append(f"{protocol.name}: маршрут {method} {path} есть в таблице §4, а в спецификации нет")
        elif ops[(method, path)].get("x-status") == "built":
            pass
    for (method, path), op in sorted(ops.items()):
        if op.get("x-status") in ("spec", "proposed") and (method, path) not in rows:
            problems.append(f"{protocol.name}: операция {method} {path} ({op.get('x-status')}) не стоит в таблице §4")

routes = pathlib.Path(os.environ["OPENAPI_ROUTES_DIR"])
if not routes.is_dir():
    print(f"нет каталога маршрутов: {routes}", file=sys.stderr)
    sys.exit(2)
built_pairs = {(method, path) for (method, path), op in ops.items() if op.get("x-status") == "built"}
# Маршруты узла объявлены двумя способами, и оба читаются: точная карта
# `"GET /health": …` в main.ts и `route("POST", "/auth/request-link", …)` в
# routes/*.ts (lib/router.ts). Первая версия ворот знала только литералы
# /admin/… и /v1/… в routes/ — карту main.ts и /auth/* она бы не увидела вовсе
# (опись маршрутов 15.09.2026).
pair = re.compile(r"[\"'`](GET|POST|PUT|PATCH|DELETE) (/[A-Za-z0-9_:./-]*)[\"'`]\s*:")
declared = re.compile(r"\broute\(\s*[\"'`](GET|POST|PUT|PATCH|DELETE)[\"'`]\s*,\s*[\"'`](/[A-Za-z0-9_:./-]*)[\"'`]")
sources = sorted(routes.glob("*.ts"))
main = routes.parent / "main.ts"
if main.is_file():
    sources.append(main)
code_pairs = set()
for source in sources:
    body = source.read_text(encoding="utf-8")
    for m in list(pair.finditer(body)) + list(declared.finditer(body)):
        key = (m.group(1), norm(m.group(2)))
        code_pairs.add(key)
        if key not in built_pairs:
            problems.append(f"{source.name}: маршрут {key[0]} {key[1]} построен, а в спецификации built его нет")
for method, path in sorted(built_pairs - code_pairs):
    problems.append(f"спецификация: {method} {path} помечен built, а в main.ts и routes/*.ts такого маршрута нет")

for line in problems:
    print(f"  ✗ {line}")
counts = {s: sum(1 for op in ops.values() if op.get("x-status") == s) for s in ("built", "spec", "proposed")}
summary = f"операций: {len(ops)} (built {counts['built']}, spec {counts['spec']}, proposed {counts['proposed']})"
if problems:
    print(f"\n{summary} — РАСХОЖДЕНИЙ: {len(problems)}")
    sys.exit(1)
print(f"{summary} — протокол и код сходятся со спецификацией")
PY
code=$?
[ "$code" = 0 ] || exit "$code"

python3 "$here/render-openapi.py" --check || exit 1
