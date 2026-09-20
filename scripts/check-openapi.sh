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
import json, os, pathlib, re, sys
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
        # Первая версия правила знала три хвоста — «).», «true.», «false.» — и мимо
        # неё 20.09.2026 прошли 33 порванных описания: хвост кончается обычным словом
        # с точкой, русским чаще, чем английским. Имён полей с точкой на конце в
        # OpenAPI не бывает, поэтому правило теперь по точке, а не по словарю; кавычка
        # на конце — след разреза уже закавыченного описания.
        if isinstance(key, str) and key.rstrip("\"'").endswith("."):
            problems.append(f"порванное flow-описание: ключ «{key}» в строке {k.start_mark.line + 1} — возьмите текст в кавычки (scripts/fix-openapi-flow-descriptions.py чинит)")
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

# Время: протокол §1 знает одно представление — unix-секунды, UTC, «часовых поясов
# в протоколе нет нигде». 20.09.2026 в контракте стояло 21 поле format: date-time
# против одного в секундах. Кабинет заведения протоколом не описан, и его шесть
# полей остаются в ISO — поэтому правило знает границу поимённо.
cabinet = {"Venue", "OfferCreate", "AdvOffer"}
schemas = (spec.get("components", {}).get("schemas") or {})

def iso_fields(node, where):
    if isinstance(node, dict):
        if node.get("format") == "date-time":
            yield where
        for key, value in node.items():
            yield from iso_fields(value, f"{where}.{key}" if key != "properties" else where)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from iso_fields(value, f"{where}[{index}]")

for name, schema in schemas.items():
    if name in cabinet:
        continue
    for where in iso_fields(schema, name):
        problems.append(
            f"время: {where} стоит в format: date-time, а протокол §1 знает только unix-секунды "
            "— scripts/unix-time-in-contract.py переводит"
        )
for (method, path), op in sorted(ops.items()):
    if path.startswith("/adv/"):
        continue
    for where in iso_fields(op, f"{method} {path}"):
        problems.append(
            f"время: {where} стоит в format: date-time, а протокол §1 знает только unix-секунды"
        )

# Подписанные операции: 401 и три заголовка §2.
#
# 20.09.2026 панель насчитала 69 операций с identitySignature и ноль описанных
# ответов 401 — самый частый отказ подписанного API в контракте отсутствовал, а
# код unauthorized из закрытого списка §6 не соответствовал ни одному маршруту.
# Схема безопасности при этом умеет назвать один заголовок из трёх, поэтому
# x-identity-session и x-identity-time объявлены параметрами: клиент, собранный
# по контракту без них, получал бы 401 на каждом запросе.
for (method, path), op in sorted(ops.items()):
    if not any("identitySignature" in entry for entry in op.get("security") or []):
        continue
    name = f"{method} {path}"
    if "401" not in (op.get("responses") or {}):
        problems.append(
            f"{name}: подписана, а ответа 401 не описывает — "
            "scripts/add-signed-operation-refs.py дописывает"
        )
    # §6: во время отлучки отвечают только три маршрута, всё остальное подписанное
    # даёт 409 stepped_away. Три исключения названы поимённо здесь, а не выведены.
    if (method, path) not in {("DELETE", "/away"), ("GET", "/identities/me"), ("POST", "/identities/close")}:
        if "409" not in (op.get("responses") or {}):
            problems.append(
                f"{name}: подписана и не исключение §6, а ответа 409 не описывает — "
                "в отлучке клиент получит неописанный статус"
            )
        else:
            # Тело обязано допускать ApiError: без него код stepped_away невыразим,
            # и 409 описан как что угодно, только не то, что придёт в отлучке.
            shape = op["responses"]["409"]
            ref = re.match(r"#/components/responses/(\w+)$", (shape or {}).get("$ref", "") or "")
            if ref:
                shape = (spec.get("components", {}).get("responses") or {}).get(ref.group(1), {})
            if "ApiError" not in json.dumps(shape, ensure_ascii=False):
                problems.append(
                    f"{name}: её 409 не допускает ApiError — код stepped_away в нём невыразим"
                )
    declared = json.dumps(op.get("parameters") or [], ensure_ascii=False)
    for parameter in ("IdentitySession", "IdentityTime", "ProtocolVersion"):
        if f"components/parameters/{parameter}" not in declared:
            problems.append(f"{name}: подписана, а параметра {parameter} не объявляет")

# Одноразовые действия: три источника, которые обязаны говорить одно.
#
#   протокол §2     список маршрутов, несущих nonce
#   CHECK route     те же маршруты в DDL таблицы nonces (миграция шага 1)
#   тела в yaml     схемы, требующие поле nonce
#
# 20.09.2026 они разъехались молча: поле стояло у двенадцати схем при семи
# разрешённых маршрутах, и у POST /identities — маршрута без сессии — строку в
# таблицу с session_id NOT NULL положить было нельзя в принципе. Ни одни ворота
# этого не видели: слова «nonce» в них не было вовсе. Сверка идёт по кругу:
# схема с nonce → операции, которые её принимают → маршрут → §2 и CHECK.
migration = root / "relay/node/db/022_identity_and_sessions.sql"
if migration.is_file():
    body = migration.read_text(encoding="utf-8")
    check = re.search(r"route\s+text NOT NULL CHECK \(route IN \((.*?)\)\)", body, re.S)
    ddl_routes = set(re.findall(r"'((?:GET|POST|PUT|PATCH|DELETE) /[^']*)'", check.group(1))) if check else set()

    nonce_schemas = {
        name for name, schema in (spec.get("components", {}).get("schemas") or {}).items()
        if name != "Nonce" and "nonce" in (schema or {}).get("properties", {})
    }
    nonce_routes = set()
    for (method, path), op in ops.items():
        ref = json.dumps((op.get("requestBody") or {}), ensure_ascii=False)
        for name in nonce_schemas:
            if f'"#/components/schemas/{name}"' in ref:
                nonce_routes.add(f"{method} {path}")

    # Список §2 переносится по строкам, поэтому читается абзацем, а не построчно:
    # построчный вариант терял POST /support и POST /recovery/reissue — они стоят
    # на строке, где слова «nonce» нет (замерено 20.09.2026).
    section = pathlib.Path(os.environ["OPENAPI_PROTOCOL_RU"]).read_text(encoding="utf-8")
    section = section.split("## 2.", 1)[-1].split("## 3.", 1)[0]
    flat = " ".join(section.split())
    protocol_routes = set()
    marker = flat.find("несут в теле поле")
    if marker > 0:
        protocol_routes = {
            f"{m} {p}"
            for m, p in re.findall(r"`(GET|POST|PUT|PATCH|DELETE) (/[^`\s]*)`", flat[:marker][-500:])
        }
    else:
        problems.append("protocol_RU.md §2: не нашёл фразы «несут в теле поле» — список одноразовых маршрутов не читается")

    if not ddl_routes:
        problems.append("миграция шага 1: CHECK на nonces.route не читается — сверять одноразовость не с чем")
    for route in sorted(nonce_routes - ddl_routes):
        problems.append(
            f"одноразовость: {route} требует nonce в теле, а в CHECK nonces.route его нет — "
            "запись пары упадёт на ограничении"
        )
    for route in sorted(ddl_routes - nonce_routes):
        problems.append(
            f"одноразовость: {route} стоит в CHECK nonces.route, а ни одно тело контракта nonce не требует"
        )
    for route in sorted(ddl_routes - protocol_routes):
        problems.append(
            f"одноразовость: {route} стоит в CHECK nonces.route, а §2 protocol_RU.md его не называет"
        )

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
