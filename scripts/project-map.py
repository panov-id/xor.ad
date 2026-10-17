#!/usr/bin/env python3
"""Project map: what references what in code and database, as Mermaid, checked.

Owner, 13.10.2026: «структуру проекта, связи между, что куда ссылается, ну
прям схемой … чтобы читать всегда и понимать, не искать, чтобы было всё
сверено 100%». The map is generated from the code itself, never by hand, and
every edge is checked against the disk while generating: an import of a class
that does not exist, a route to a missing controller, a foreign key to a
missing table — each is printed under ПРОВЕРКА and the exit code is 1.

Stacks: Laravel (composer.json with laravel/framework) and TypeScript/JS
(package.json). Others: imports are not parsed, only the layout is listed.

Usage: project-map.py [ROOT] [--out DIR] [--check]
  ROOT    project root (default: cwd); a Laravel app may sit in ROOT/server
  --out   where MAP_RU.md and MAP_EN.md go (default: ROOT/docs)
  --check print only the problems, exit 1 if any
"""
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

LAYERS = [  # (path fragment, layer) — first match wins
    ("/Http/Controllers/", "controller"), ("/Http/Middleware/", "middleware"),
    ("/Http/Requests/", "request"), ("/Http/Resources/", "resource"),
    ("/Console/Commands/", "command"), ("/Jobs/", "job"), ("/Listeners/", "listener"),
    ("/Events/", "event"), ("/Services/", "service"), ("/Repositories/", "repository"),
    ("/Models/", "model"), ("/DTO/", "dto"), ("/Providers/", "provider"),
]
FLOW = ["controller", "command", "job", "listener", "service", "repository", "model"]


def layer_of(path: str) -> str:
    for frag, name in LAYERS:
        if frag in path:
            return name
    return "other"


# ---------- Laravel ----------
def laravel_root(root: Path):
    for cand in (root, root / "server"):
        cj = cand / "composer.json"
        if cj.is_file() and "laravel/framework" in cj.read_text(errors="replace"):
            return cand
    return None


def php_classes(app: Path, base: Path):
    classes = {}
    for f in app.rglob("*.php"):
        text = f.read_text(errors="replace")
        ns = re.search(r"^namespace\s+([\w\\]+);", text, re.M)
        cls = re.search(r"^(?:abstract\s+|final\s+|readonly\s+)*(?:class|interface|trait|enum)\s+(\w+)", text, re.M)
        if ns and cls:
            fq = f"{ns.group(1)}\\{cls.group(1)}"
            classes[fq] = {"file": str(f.relative_to(base)), "layer": layer_of("/" + str(f.relative_to(base))),
                           "uses": set(re.findall(r"^use\s+([\w\\]+)(?:\s+as\s+\w+)?;", text, re.M)), "text": text}
    return classes


def laravel(base: Path):
    app = base / "app"
    classes = php_classes(app, base)
    problems, edges, external = [], set(), defaultdict(set)
    for fq, c in classes.items():
        for u in c["uses"]:
            if u.startswith("App\\"):
                if u in classes:
                    edges.add((fq, u))
                elif not (app / (u[4:].replace("\\", "/") + ".php")).exists():
                    problems.append(f"{c['file']}: use {u} — такого класса нет")
            elif c["layer"] in ("service", "repository", "job", "controller") and not u.startswith(("Illuminate\\", "Psr\\")):
                external[u.split("\\")[0] + "\\" + u.split("\\")[1] if u.count("\\") else u].add(fq)

    routes = []
    for rf in sorted((base / "routes").glob("*.php")):
        text = rf.read_text(errors="replace")
        imports = dict((u.split("\\")[-1], u) for u in re.findall(r"^use\s+([\w\\]+);", text, re.M))
        for m in re.finditer(r"Route::(get|post|put|patch|delete|any)\(\s*'([^']*)'\s*,\s*\[\s*([\w\\]+)::class\s*,\s*'(\w+)'", text):
            short = m.group(3).split("\\")[-1]
            fq = imports.get(short, m.group(3) if "\\" in m.group(3) else f"App\\Http\\Controllers\\{short}")
            routes.append((m.group(1).upper(), m.group(2), fq, m.group(4), rf.name))
            if fq not in classes:
                problems.append(f"routes/{rf.name}: {m.group(1).upper()} {m.group(2)} → {fq} — контроллера нет")
            elif not re.search(rf"function\s+{m.group(4)}\s*\(", classes[fq]["text"]):
                problems.append(f"routes/{rf.name}: {m.group(1).upper()} {m.group(2)} → {short}@{m.group(4)} — метода нет")

    # String constants of every class (Model::TABLE_NAME, Model::FIELD_X), inherited through extends.
    # Keyed by full name: short names collide (App\Models\CryptoAddress and App\Support\CryptoAddress).
    consts, parent, by_short = {}, {}, defaultdict(list)
    for fq, c in classes.items():
        consts[fq] = dict(re.findall(r"""const\s+(?:string\s+)?(\w+)\s*=\s*['"](\w+)['"]""", c["text"]))
        by_short[fq.split("\\")[-1]].append(fq)
        if (m := re.search(r"class\s+\w+\s+extends\s+(\w+)", c["text"])):
            imports = dict((u.split("\\")[-1], u) for u in c["uses"])
            ns = fq.rsplit("\\", 1)[0]
            parent[fq] = imports.get(m.group(1), f"{ns}\\{m.group(1)}")

    def const_of(cls, name):
        # A short name tries every class bearing it, models first.
        for fq in sorted(by_short.get(cls, [cls]), key=lambda x: "\\Models\\" not in x):
            seen = set()
            while fq and fq not in seen:
                seen.add(fq)
                if name in consts.get(fq, {}):
                    return consts[fq][name]
                fq = parent.get(fq)
        return None

    # A table or column argument: 'name', Class::CONST or a $variable assigned one of those.
    ARG = r"""('\w+'|"\w+"|\w+::\w+|\$\w+)"""

    def resolve(arg, local):
        if arg[0] in "'\"":
            return arg.strip("'\"")
        if arg.startswith("$"):
            return local.get(arg[1:])
        return const_of(*arg.split("::"))

    def without_down(text):
        """down() undoes up(); its names and its trigger bodies are not the schema, so cut it out by braces."""
        m = re.search(r"function\s+down\s*\([^)]*\)[^{]*\{", text)
        if not m:
            return text
        depth, i = 1, m.end()
        while i < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        return text[: m.start()] + text[i:]

    def plural(word):
        if word.endswith("y") and word[-2:-1] not in "aeiou":
            return word[:-1] + "ies"
        return word + ("es" if word.endswith(("s", "x", "ch", "sh")) else "s")

    TRIGGER_HEAD = (r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*\S+\s+)?TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"
                    r"`?([\w{}$]+)`?\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+`?([\w{}$]+)`?")

    # One pass over up() of every migration, operations replayed in file order.
    tables, fks, triggers = {}, [], {}
    for mf in sorted((base / "database" / "migrations").glob("*.php")):
        text = without_down(mf.read_text(errors="replace"))
        local = {m.group(1): resolve(m.group(2), {})
                 for m in re.finditer(r"""\$(\w+)\s*=\s*('\w+'|"\w+"|\w+::\w+)\s*;""", text)}
        sub = lambda s: re.sub(r"\{\$(\w+)\}", lambda x: local.get(x.group(1)) or x.group(0), s)
        ops = []
        for m in re.finditer(r"Schema::(create|drop|dropIfExists)\(\s*" + ARG, text):
            ops.append((m.start(), m.group(1), resolve(m.group(2), local), m.group(2)))
        for m in re.finditer(r"Schema::rename\(\s*" + ARG + r"\s*,\s*" + ARG, text):
            ops.append((m.start(), "rename", (resolve(m.group(1), local), resolve(m.group(2), local)), m.group(0)))
        heads = list(re.finditer(TRIGGER_HEAD, text, re.I))
        for i, m in enumerate(heads):
            # A trigger body ends at its END or at the next statement, never in a later method.
            body = text[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(text)]
            body = body[: (e.end() if (e := re.search(r"\bEND\b|\"\)|SQL\s*\)", body)) else len(body))]
            ops.append((m.start(), "trigger", m, body))
        for m in re.finditer(r"DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?`?([\w{}$]+)`?", text, re.I):
            ops.append((m.start(), "drop_trigger", sub(m.group(1)), None))
        for _, op, a, b in sorted(ops, key=lambda o: o[0]):
            if op == "create" and a:
                tables[a] = mf.name
            elif op in ("create", "drop", "dropIfExists") and not a:
                problems.append(f"migrations/{mf.name}: Schema::{op}({b}) — имя таблицы не разобрать")
            elif op in ("drop", "dropIfExists"):
                tables.pop(a, None)
                triggers = {n: t for n, t in triggers.items() if t["table"] != a}
            elif op == "rename" and all(a):
                tables[a[1]] = tables.pop(a[0], mf.name)
            elif op == "trigger":
                m = a
                writes = re.search(r"INSERT INTO\s+`?([\w{}$]+)`?", b, re.I)
                triggers[sub(m.group(1))] = dict(
                    table=sub(m.group(4)), timing=m.group(2).upper(), event=m.group(3).upper(), file=mf.name,
                    writes=sub(writes.group(1)) if writes else None, refuses=bool(re.search(r"\bSIGNAL\b", b)))
            elif op == "drop_trigger":
                triggers.pop(a, None)
        for m in re.finditer(r"Schema::(?:create|table)\(\s*" + ARG + r"[^{]*\{", text):
            t = resolve(m.group(1), local)
            depth, i = 1, m.end()
            while i < len(text) and depth:  # the closure body by braces: nested closures stay inside
                depth += {"{": 1, "}": -1}.get(text[i], 0)
                i += 1
            body = text[m.end(): i]
            if not t:
                continue
            for fk in re.finditer(r"foreignIdFor\(\s*(\w+)::class[^;]*?constrained\(", body):
                cls = fk.group(1)
                snake = re.sub(r"(?<!^)(?=[A-Z])", "_", cls).lower()
                fks.append((t, const_of(cls, "TABLE_NAME") or plural(snake), snake + "_id", mf.name))
            for fk in re.finditer(r"foreign\(\s*\[([^\]]*)\][^;]*?->on\(\s*" + ARG + r"\s*\)", body):
                cols = ",".join(resolve(c, local) or c for c in re.findall(ARG, fk.group(1)))
                fks.append((t, resolve(fk.group(2), local), cols, mf.name))
            for fk in re.finditer(r"foreignId\(\s*" + ARG + r"\s*\)[^;]*?constrained\((?:\s*(?:table:\s*)?" + ARG + r")?", body):
                col = resolve(fk.group(1), local) or fk.group(1)
                target = resolve(fk.group(2), local) if fk.group(2) else (
                    plural(col[:-3]) if col.endswith("_id") else None)
                fks.append((t, target, col, mf.name))
            for fk in re.finditer(r"foreign\(\s*" + ARG + r"[^)]*\)[^;]*?->on\(\s*" + ARG + r"\s*\)", body):
                col = resolve(fk.group(1), local) or fk.group(1)
                fks.append((t, resolve(fk.group(2), local), col, mf.name))
            for fk in re.finditer(r"dropForeign\(\s*\[?\s*" + ARG, body):
                col = resolve(fk.group(1), local) or fk.group(1)
                fks = [f for f in fks if not (f[0] == t and (f[2] == col or col == f"{t}_{f[2]}_foreign"))]
    for t, target, col, mf in fks:
        if not target:
            problems.append(f"migrations/{mf}: {t}.{col} — таблицу-цель внешнего ключа не разобрать")
        elif target not in tables:
            problems.append(f"migrations/{mf}: {t}.{col} → {target} — таблицы нет")

    model_table = {}
    for fq, c in classes.items():
        if c["layer"] == "model":
            m = re.search(r"""\$table\s*=\s*('\w+'|"\w+"|self::TABLE_NAME|static::TABLE_NAME)""", c["text"])
            name = None
            if m:
                name = m.group(1).strip("'\"") if m.group(1)[0] in "'\"" else const_of(fq, "TABLE_NAME")
                if not name:
                    problems.append(f"{c['file']}: $table = {m.group(1)} — значение не разобрать")
            model_table[fq] = name
            if name and name not in tables:
                problems.append(f"{c['file']}: $table = '{name}' — в миграциях такой таблицы нет")
    for name, tr in triggers.items():
        for tbl in (tr["table"], tr["writes"]):
            if tbl and "{" in tbl:
                problems.append(f"migrations/{tr['file']}: триггер {name} → {tbl} — имя не разобрать")
            elif tbl and tbl not in tables:
                problems.append(f"migrations/{tr['file']}: триггер {name} → {tbl} — таблицы нет")

    # Schedule: Schedule::command(X::class …)->frequency() in routes/console.php.
    schedule = []
    console = base / "routes" / "console.php"
    if console.is_file():
        text = console.read_text(errors="replace")
        imports = dict((u.split("\\")[-1], u) for u in re.findall(r"^use\s+([\w\\]+);", text, re.M))
        for m in re.finditer(r"Schedule::command\(\s*(\w+)::class([^;]*);", text, re.S):
            fq = imports.get(m.group(1), m.group(1))
            freq = re.search(r"->((?:every\w+|hourly\w*|daily\w*|twiceDaily\w*|weekly\w*|monthly\w*|cron)\([^)]*\))", m.group(2))
            schedule.append((fq, freq.group(1) if freq else "?"))
            if fq not in classes:
                problems.append(f"routes/console.php: Schedule::command({m.group(1)}) — класса нет")

    # Container bindings: singleton/bind(X::class, closure) in app/Providers and what the closure builds with `new`.
    bindings = []
    for fq, c in classes.items():
        if c["layer"] != "provider":
            continue
        imports = dict((u.split("\\")[-1], u) for u in c["uses"])
        calls = list(re.finditer(r"(?:\$this->app->(singleton|bind|scoped)\(\s*(\w+)::class"
                                 r"|Auth::(extend)\(\s*(\w+)::\w+)", c["text"]))
        for i, m in enumerate(calls):
            body = c["text"][m.end(): calls[i + 1].start() if i + 1 < len(calls) else len(c["text"])]
            # The call's own arguments by parentheses: a closure, an arrow fn or nothing at all.
            depth, j = 1, 0
            while j < len(body) and depth:
                depth += {"(": 1, ")": -1}.get(body[j], 0)
                j += 1
            body = body[:j]
            built = sorted({imports.get(n, n) for n in re.findall(
                r"\bnew\s+(\w+)\b|\b(\w+Factory)::\w+\(|\b([A-Z]\w+)::(?:create|make|from\w*)\(|^\s*,\s*(\w+)::class", body)
                            for n in n if n})
            kind, target = (m.group(1), m.group(2)) if m.group(1) else ("Auth::extend", m.group(4))
            bindings.append((fq, kind, imports.get(target, target), built))

    # Implicit links: columns that hold another table's provider key without a FK, declared in
    # docs/map.links as `child.col -> parent.col | path:line`; each is checked against the disk.
    links = []
    project = base.parent if base.name == "server" else base  # laravel_root() returns root or root/server
    links_file = project / "docs" / "map.links"
    if links_file.is_file():
        for n, raw in enumerate(links_file.read_text(errors="replace").splitlines(), 1):
            line = raw.split("#")[0].strip()
            if not line:
                continue
            m = re.match(r"(\w+)\.(\w+)\s*->\s*(\w+)\.(\w+)\s*\|\s*([\w./-]+):([1-9]\d{0,6})$", line)
            if not m:
                problems.append(f"docs/map.links:{n}: не разобрать — нужно `child.col -> parent.col | path:line`")
                continue
            child, ccol, parent, pcol, ev, ln = m.groups()
            for tbl in (child, parent):
                if tbl not in tables:
                    problems.append(f"docs/map.links:{n}: таблицы {tbl} нет")
            src = (base / ev).resolve()
            if not src.is_relative_to(base.resolve()):
                problems.append(f"docs/map.links:{n}: {ev} — путь вне {base.name}/, не читаю")
                continue
            links.append((child, ccol, parent, pcol, f"{ev}:{ln}"))
            lines = src.read_text(errors="replace").splitlines() if src.is_file() else []
            if int(ln) > len(lines):
                problems.append(f"docs/map.links:{n}: {ev}:{ln} — такой строки нет")
            elif not any(tok in lines[int(ln) - 1] for col in (ccol, pcol)
                         for tok in (col, "FIELD_" + col.upper(), re.sub(r"_(\w)", lambda x: x.group(1).upper(), col))):
                problems.append(f"docs/map.links:{n}: {ev}:{ln} не упоминает ни {ccol}, ни {pcol}")

    return dict(kind="laravel", classes=classes, edges=edges, routes=routes, tables=tables,
                fks=fks, model_table=model_table, external=external, problems=problems,
                triggers=triggers, schedule=schedule, bindings=bindings, links=links)


# ---------- TypeScript / JS ----------
def typescript(root: Path):
    src = [p for p in root.rglob("*") if p.suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs")
           and "node_modules" not in p.parts and ".next" not in p.parts and "dist" not in p.parts]
    files = {str(p.relative_to(root)) for p in src}
    edges, problems, external = set(), [], defaultdict(set)
    for p in src:
        rel = str(p.relative_to(root))
        for imp in re.findall(r"""(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)""", p.read_text(errors="replace")):
            spec = imp[0] or imp[1]
            if spec.startswith("."):
                target = (p.parent / spec).resolve()
                found = None
                for cand in [target] + [target.with_suffix(s) for s in (".ts", ".tsx", ".js", ".jsx", ".mjs")] \
                        + [target / f"index{s}" for s in (".ts", ".tsx", ".js")]:
                    if cand.is_file():
                        found = str(cand.relative_to(root))
                        break
                if found:
                    edges.add((rel, found))
                else:
                    problems.append(f"{rel}: import '{spec}' — файла нет")
            else:
                external[spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2])].add(rel)
    return dict(kind="ts", files=files, edges=edges, external=external, problems=problems)


# ---------- documents (no code stack) ----------
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")
TICK_RE = re.compile(r"`([\w./-]+\.(?:md|png|jpg|svg|pdf|json|yaml|yml))`")


def documents(root: Path):
    md = [p for p in root.rglob("*.md") if ".git" not in p.parts and "node_modules" not in p.parts]
    files = {str(p.relative_to(root)) for p in md}
    edges, problems, urls = set(), [], defaultdict(set)
    for p in md:
        rel = str(p.relative_to(root))
        text = p.read_text(errors="replace")
        for target in LINK_RE.findall(text):
            if re.match(r"^[a-z]+:", target):
                urls[target.split("/")[2] if target.count("/") >= 2 else target].add(rel)
                continue
            dest = (p.parent / target).resolve()
            if dest.exists():
                edges.add((rel, str(dest.relative_to(root)) if root in dest.parents or dest == root else target))
            else:
                problems.append(f"{rel}: ссылка ({target}) — файла нет")
        for target in TICK_RE.findall(text):
            for base in (p.parent, root):
                dest = (base / target).resolve()
                if dest.is_file() and (root in dest.parents):
                    edges.add((rel, str(dest.relative_to(root))))
                    break
    # rule 18: every document comes as an _RU/_EN pair
    for f in sorted(files):
        m = re.match(r"(.*)_(RU|EN)\.md$", f)
        if m:
            other = f"{m.group(1)}_{'EN' if m.group(2) == 'RU' else 'RU'}.md"
            if other not in files:
                problems.append(f"{f}: нет пары {Path(other).name} (правило 18)")
    return dict(kind="docs", files=files, edges=edges, external=urls, problems=problems)


def render_docs(d, ru):
    t = (lambda r, e: r if ru else e)
    top = lambda f: f.split("/")[0] if "/" in f else "(корень)"
    cross = sorted({(top(a), top(b)) for a, b in d["edges"] if top(a) != top(b)})
    out = ["## " + t("Папки: какая ссылается на какую", "Folders: which links to which"), "", "```mermaid", "flowchart LR"]
    out += [f"  {node_id(a)}[{a}] --> {node_id(b)}[{b}]" for a, b in cross] or ["  none[" + t("связей между папками нет", "no cross-folder links") + "]"]
    out += ["```", "", "## " + t("Документ → на что ссылается · кто ссылается на него", "Document → links to · linked from"), ""]
    incoming = defaultdict(set)
    for a, b in d["edges"]:
        incoming[b].add(a)
    for f in sorted(d["files"]):
        outs = sorted(b for a, b in d["edges"] if a == f)
        out.append(f"- `{f}` → {', '.join(outs) or '—'}  ·  ← {', '.join(sorted(incoming[f])) or '—'}")
    out += ["", "## " + t("Внешние сайты → откуда", "External sites → from"), ""]
    out += [f"- {host}: {len(src)}" for host, src in sorted(d["external"].items())]
    return out


# ---------- render ----------
def node_id(s: str) -> str:
    return re.sub(r"\W", "_", s)


def render_laravel(d, ru):
    t = (lambda r, e: r if ru else e)
    short = lambda fq: fq.split("\\")[-1]
    out = ["## " + t("Поток: маршрут → контроллер → сервис → репозиторий → модель → таблица",
                     "Flow: route → controller → service → repository → model → table"), "", "```mermaid", "flowchart LR"]
    for verb, path, fq, meth, _ in d["routes"]:
        out.append(f'  R_{node_id(verb + path)}["{verb} {path.replace('"', '#quot;')}"] --> {node_id(short(fq) + "_" + meth)}["{short(fq)}@{meth}"]')
    rank = {l: i for i, l in enumerate(FLOW)}
    for a, b in sorted(d["edges"]):
        la, lb = d["classes"][a]["layer"], d["classes"][b]["layer"]
        if la in rank and lb in rank and rank[lb] > rank[la]:
            out.append(f"  {node_id(short(a))}[{short(a)}] --> {node_id(short(b))}[{short(b)}]")
    for fq, table in sorted(d["model_table"].items()):
        if table:
            out.append(f"  {node_id(short(fq))}[{short(fq)}] --> T_{table}[({table})]")
    for ext, users in sorted(d["external"].items()):
        for u in sorted(users):
            if d["classes"][u]["layer"] in ("service", "repository", "job"):
                out.append(f"  {node_id(short(u))}[{short(u)}] --> X_{node_id(ext)}{{{{{ext}}}}}")
    out += ["```", "", "## " + t("База: таблицы и внешние ключи (из миграций)", "Database: tables and foreign keys (from migrations)"),
            "", "```mermaid", "erDiagram"]
    for tname in sorted(d["tables"]):
        out.append(f"  {tname} {{ string _ }}")
    for tbl, target, col, _ in d["fks"]:
        if target:
            out.append(f'  {target} ||--o{{ {tbl} : "{col}"')
    for child, ccol, parent, pcol, _ in d["links"]:
        out.append(f'  {parent} ||..o{{ {child} : "{ccol} = {pcol}"')
    out += ["```", "", t("Сплошная линия — внешний ключ в базе; пунктир — связь без FK, объявлена в `docs/map.links` "
                         "с доказательством в коде:", "Solid line — a foreign key in the database; dashed — a link without a FK, "
                         "declared in `docs/map.links` with its evidence in code:"), ""]
    out += [f"- `{c}.{cc}` → `{p}.{pc}` — `{ev.replace('`', '')}`" for c, cc, p, pc, ev in d["links"]] or ["- —"]
    out += ["", "## " + t("Триггеры (из миграций)", "Triggers (from migrations)"), "",
            t("| таблица | когда | что делает | имя |", "| table | when | what it does | name |"), "|---|---|---|---|"]
    for n, tr in sorted(d["triggers"].items(), key=lambda x: (x[1]["table"], x[1]["timing"], x[1]["event"])):
        what = (t("пишет в ", "writes to ") + f"`{tr['writes']}`") if tr["writes"] else \
            (t("запрещает", "refuses") if tr["refuses"] else "—")
        out.append(f"| `{tr['table']}` | {tr['timing']} {tr['event']} | {what} | `{n}` |")
    out += ["", "## " + t("Расписание → команда (routes/console.php)", "Schedule → command (routes/console.php)"), ""]
    out += [f"- `{f}` → {short(c)}" for c, f in d["schedule"]] or ["- —"]
    out += ["", "## " + t("Контейнер: что собирает провайдер (app/Providers)", "Container: what each provider builds (app/Providers)"), ""]
    out += [f"- {short(p)}: {kind}({short(x)}) → " + (", ".join(short(y) for y in built) or t("контейнер сам (без замыкания)", "container autowires (no closure)"))
            for p, kind, x, built in sorted(d["bindings"])] or ["- —"]
    out += ["", "## " + t("Кто на кого ссылается (use App\\…)", "Who references whom (use App\\…)"), ""]
    incoming = defaultdict(set)
    for a, b in d["edges"]:
        incoming[b].add(short(a))
    for fq in sorted(d["classes"], key=lambda x: (d["classes"][x]["layer"], x)):
        c = d["classes"][fq]
        outs = sorted(short(b) for a, b in d["edges"] if a == fq)
        out.append(f"- `{c['file']}` [{c['layer']}] → {', '.join(outs) or '—'}  ·  ← {', '.join(sorted(incoming[fq])) or '—'}")
    return out


# ---------- xor.ad: the group's packages and their documents in one map ----------
# The project has no manifest at its root: relay (Deno node), depth (core and the terminal),
# web, panel, testing, scripts — and the storefronts sosed.place / neighbro.place are links to
# sibling repositories, kept off the map. Old worktrees under .claude/ are copies, not the project.
XOR_SKIP = {".git", "node_modules", "dist", ".claude", "results", "screenshots", "sosed.place", "neighbro.place"}
XOR_CODE = (".ts", ".tsx", ".js", ".jsx", ".mjs")
XOR_IMPORT = re.compile(
    r"""(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]"""
    r"""|import\s*\(\s*['"]([^'"]+)['"]\s*\)"""
    r"""|import\s+['"]([^'"]+)['"]"""
    r"""|require\(\s*['"]([^'"]+)['"]\s*\)""")


def xor_files(root: Path, suffixes):
    out = []
    for p in root.rglob("*"):
        rel = p.relative_to(root)
        if any(part in XOR_SKIP for part in rel.parts[:-1]) or (rel.parts and rel.parts[0] in XOR_SKIP):
            continue
        if "/tests/report/" in f"/{rel}":  # Playwright's built report, not the project's code
            continue
        if rel.parts[:2] == ("testing", "redesign"):  # captures and the designer's brief: 10k links of shots, no code
            continue
        if rel.parts[:1] == ("docs",) and re.match(r"MAP(_CHANGES)?_(RU|EN)\.md$", rel.name):
            continue  # the map itself names every file — reading it back would map the map

        if p.is_file() and p.suffix in suffixes:
            out.append(p)
    return out


def xor(root: Path):
    src = xor_files(root, XOR_CODE)
    files = {str(p.relative_to(root)) for p in src}
    edges, problems, external, outside = set(), [], defaultdict(set), defaultdict(set)
    for p in src:
        rel = str(p.relative_to(root))
        # Comments name imports in prose; only code lines count.
        text = re.sub(r"/\*.*?\*/", "", p.read_text(errors="replace"), flags=re.S)
        text = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("//"))
        for groups in XOR_IMPORT.findall(text):
            spec = next(g for g in groups if g)
            if not spec.startswith("."):
                name = spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2])
                external[name].add(rel)
                continue
            target = (p.parent / spec.split("?")[0]).resolve()  # Vite's '?url' / '?raw' name the same file
            found = None
            for cand in [target] + [target.with_suffix(s) for s in XOR_CODE] + [target / f"index{s}" for s in XOR_CODE]:
                if cand.is_file():
                    found = cand
                    break
            if found is None:
                problems.append(f"{rel}: import '{spec}' — файла нет")
            elif root in found.parents and str(found.relative_to(root)).split("/")[0] not in XOR_SKIP:
                edges.add((rel, str(found.relative_to(root))))
            else:
                outside[str(found.parent)].add(rel)
    docs = documents_in(root)
    return dict(kind="xor", files=files, edges=edges | docs["edges"], external=external, outside=outside,
                docfiles=docs["files"], urls=docs["external"], problems=problems + docs["problems"])


def documents_in(root: Path):
    """documents() over the project only: no worktrees, no sibling repositories, no fenced code."""
    md = xor_files(root, (".md",))
    files = {str(p.relative_to(root)) for p in md}
    edges, problems, urls = set(), [], defaultdict(set)
    for p in md:
        rel = str(p.relative_to(root))
        text = re.sub(r"```.*?```", "", p.read_text(errors="replace"), flags=re.S)
        links_text = re.sub(r"`[^`\n]+`", "", text)  # `[t](href)` in inline code is an example, not a link
        for target in LINK_RE.findall(links_text):
            if re.match(r"^[a-z]+:", target):
                urls[target.split("/")[2] if target.count("/") >= 2 else target].add(rel)
                continue
            # Links into the sibling repositories (sosed.place, neighbro.place) are off the map:
            # in a `git archive` snapshot their symlinks point nowhere (map-on-commit.sh).
            if any(part in XOR_SKIP for part in Path(target).parts):
                continue
            dest = (p.parent / target).resolve()
            if dest.exists():
                if root in dest.parents:
                    edges.add((rel, str(dest.relative_to(root))))
            else:
                problems.append(f"{rel}: ссылка ({target}) — файла нет")
        for target in TICK_RE.findall(text):
            for base in (p.parent, root):
                dest = (base / target).resolve()
                if dest.is_file() and root in dest.parents:
                    edges.add((rel, str(dest.relative_to(root))))
                    break
    for f in sorted(files):
        m = re.match(r"(.*)_(RU|EN)\.md$", f)
        if m:
            other = f"{m.group(1)}_{'EN' if m.group(2) == 'RU' else 'RU'}.md"
            # README_RU.md pairs with README_EN.md or with README.md (the root's pair, CLAUDE.md names it so).
            if Path(f).name == "README_RU.md" and str(Path(f).with_name("README.md")) in files:
                continue
            if other not in files:
                problems.append(f"{f}: нет пары {Path(other).name} (правило 18)")
    return dict(files=files, edges=edges, external=urls, problems=problems)


def render_xor(d, ru):
    t = (lambda r, e: r if ru else e)
    top = lambda f: f.split("/")[0] if "/" in f else "."
    pkg = lambda f: "/".join(f.split("/")[:2]) if f.count("/") >= 2 else top(f)
    code = {(a, b) for a, b in d["edges"] if a in d["files"]}
    groups = sorted({(top(a), top(b)) for a, b in code if top(a) != top(b)})
    out = ["## " + t("Пакеты: кто кого импортирует", "Packages: who imports whom"), "", "```mermaid", "flowchart LR"]
    out += [f"  {node_id(a)}[{a}] --> {node_id(b)}[{b}]" for a, b in groups] or ["  none[—]"]
    out += ["```", ""]
    for p in sorted({top(f) for f in d["files"]}):
        inner = sorted({(pkg(a), pkg(b)) for a, b in code if top(a) == p and top(b) == p and pkg(a) != pkg(b)})
        if inner:
            out += ["### " + p, "", "```mermaid", "flowchart LR"]
            out += [f"  {node_id(a)}[{a}] --> {node_id(b)}[{b}]" for a, b in inner] + ["```", ""]
    incoming = defaultdict(set)
    for a, b in code:
        incoming[b].add(a)
    out += ["## " + t("Файлы кода → импорты · кто импортирует их", "Code files → imports · imported by"), ""]
    for f in sorted(d["files"]):
        outs = sorted(b for a, b in code if a == f)
        out.append(f"- `{f}` → {', '.join(outs) or '—'}  ·  ← {', '.join(sorted(incoming[f])) or '—'}")
    out += ["", "## " + t("Внешние пакеты → сколько файлов", "External packages → how many files"), ""]
    out += [f"- {ext}: {len(u)}" for ext, u in sorted(d["external"].items())]
    if d["outside"]:
        out += ["", "## " + t("Импорты за пределы проекта (соседние репозитории)", "Imports outside the project (sibling repositories)"), ""]
        out += [f"- {where}: {', '.join(sorted(src))}" for where, src in sorted(d["outside"].items())]
    docs = {(a, b) for a, b in d["edges"] if a in d["docfiles"]}
    dincoming = defaultdict(set)
    for a, b in docs:
        dincoming[b].add(a)
    out += ["", "## " + t("Документы → на что ссылаются · кто ссылается на них", "Documents → link to · linked from"), ""]
    for f in sorted(d["docfiles"]):
        outs = sorted(b for a, b in docs if a == f)
        out.append(f"- `{f}` → {', '.join(outs) or '—'}  ·  ← {', '.join(sorted(dincoming[f])) or '—'}")
    return out


def render_ts(d, ru):
    t = (lambda r, e: r if ru else e)
    top = lambda f: f.split("/")[0] if "/" in f else "."
    groups = sorted({(top(a), top(b)) for a, b in d["edges"] if top(a) != top(b)})
    out = ["## " + t("Каталоги: кто кого импортирует", "Directories: who imports whom"), "", "```mermaid", "flowchart LR"]
    out += [f"  {node_id(a)}[{a}] --> {node_id(b)}[{b}]" for a, b in groups]
    out += ["```", "", "## " + t("Файлы → импорты", "Files → imports"), ""]
    for f in sorted(d["files"]):
        outs = sorted(b for a, b in d["edges"] if a == f)
        out.append(f"- `{f}` → {', '.join(outs) or '—'}")
    out += ["", "## " + t("Внешние пакеты → кто использует", "External packages → used by"), ""]
    out += [f"- {ext}: {len(u)}" for ext, u in sorted(d["external"].items())]
    return out


def render(d, root: Path, lang: str):
    ru = lang == "ru"
    t = (lambda r, e: r if ru else e)
    head = [t(f"# Карта проекта {root.name} — сгенерирована project-map.py, руками не править",
              f"# Project map {root.name} — generated by project-map.py, do not edit by hand"), "",
            t("Пересобрать: `/project-map` или `./scripts/project-map.py .` (локальный генератор проекта).",
              "Regenerate: `/project-map` or `./scripts/project-map.py .` (the project's own generator)."), ""]
    body = {"laravel": render_laravel, "ts": render_ts, "docs": render_docs, "xor": render_xor}[d["kind"]](d, ru)
    check = ["", "## " + t("ПРОВЕРКА", "CHECK")]
    check += [f"- {p}" for p in d["problems"]] or [t("- все связи сверены с диском, расхождений нет",
                                                     "- every edge checked against the disk, no mismatch")]
    return "\n".join(head + body + check) + "\n"


def main() -> int:
    # `--help` used to fall through and map the cwd — over ~/Projects that is every
    # repository (13.10.2026). Unknown flags stop the run the same way.
    known = {"--out", "--check"}
    if any(a in ("-h", "--help") for a in sys.argv[1:]):
        print(__doc__)
        return 0
    unknown = [a for a in sys.argv[1:] if a.startswith("-") and a not in known]
    if unknown:
        print(f"project-map: unknown option {unknown[0]}", file=sys.stderr)
        return 2
    out_value = sys.argv.index("--out") + 1 if "--out" in sys.argv else None
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and i != out_value]
    root = Path(args[0] if args else ".").resolve()
    out_dir = Path(sys.argv[sys.argv.index("--out") + 1]).resolve() if "--out" in sys.argv else root / "docs"
    base = laravel_root(root)
    if (root / "relay").is_dir() and (root / "depth").is_dir() and (root / "web").is_dir():
        d = xor(root)  # this project's own mode (scripts/project-map.py, 13.10.2026)
    elif base:
        d = laravel(base)
    elif (root / "package.json").is_file():
        d = typescript(root)
    else:
        d = documents(root)
    if "--check" in sys.argv:
        print("\n".join(d["problems"]))
        return 1 if d["problems"] else 0
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "MAP_RU.md").write_text(render(d, root, "ru"))
    (out_dir / "MAP_EN.md").write_text(render(d, root, "en"))
    added, removed = record_changes(d, out_dir)
    if added or removed or not (out_dir / "map.sqlite").is_file():
        write_sqlite(d, out_dir, root)  # a build row only when the map changed
    else:
        import sqlite3
        db = sqlite3.connect(out_dir / "map.sqlite")
        prune(db, Path(os.environ.get("MAP_GIT_DIR") or root))  # garbage goes on every build
        db.close()
    n_edges = len(edge_lines(d))
    print(f"project-map: {d['kind']}, связей {n_edges} (+{added} −{removed} с прошлой сборки), "
          f"проблем {len(d['problems'])} → {out_dir}/MAP_RU.md, MAP_EN.md, MAP_CHANGES_RU.md")
    return 1 if d["problems"] else 0


KEEP_BUILDS = 200


def prune(db, repo: Path):
    """Owner 13.10.2026: «нужно еще мусор вычищать». Drop builds that no longer describe anything:
    a commit build whose commit is gone from git (rebase, amend), every working-tree build once a
    commit build exists, everything past the newest KEEP_BUILDS; then compact the file."""
    import subprocess
    if "source" not in {r[1] for r in db.execute("PRAGMA table_info(builds)")}:
        db.execute("ALTER TABLE builds ADD COLUMN source TEXT DEFAULT 'tree'")  # bases made before 13.10 23:30
    gone = [bid for bid, c in db.execute("SELECT id, git_commit FROM builds WHERE source = 'commit'")
            if subprocess.run(["git", "-C", str(repo), "cat-file", "-e", f"{c}^{{commit}}"],
                              capture_output=True).returncode != 0]
    if db.execute("SELECT 1 FROM builds WHERE source = 'commit' LIMIT 1").fetchone():
        gone += [bid for (bid,) in db.execute("SELECT id FROM builds WHERE source = 'tree'")]
    gone += [bid for (bid,) in db.execute("SELECT id FROM builds ORDER BY id DESC LIMIT -1 OFFSET ?", (KEEP_BUILDS,))]
    for bid in set(gone):
        db.execute("DELETE FROM edges WHERE build = ?", (bid,))
        db.execute("DELETE FROM builds WHERE id = ?", (bid,))
    db.commit()
    db.execute("VACUUM")
    return len(set(gone))


def write_sqlite(d, out_dir: Path, root: Path):
    """The map as a database (owner 13.10.2026: «чё думаешь если такой маппинг в базу?»).

    One file beside map.edges, stdlib sqlite3, nothing installed. Every build is kept:
    builds(id, at, project, commit), edges(build, src, dst). Queries: docs/map-queries.sql.
    """
    import datetime
    import sqlite3
    import subprocess
    # MAP_COMMIT: the commit a snapshot was built from (map-on-commit.sh builds from `git archive HEAD`).
    commit = os.environ.get("MAP_COMMIT") or subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
                                                           capture_output=True, text=True).stdout.strip()
    db = sqlite3.connect(out_dir / "map.sqlite")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS builds (id INTEGER PRIMARY KEY, at TEXT, project TEXT, git_commit TEXT);
        CREATE TABLE IF NOT EXISTS edges (build INTEGER REFERENCES builds(id), src TEXT, dst TEXT);
        CREATE INDEX IF NOT EXISTS edges_dst ON edges(build, dst);
        CREATE INDEX IF NOT EXISTS edges_src ON edges(build, src);
    """)
    # source: 'commit' when built from a committed snapshot (MAP_COMMIT), 'tree' from the working tree.
    cols = {r[1] for r in db.execute("PRAGMA table_info(builds)")}
    if "source" not in cols:
        db.execute("ALTER TABLE builds ADD COLUMN source TEXT DEFAULT 'tree'")
    source = "commit" if os.environ.get("MAP_COMMIT") else "tree"
    cur = db.execute("INSERT INTO builds (at, project, git_commit, source) VALUES (?, ?, ?, ?)",
                     (datetime.datetime.now().isoformat(timespec="seconds"), root.name, commit, source))
    build = cur.lastrowid
    db.executemany("INSERT INTO edges VALUES (?, ?, ?)",
                   [(build, *line.split(" -> ", 1)) for line in edge_lines(d) if " -> " in line])
    db.commit()
    prune(db, Path(os.environ.get("MAP_GIT_DIR") or root))
    db.close()
    return build


def edge_lines(d):
    """Every edge and table as one sortable line: the machine form the diff is taken on."""
    short = (lambda fq: fq.split("\\")[-1]) if d["kind"] == "laravel" else (lambda x: x)
    lines = {f"{short(a)} -> {short(b)}" for a, b in d["edges"]}
    if d["kind"] == "laravel":
        lines |= {f"{v} {p} -> {short(c)}@{m}" for v, p, c, m, _ in d["routes"]}
        lines |= {f"table {t}" for t in d["tables"]}
        lines |= {f"fk {a}.{c} -> {b}" for a, b, c, _ in d["fks"]}
        lines |= {f"link {a}.{ac} -> {b}.{bc}" for a, ac, b, bc, _ in d["links"]}
        lines |= {f"trigger {n}: {t['timing']} {t['event']} {t['table']}"
                  + (f" -> {t['writes']}" if t["writes"] else "") + (" refuses" if t["refuses"] else "")
                  for n, t in d["triggers"].items()}
        lines |= {f"schedule {f} -> {short(c)}" for c, f in d["schedule"]}
        lines |= {f"bind {short(p)}: {k}({short(x)}) -> {short(y)}" for p, k, x, built in d["bindings"]
                  for y in built or ["(container)"]}
    return sorted(lines)


def record_changes(d, out_dir: Path):
    """Owner: «если что-то изменилось, то пишется диф в файл». Diff against the last build."""
    import datetime
    state = out_dir / "map.edges"
    new = edge_lines(d)
    old = state.read_text(errors="replace").splitlines() if state.is_file() else None
    state.write_text("\n".join(new) + "\n")
    if old is None:
        return 0, 0
    plus, minus = sorted(set(new) - set(old)), sorted(set(old) - set(new))
    if plus or minus:
        stamp = datetime.datetime.now().strftime("%d.%m.%Y %H:%M")
        for lang, head in (("RU", f"## {stamp} · связей +{len(plus)} −{len(minus)}"),
                           ("EN", f"## {stamp} · edges +{len(plus)} −{len(minus)}")):
            log = out_dir / f"MAP_CHANGES_{lang}.md"
            body = [head, "", "```diff"] + [f"+ {l}" for l in plus] + [f"- {l}" for l in minus] + ["```", ""]
            prev = log.read_text(errors="replace") if log.is_file() else ""
            log.write_text("\n".join(body) + "\n" + prev)
    return len(plus), len(minus)


if __name__ == "__main__":
    sys.exit(main())
