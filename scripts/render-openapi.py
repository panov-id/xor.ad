#!/usr/bin/env python3
"""Страница API из docs/api/openapi.yaml — своя, без Swagger UI и внешних ресурсов.

    scripts/render-openapi.py            собрать docs/api/index_RU.html и index_EN.html
    scripts/render-openapi.py --check    собрать во временный каталог и сравнить с лежащими

Зачем своя. 15.09.2026 владелец решил: контракт лежит в репозитории, смотреть его
удобнее через браузер, а сторонние сервисы наружу не светить. Готовые рендеры тянут
скрипты и шрифты с чужих CDN — ровно то, чего не хотели. Здесь страница собирается
из yaml целиком: стили внутри, скриптов нет, шрифты системные.

Две страницы, а не одна с переключателем, по правилу пар проекта: русская берёт
`x-summary-ru` и `x-description-ru`, английская — `summary` и `description`.

Вывод детерминирован — ни времени сборки, ни случайных id: иначе `--check` краснел
бы на каждом прогоне и перестал бы что-либо значить.

Коды выхода: 0 — собрано или совпадает; 1 — лежащие страницы устарели; 2 — нет
спецификации или она не читается.
"""
import html
import json
import os
import pathlib
import sys
import tempfile

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = pathlib.Path(os.environ.get("OPENAPI_SPEC", ROOT / "docs/api/openapi.yaml"))
PAGES = pathlib.Path(os.environ.get("OPENAPI_PAGES_DIR", ROOT / "docs/api"))
METHODS = ("get", "post", "put", "patch", "delete")

WORDS = {
    "ru": {
        "title": "API узла", "lead": "Контракт узла relay: построенное и описанное. Источник — docs/api/openapi.yaml.",
        "status": {"built": "построено", "spec": "спека", "proposed": "предложено"},
        "internal": "служебное", "params": "Параметры", "body": "Тело запроса", "responses": "Ответы",
        "auth": "Доступ", "none": "без доступа", "schemas": "Схемы", "name": "Имя", "in": "Где",
        "type": "Тип", "required": "Обязательно", "yes": "да", "no": "нет", "notes": "Примечание",
        "source": "Источник", "count": "операций", "other": "Прочее", "lang": "English",
    },
    "en": {
        "title": "Node API", "lead": "The relay node contract: what is built and what is described. Source — docs/api/openapi.yaml.",
        "status": {"built": "built", "spec": "spec", "proposed": "proposed"},
        "internal": "internal", "params": "Parameters", "body": "Request body", "responses": "Responses",
        "auth": "Access", "none": "no access control", "schemas": "Schemas", "name": "Name", "in": "In",
        "type": "Type", "required": "Required", "yes": "yes", "no": "no", "notes": "Notes",
        "source": "Source", "count": "operations", "other": "Other", "lang": "Русский",
    },
}

CSS = """
:root{--bg:#f6f5f2;--panel:#ffffff;--fg:#1c1b19;--muted:#5b5853;--line:#d9d6cf;--accent:#8a3b1f;
--built:#1f6b3a;--built-bg:#e3f1e7;--spec:#7a5300;--spec-bg:#fbf0d6;--prop:#4a4f57;--prop-bg:#e8eaee;
--get:#1e5aa8;--post:#1f6b3a;--put:#7a5300;--patch:#6a3d9a;--delete:#a12a24}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15161a;--panel:#1d1f24;--fg:#ecebe8;
--muted:#a8a59e;--line:#34363d;--accent:#e08a66;--built:#7fd49b;--built-bg:#1d3326;--spec:#f0c06a;--spec-bg:#3a2f16;
--prop:#b9bec7;--prop-bg:#2c2f36;--get:#8db8f2;--post:#7fd49b;--put:#f0c06a;--patch:#c3a3ee;--delete:#f09a93}}
:root[data-theme="dark"]{--bg:#15161a;--panel:#1d1f24;--fg:#ecebe8;--muted:#a8a59e;--line:#34363d;--accent:#e08a66;
--built:#7fd49b;--built-bg:#1d3326;--spec:#f0c06a;--spec-bg:#3a2f16;--prop:#b9bec7;--prop-bg:#2c2f36;--get:#8db8f2;
--post:#7fd49b;--put:#f0c06a;--patch:#c3a3ee;--delete:#f09a93}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
padding-inline:16px;padding-block:24px 64px}
main{max-width:980px;margin:0 auto}
h1{font-size:28px;margin:0 0 4px}h2{font-size:21px;margin:40px 0 12px;padding-top:8px;border-top:2px solid var(--line)}
h3{font-size:15px;margin:18px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
p{margin:6px 0}a{color:var(--accent)}
code,.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:14px}
.lead{color:var(--muted)}.top{display:flex;gap:16px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
nav.toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:16px 0}
.op{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:12px 0}
.op-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.method{font:700 13px/1 ui-monospace,Menlo,monospace;text-transform:uppercase;padding:5px 8px;border-radius:5px;
border:2px solid currentColor;min-width:64px;text-align:center}
.m-get{color:var(--get)}.m-post{color:var(--post)}.m-put{color:var(--put)}.m-patch{color:var(--patch)}.m-delete{color:var(--delete)}
.path{font-weight:600;word-break:break-all}
.chip{font-size:13px;padding:2px 8px;border-radius:999px}
.s-built{color:var(--built);background:var(--built-bg)}.s-spec{color:var(--spec);background:var(--spec-bg)}
.s-proposed{color:var(--prop);background:var(--prop-bg)}.internal{color:var(--muted);border:1px dashed var(--line)}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:6px 8px}th{color:var(--muted);font-weight:600}
.src{color:var(--muted);font-size:13px}
pre{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;overflow-x:auto;margin:6px 0}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
"""


def text(node, key, lang):
    if lang == "ru":
        return node.get(f"x-{key}-ru") or node.get(key) or ""
    return node.get(key) or ""


def esc(value):
    return html.escape(str(value), quote=True)


def slug(*parts):
    return "-".join("".join(ch if ch.isalnum() else "-" for ch in str(p).lower()).strip("-") for p in parts)


def type_of(schema):
    if not isinstance(schema, dict):
        return ""
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        return f'<a href="#schema-{esc(slug(name))}"><code>{esc(name)}</code></a>'
    kind = schema.get("type", "")
    if isinstance(kind, list):
        kind = " | ".join(kind)
    if kind == "array":
        return f"array&lt;{type_of(schema.get('items', {}))}&gt;"
    extra = []
    for key in ("format", "enum", "minLength", "maxLength", "minimum", "maximum", "pattern", "const"):
        if key in schema:
            extra.append(f"{key}: {json.dumps(schema[key], ensure_ascii=False)}")
    kind = esc(kind or "object")
    return f"<code>{kind}</code>" + (f' <span class="src">{esc(", ".join(extra))}</span>' if extra else "")


def schema_table(schema, words, lang):
    if not isinstance(schema, dict):
        return ""
    if "$ref" in schema:
        return f"<p>{type_of(schema)}</p>"
    props = schema.get("properties") or {}
    if not props:
        return f"<p>{type_of(schema)}</p>"
    required = set(schema.get("required") or [])
    rows = []
    for name, prop in props.items():
        rows.append(
            f"<tr><td><code>{esc(name)}</code></td><td>{type_of(prop)}</td>"
            f"<td>{words['yes'] if name in required else words['no']}</td>"
            f"<td>{esc(text(prop, 'description', lang))}</td></tr>")
    return (f'<div class="table"><table><tr><th>{words["name"]}</th><th>{words["type"]}</th>'
            f'<th>{words["required"]}</th><th>{words["notes"]}</th></tr>{"".join(rows)}</table></div>')


def operation(path, method, op, spec, words, lang):
    status = op.get("x-status", "")
    chips = f'<span class="chip s-{esc(status)}">{esc(words["status"].get(status, status))}</span>'
    if op.get("x-internal"):
        chips += f' <span class="chip internal">{words["internal"]}</span>'
    parts = [f'<section class="op" id="{esc(slug(method, path))}">',
             f'<div class="op-head"><span class="method m-{method}">{method}</span>'
             f'<code class="path">{esc(path)}</code>{chips}</div>']
    summary = text(op, "summary", lang)
    if summary:
        parts.append(f"<p><strong>{esc(summary)}</strong></p>")
    description = text(op, "description", lang)
    if description:
        parts += [f"<p>{esc(line)}</p>" for line in description.strip().split("\n\n")]
    security = op.get("security", spec.get("security"))
    schemes = spec.get("components", {}).get("securitySchemes", {})
    if security is not None:
        names = [name for requirement in security for name in requirement] if security else []
        labels = [text(schemes.get(n, {}), "description", lang).split(".")[0] or n for n in names]
        parts.append(f"<h3>{words['auth']}</h3><p>{esc(', '.join(labels) or words['none'])}</p>")
    params = op.get("parameters") or []
    if params:
        rows = "".join(
            f"<tr><td><code>{esc(p.get('name', ''))}</code></td><td>{esc(p.get('in', ''))}</td>"
            f"<td>{type_of(p.get('schema', {}))}</td><td>{words['yes'] if p.get('required') else words['no']}</td>"
            f"<td>{esc(text(p, 'description', lang))}</td></tr>" for p in params)
        parts.append(f'<h3>{words["params"]}</h3><div class="table"><table><tr><th>{words["name"]}</th>'
                     f'<th>{words["in"]}</th><th>{words["type"]}</th><th>{words["required"]}</th>'
                     f'<th>{words["notes"]}</th></tr>{rows}</table></div>')
    body = op.get("requestBody")
    if body:
        for media, content in (body.get("content") or {}).items():
            parts.append(f"<h3>{words['body']} · <code>{esc(media)}</code></h3>")
            parts.append(schema_table(content.get("schema", {}), words, lang))
    responses = op.get("responses") or {}
    if responses:
        rows = []
        for code, response in responses.items():
            schema = ""
            for media, content in (response.get("content") or {}).items():
                schema = type_of(content.get("schema", {}))
            rows.append(f"<tr><td><code>{esc(code)}</code></td><td>{esc(text(response, 'description', lang))}</td>"
                        f"<td>{schema}</td></tr>")
        parts.append(f'<h3>{words["responses"]}</h3><div class="table"><table>{"".join(rows)}</table></div>')
    if op.get("x-source"):
        parts.append(f'<p class="src">{words["source"]}: <code>{esc(op["x-source"])}</code></p>')
    parts.append("</section>")
    return "\n".join(parts)


def render(spec, lang):
    words = WORDS[lang]
    other = "index_EN.html" if lang == "ru" else "index_RU.html"
    tags = [t.get("name") for t in spec.get("tags", [])]
    by_tag = {name: [] for name in tags}
    count = 0
    for path, item in (spec.get("paths") or {}).items():
        for method in METHODS:
            if method in item:
                op = item[method]
                tag = (op.get("tags") or [words["other"]])[0]
                by_tag.setdefault(tag, []).append((path, method, op))
                count += 1
    tag_meta = {t.get("name"): t for t in spec.get("tags", [])}
    info = spec.get("info", {})
    out = [f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1">'
           f"<title>{esc(words['title'])} · {esc(info.get('version', ''))}</title><style>{CSS}</style></head><body><main>",
           f'<div class="top"><h1>{esc(words["title"])}</h1><a href="{other}">{words["lang"]}</a></div>',
           f'<p class="lead">{esc(words["lead"])} {count} {words["count"]}, OpenAPI {esc(spec.get("openapi", ""))}, '
           f'{esc(info.get("version", ""))}.</p>']
    out.append('<nav class="toc">' + "".join(
        f'<a href="#tag-{esc(slug(name))}">{esc(name)}</a>' for name in by_tag if by_tag[name]) +
        f'<a href="#schemas">{words["schemas"]}</a></nav>')
    for name, ops in by_tag.items():
        if not ops:
            continue
        out.append(f'<h2 id="tag-{esc(slug(name))}">{esc(name)}</h2>')
        described = text(tag_meta.get(name, {}), "description", lang)
        if described:
            out.append(f"<p>{esc(described)}</p>")
        out += [operation(path, method, op, spec, words, lang) for path, method, op in ops]
    schemas = spec.get("components", {}).get("schemas", {})
    if schemas:
        out.append(f'<h2 id="schemas">{words["schemas"]}</h2>')
        for name, schema in schemas.items():
            out.append(f'<section class="op" id="schema-{esc(slug(name))}"><div class="op-head">'
                       f'<code class="path">{esc(name)}</code></div>')
            described = text(schema, "description", lang)
            if described:
                out.append(f"<p>{esc(described)}</p>")
            out.append(schema_table(schema, words, lang) + "</section>")
    out.append("</main></body></html>\n")
    return "\n".join(out)


def build(target):
    spec = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    target.mkdir(parents=True, exist_ok=True)
    (target / "index_RU.html").write_text(render(spec, "ru"), encoding="utf-8")
    (target / "index_EN.html").write_text(render(spec, "en"), encoding="utf-8")


def main():
    if not SPEC.is_file():
        print(f"нет спецификации: {SPEC}", file=sys.stderr)
        return 2
    try:
        if "--check" in sys.argv:
            with tempfile.TemporaryDirectory() as tmp:
                build(pathlib.Path(tmp))
                stale = [name for name in ("index_RU.html", "index_EN.html")
                         if not (PAGES / name).is_file()
                         or (PAGES / name).read_text(encoding="utf-8") != (pathlib.Path(tmp) / name).read_text(encoding="utf-8")]
            if stale:
                print("страницы устарели — пересобери scripts/render-openapi.py: " + ", ".join(stale))
                return 1
            print("страницы API совпадают со спецификацией")
            return 0
        build(PAGES)
        print(f"собрано: {PAGES / 'index_RU.html'}, {PAGES / 'index_EN.html'}")
        return 0
    except yaml.YAMLError as problem:
        print(f"спецификация не читается: {problem}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
