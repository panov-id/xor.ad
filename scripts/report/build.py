#!/usr/bin/env python3
"""Build report.html from the measurements (measure.sh, frames.sh, shots.sh)
and the dated words in prose_RU.toml.

Reads $REPORT_WORK/{data,shots}, writes $REPORT_WORK/out; render.sh sets both.
Design screenshots come from $REPORT_SCREENSHOTS (default testing/screenshots,
which is gitignored and so absent in a fresh worktree); a missing one is drawn
as a labelled gap and named on stderr instead of failing the build.
"""
import csv, html, json, os, re, shutil, sys, tomllib
from datetime import datetime
from pathlib import Path

H = Path(__file__).resolve().parent
R = H.parents[1]
W = Path(os.environ["REPORT_WORK"])
D = W / "data"
OUT = W / "out"
OUT.mkdir(exist_ok=True)
e = html.escape

# ---------- data ----------
def tsv(name):
    # An empty file is a real measurement (nothing unpushed after a push), not
    # one row with one empty field: "".split("\n") is [""].
    return [l.split("\t") for l in (D / name).read_text().split("\n") if l.strip()]


git = dict(l.split("=", 1) for l in (D / "git.env").read_text().split("\n") if "=" in l)
hist = tsv("history.tsv")
commits = tsv("commits_per_day.tsv")
if not hist or not commits:
    # The history is what the report is about; empty charts would be a false page.
    sys.exit(f"build.py: no commits on {git.get('branch')} since 20.08 in {D} — nothing to report")
counts = dict(re.findall(r"^(\S+(?: \S+)?)\s+(\d+)$", (D / "count-tests.txt").read_text(), re.M))
ops = re.search(r"операций: (\d+) \(built (\d+), spec (\d+)", (D / "openapi.txt").read_text())
ops_total, ops_built, ops_spec = map(int, ops.groups())
live = tsv("live.tsv")
prod = json.loads((D / "prod-health.json").read_text())
pool = [l.strip() for l in (D / "node-images.txt").read_text().split("\n") if l.strip().startswith(("✓", "·", "✗"))]
# Without relay/wizard/inventory.toml (gitignored, so absent in a fresh worktree)
# the gate prints why it did not ask the pool instead of a tally; say that.
# An unpolled pool is reported under "not checked", never under "checked".
_pool_lines = [l.replace(f"{R}/", "") for l in (D / "node-images.txt").read_text().split("\n") if l.strip()]
pool_sum = next((l for l in _pool_lines if l.startswith("записей")), None)
pool_why = None if pool_sum else (_pool_lines or ["пул не опрошен"])[0]
missing = []
opened = [r for r in csv.reader(open(D / "open.tsv"), delimiter="\t")]
unpushed = tsv("unpushed.tsv")
frames = dict(json.load(open(D / "frames.json")))
tests_total = int(counts["итого"])
depth_now = int(hist[-1][5])
mig_files = int(hist[-1][6])
mig_last = sorted(p.name for p in (R / "relay/node/db").glob("*.sql"))[-1][:3]
live_ok = sum(1 for _, c in live if c == "200")
measured = git["measured"]
# Growth over the last day with commits: its tally against the day before.
last_day = hist[-1][0]
prev = hist[-2] if len(hist) > 1 else hist[-1]
tests_prev = int(prev[2]) + int(prev[3]) + int(prev[4])
last_day_commits = sum(int(c) for d, c in commits if d == last_day)
# The screen test's own tally line, as frames.sh saved it.
_screens = re.search(r"пройдено (\d+), провалено (\d+)", (D / "frames.txt").read_text())
if not _screens:
    sys.exit(f"build.py: no tally line in {D / 'frames.txt'} — frames.sh did not finish")
screens_passed, screens_failed = map(int, _screens.groups())

# ---------- prose: words no script measures, each block dated ----------
prose = tomllib.loads((H / "prose_RU.toml").read_text())
fill = {"ahead": git["ahead_origin_day57"], "day57_tail": git["day57_tail"],
        "branch_only": int(git["ahead_origin_day57"]) - int(git["day57_tail"]),
        "mig_last": mig_last, "branch": git["branch"]}
P = lambda s: s.format_map(fill)
road, day, state = prose["roadmap"], prose["day"], prose["state"]
# Words dated before the last day with commits describe an older tree.
stale = [(name, d) for name, d in (("роадмап", road["as_of"]), ("итоги дня", day["date"]), ("состояние", state["as_of"]))
         if d < last_day]

# ---------- palette (dataviz reference, validated slots 1-3) ----------
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, MUTED, GRID = "#16151a", "#52514e", "#8a8984", "#e6e5e1"


def ru_date(iso):
    return f"{iso[8:10]}.{iso[5:7]}"


# ---------- charts ----------
def chart_tests():
    W, Hh, L, B, T = 720, 250, 44, 30, 28
    n = len(hist)
    bw = (W - L - 10) / n
    rows = [(h[0], int(h[2]), int(h[3]) + int(h[4]), int(h[5])) for h in hist]
    top = 700
    y = lambda v: T + (Hh - T - B) * (1 - v / top)
    g = []
    for v in range(0, top + 1, 100):
        g.append(f'<line x1="{L}" x2="{W-6}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{GRID}"/>'
                 f'<text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end" class="ax">{v}</text>')
    for i, (d, node, panel, depth) in enumerate(rows):
        x = L + i * bw + 1
        w = bw - 3
        base = 0
        for val, col, lab in ((node, S1, "узел relay"), (panel, S2, "панель и e2e"), (depth, S3, "depth")):
            if val == 0:
                continue
            y0, y1 = y(base), y(base + val)
            gap = 1.0 if base else 0
            g.append(f'<rect x="{x:.1f}" y="{y1:.1f}" width="{w:.1f}" height="{max(y0-y1-gap,0.5):.1f}" fill="{col}" rx="1.5"><title>{ru_date(d)} {lab}: {val}</title></rect>')
            base += val
        if i % 3 == 0 or i == n - 1:
            g.append(f'<text x="{x+w/2:.1f}" y="{Hh-B+16}" text-anchor="middle" class="ax">{ru_date(d)}</text>')
    first = rows[0][1] + rows[0][2] + rows[0][3]
    last = rows[-1][1] + rows[-1][2] + rows[-1][3]
    xl = L + (n - 1) * bw + bw / 2
    g.append(f'<text x="{xl:.1f}" y="{y(last)-8:.1f}" text-anchor="end" class="lab">{last}</text>')
    g.append(f'<text x="{L+bw/2:.1f}" y="{y(first)-8:.1f}" text-anchor="start" class="lab">{first}</text>')
    return f'<svg viewBox="0 0 {W} {Hh}" class="chart">{"".join(g)}</svg>', first, last


def chart_commits():
    W, Hh, L, B, T = 720, 170, 44, 28, 20
    n = len(commits)
    bw = (W - L - 10) / n
    top = 90
    y = lambda v: T + (Hh - T - B) * (1 - v / top)
    g = []
    for v in (0, 30, 60, 90):
        g.append(f'<line x1="{L}" x2="{W-6}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{GRID}"/>'
                 f'<text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end" class="ax">{v}</text>')
    peak = sorted(commits, key=lambda c: -int(c[1]))[:3]
    for i, (d, c) in enumerate(commits):
        c = int(c)
        x = L + i * bw + 1
        w = bw - 3
        g.append(f'<rect x="{x:.1f}" y="{y(c):.1f}" width="{w:.1f}" height="{y(0)-y(c):.1f}" fill="{S1}" rx="1.5"><title>{ru_date(d)}: {c}</title></rect>')
        if [d, str(c)] in peak or i == n - 1:
            g.append(f'<text x="{x+w/2:.1f}" y="{y(c)-5:.1f}" text-anchor="middle" class="lab">{c}</text>')
        if i % 3 == 0 or i == n - 1:
            g.append(f'<text x="{x+w/2:.1f}" y="{Hh-B+16}" text-anchor="middle" class="ax">{ru_date(d)}</text>')
    return f'<svg viewBox="0 0 {W} {Hh}" class="chart">{"".join(g)}</svg>', sum(int(c) for _, c in commits)


def chart_migrations():
    # Highest migration each place holds: repo from disk, environments from the roadmap (pinned tags).
    rows = [(f"Репозиторий, {git['branch']}", int(mig_last), S1, "код")] + [
        (r["label"], r["migration"], S2, r["note"]) for r in road["environments"]]
    W, rh, L = 720, 34, 190
    Hh = rh * len(rows) + 26
    x = lambda v: L + (W - L - 60) * v / 60
    g = []
    for v in (0, 20, 40, 60):
        g.append(f'<line x1="{x(v):.1f}" x2="{x(v):.1f}" y1="4" y2="{Hh-22}" stroke="{GRID}"/>'
                 f'<text x="{x(v):.1f}" y="{Hh-6}" text-anchor="middle" class="ax">{v:03d}</text>')
    for i, (lab, v, col, note) in enumerate(rows):
        yy = 8 + i * rh
        g.append(f'<text x="0" y="{yy+15}" class="lab2">{e(lab)}</text>')
        g.append(f'<rect x="{L}" y="{yy+3}" width="{x(v)-L:.1f}" height="16" fill="{col}" rx="3"/>')
        g.append(f'<text x="{x(v)+6:.1f}" y="{yy+15}" class="lab">{v:03d} <tspan class="ax">· {e(note)}</tspan></text>')
    return f'<svg viewBox="0 0 {W} {Hh}" class="chart">{"".join(g)}</svg>'


def chart_open():
    order = ["сейчас", "с запуском", "дата", "-"]
    names = {"сейчас": "сейчас", "с запуском": "с запуском", "дата": "к дате (2027)", "-": "без срока"}
    weights = [("legal", S1, "юридическое"), ("product", S2, "продукт"), ("comfort", S3, "удобство")]
    tally = {o: {w: 0 for w, _, _ in weights} for o in order}
    for r in opened:
        d = "дата" if r[2].startswith("20") else r[2]
        tally[d][r[3]] += 1
    W, rh, L = 720, 34, 120
    Hh = rh * 4 + 26
    top = 16
    x = lambda v: L + (W - L - 40) * v / top
    g = []
    for v in (0, 4, 8, 12, 16):
        g.append(f'<line x1="{x(v):.1f}" x2="{x(v):.1f}" y1="4" y2="{Hh-22}" stroke="{GRID}"/>'
                 f'<text x="{x(v):.1f}" y="{Hh-6}" text-anchor="middle" class="ax">{v}</text>')
    for i, o in enumerate(order):
        yy = 8 + i * rh
        g.append(f'<text x="0" y="{yy+15}" class="lab2">{names[o]}</text>')
        base = 0
        for w, col, lab in weights:
            v = tally[o][w]
            if not v:
                continue
            g.append(f'<rect x="{x(base)+ (1 if base else 0):.1f}" y="{yy+3}" width="{x(base+v)-x(base)-(1 if base else 0):.1f}" height="16" fill="{col}" rx="2"><title>{names[o]} · {lab}: {v}</title></rect>')
            if x(base + v) - x(base) > 16:
                g.append(f'<text x="{(x(base)+x(base+v))/2:.1f}" y="{yy+15}" text-anchor="middle" class="inbar">{v}</text>')
            base += v
        g.append(f'<text x="{x(base)+6:.1f}" y="{yy+15}" class="lab">{base}</text>')
    return f'<svg viewBox="0 0 {W} {Hh}" class="chart">{"".join(g)}</svg>', tally


def legend(items):
    return '<div class="legend">' + "".join(f'<span><i style="background:{c}"></i>{e(t)}</span>' for c, t in items) + "</div>"


# ---------- terminal frames ----------
ANSI = re.compile(r"\x1b\[([\d;]*)m")


def ansi_html(s):
    out, cls, pos = [], set(), 0
    codes = {"1": "b", "2": "dim", "7": "inv", "4": "u", "31": "red", "32": "grn", "33": "yel", "36": "cyn", "90": "dim"}
    off = {"22": ("b", "dim"), "27": ("inv",), "24": ("u",), "39": ("red", "grn", "yel", "cyn", "dim")}
    for m in ANSI.finditer(s):
        out.append(("<span class='%s'>%s</span>" % (" ".join(sorted(cls)), e(s[pos:m.start()]))) if cls else e(s[pos:m.start()]))
        for c in (m.group(1) or "0").split(";"):
            if c in ("0", ""):
                cls = set()
            elif c in codes:
                cls.add(codes[c])
            elif c in off:
                cls -= set(off[c])
        pos = m.end()
    out.append(e(s[pos:]))
    return "".join(out)


def term(key, title):
    name = [k for k in frames if k.startswith(key)][0]
    return (f'<figure class="term"><div class="tbar"><i></i><i></i><i></i><span>depth · {e(title)}</span></div>'
            f'<pre>{ansi_html(frames[name])}</pre><figcaption>{e(title)} <span>кадр теста экранов</span></figcaption></figure>')


# ---------- images ----------
def img(src, cap, when=None, cls=""):
    # A stored screenshot is dated by its file; live ones pass "сейчас".
    p = Path(src)
    if not p.is_file():
        print(f"missing image: {p}", file=sys.stderr)
        missing.append(p.name)
        return f'<figure class="shot {cls}"><div class="frame">нет снимка: {e(p.name)}</div><figcaption>{e(cap)}<span>{e(when or "—")}</span></figcaption></figure>'
    when = when or datetime.fromtimestamp(p.stat().st_mtime).strftime("%d.%m")
    dst = OUT / "img" / p.name
    dst.parent.mkdir(exist_ok=True)
    shutil.copy(p, dst)
    return f'<figure class="shot {cls}"><div class="frame"><img src="img/{p.name}"></div><figcaption>{e(cap)}<span>{e(when)}</span></figcaption></figure>'


SH = W / "shots"
SS = Path(os.environ.get("REPORT_SCREENSHOTS") or R / "testing/screenshots")
DS = SS / "design"

# ---------- tables ----------
def chip(k):
    t = {"yes": "есть", "part": "частично", "no": "нет"}[k]
    return f'<span class="chip {k}">{t}</span>'


steps = [(s["step"], s["node"], s["node_text"], s["depth"], s["depth_text"]) for s in road["steps"]]
layers = [(l["name"], l["percent"], l["holds"]) for l in road["layers"]]


def layers_html():
    rows = "".join(f'<tr><td class="b">{e(n)}</td><td class="pc">~{p}%<div class="bar"><div style="width:{p}%"></div></div></td><td>{e(w)}</td></tr>' for n, p, w in layers)
    return f'<table class="t"><thead><tr><th>Слой</th><th style="width:150px">Готовность</th><th>Чем держится</th></tr></thead><tbody>{rows}</tbody></table>'


def steps_html():
    rows = "".join(f'<tr><td class="b">{e(a)}</td><td>{chip(b)}</td><td>{e(c)}</td><td>{chip(d)}</td><td>{e(f)}</td></tr>' for a, b, c, d, f in steps)
    return ('<table class="t steps"><thead><tr><th style="width:110px">Шаг</th><th style="width:68px">Узел</th><th>Что есть на сервере</th>'
            f'<th style="width:68px">depth</th><th>Что есть в терминале</th></tr></thead><tbody>{rows}</tbody></table>')


def matrix_html():
    # one-glance grid: what exists where
    cols = road["matrix_columns"]
    grid = [(r["name"], r["cells"]) for r in road["matrix"]]
    head = "".join(f"<th>{c}</th>" for c in cols)
    body = ""
    for name, cells in grid:
        body += f'<tr><td class="b">{e(name)}</td>' + "".join(
            f'<td class="mc"><span class="dot {c}"></span></td>' if c != "—" else '<td class="mc na">—</td>' for c in cells) + "</tr>"
    return f'<table class="t matrix"><thead><tr><th></th>{head}</tr></thead><tbody>{body}</tbody></table>'


def open_now_html():
    rows = [r for r in opened if r[2] == "сейчас"]
    body = "".join(f'<tr><td><code>{e(r[0])}</code></td><td>{e(r[3])}</td><td>{e(r[4][:230])}{"…" if len(r[4])>230 else ""}</td></tr>' for r in rows)
    return f'<table class="t"><thead><tr><th style="width:150px">Пункт</th><th style="width:60px">Вес</th><th>Что</th></tr></thead><tbody>{body}</tbody></table>'


def live_html():
    rows = "".join(f'<tr><td><code>{e(u)}</code></td><td><span class="chip {"yes" if c=="200" else "no"}">{c}</span></td></tr>' for u, c in live)
    return f'<table class="t"><thead><tr><th>Адрес</th><th style="width:80px">Ответ</th></tr></thead><tbody>{rows}</tbody></table>'


def pool_html():
    out = []
    for l in pool:
        k = "yes" if l.startswith("✓") else ("no" if l.startswith("✗") else "idle")
        parts = l[1:].split(None, 1)
        out.append(f'<div class="node {k}"><b>{e(parts[0])}</b><span>{e(parts[1] if len(parts)>1 else "")}</span></div>')
    return '<div class="pool">' + "".join(out) + "</div>"


def unpushed_html():
    if not unpushed:
        return f'<p class="lead">Нет: всё на ветке {e(git["branch"])} уже на удалённом.</p>'
    rows = "".join(f'<tr><td><code>{e(h)}</code></td><td class="nw">{e(w)}</td><td>{e(s)}</td></tr>' for h, w, s in unpushed)
    return f'<table class="t small"><thead><tr><th style="width:62px">Коммит</th><th style="width:80px">Когда</th><th>Сообщение</th></tr></thead><tbody>{rows}</tbody></table>'


tests_svg, tests_first, tests_last = chart_tests()
commits_svg, commits_sum = chart_commits()
open_svg, tally = chart_open()
now_n = sum(tally["сейчас"].values())
launch_n = sum(tally["с запуском"].values())
peaks = sorted(sorted(commits, key=lambda c: -int(c[1]))[:3])
peaks_text = ", ".join(ru_date(d) for d, _ in peaks[:-1]) + f" и {ru_date(peaks[-1][0])}" if len(peaks) > 1 else ru_date(peaks[0][0])
li = lambda items: "".join(f"<li>{P(t)}</li>" for t in items)
stale_html = "" if not stale else (
    '<div class="callout red"><h3>Текст отстаёт от дерева</h3><ul>'
    + "".join(f"<li>{e(n)} записан на {ru_date(d)}, а последний день с коммитами — {ru_date(last_day)}: "
              f"обновить <code>scripts/report/prose_RU.toml</code>.</li>" for n, d in stale)
    + "</ul></div>")

css = (H / "report.css").read_text()
fonts = R / "panel/public/fonts"
(OUT / "fonts").mkdir(exist_ok=True)
for f in fonts.glob("*.woff2"):
    shutil.copy(f, OUT / "fonts" / f.name)
fontcss = (R / "panel/src/fonts.css").read_text().replace("url(/fonts/", "url(fonts/")

doc = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт {measured[:10]}</title>
<style>{fontcss}{css}</style></head><body>

<header class="hero">
  <div class="kicker">XOR.AD · SOSED.PLACE · NEIGHBRO.PLACE · ВЕТКА {e(git['branch']).upper()} · {e(git['head'])}</div>
  <h1>Что есть<br>и чего нет</h1>
  <p>Полный отчёт о состоянии продукта. Срез на {e(measured)}. Числа в шапке, графики и раздел «Живой контур» замерены скриптами при сборке отчёта; кадры терминала — из прогона тестов экранов, снимки витрин — сделаны сейчас. Проценты готовности — экспертная оценка роадмапа {ru_date(road['as_of'])}; слова без замера — из prose_RU.toml, с датой при каждом блоке.</p>
</header>
{stale_html}
<section class="kpis">
  <div><b>{tests_total}</b><span>тестов в репозитории, +{tests_total - tests_prev} за {ru_date(last_day)}; ещё {depth_now} в depth</span></div>
  <div><b>{ops_built}<small> / {ops_total}</small></b><span>операций API построено; {ops_spec} — только в спеке</span></div>
  <div><b>{mig_files}</b><span>миграций узла, последняя {mig_last}; на проде — до {e(road['prod_migration'])}</span></div>
  <div><b>{git['ahead_origin_day57']}</b><span>коммитов нет ни на одном удалённом: {git['day57_tail']} — хвост day57, {int(git['ahead_origin_day57'])-int(git['day57_tail'])} — {e(git['branch'])}</span></div>
  <div><b>{live_ok}<small> / {len(live)}</small></b><span>живых адресов ответили 200</span></div>
</section>

<div class="callout">
  <h3>Коротко <small>состояние на {ru_date(state['as_of'])}</small></h3>
  <ul>
    <li><b>Есть:</b> публичный прод — обе витрины, панель, узел relay p1 ({e(prod['image'])}, база {e(prod['database'])}, почта {e(prod['mail'])}); {P(state['has'])}.</li>
    <li><b>Нет:</b> {P(state['has_not'])}.</li>
    <li><b>Главный разрыв — выкат:</b> {P(state['gap'])}.</li>
    <li><b>{ru_date(last_day)}:</b> {last_day_commits} коммитов{" — " + P(day['summary']) if day['date'] == last_day else f"; итоги этого дня не записаны (последние — за {ru_date(day['date'])})"}.</li>
    <li>В реестре открытых вопросов {len(opened)} пунктов: {now_n} со сроком «сейчас», {launch_n} — «с запуском».</li>
  </ul>
</div>

<div class="keep"><h2>1. Что есть, что нет — одним взглядом</h2>
<p class="lead">Точка — наличие слоя в продукте, по роадмапу {ru_date(road['as_of'])}. «На проде» — стоит ли это на p1, {P(road['prod_image_note'])}.</p>
{matrix_html()}
<div class="legend"><span><i class="dot yes"></i>есть</span><span><i class="dot part"></i>частично</span><span><i class="dot no"></i>нет</span><span>— не применимо</span></div></div>

<h2>2. Готовность по слоям</h2>
<p class="lead">Из <code>docs/roadmap_RU.md</code>, срез {ru_date(road['as_of'])}; оценки экспертные, по часам не взвешены.</p>
{layers_html()}

<h2>3. Динамика</h2>
<div class="keep"><h3 class="ch">Тесты по дням: {tests_first} → {tests_last}</h3>
<p class="lead">Число тест-кейсов на последнем коммите каждого дня с коммитами, посчитано по дереву git тем же шаблоном, что <code>scripts/count-tests.sh</code>; depth — по файлам <code>*.test.*</code>.</p>
{legend([(S1, "узел relay"), (S2, "панель и e2e"), (S3, "терминал depth")])}
{tests_svg}</div>
<div class="keep"><h3 class="ch">Коммиты по дням: {commits_sum} с {ru_date(commits[0][0])}</h3>
<p class="lead">Линия {e(git['branch'])} целиком, со всем влитым в неё. Пики — {peaks_text}.</p>
{commits_svg}</div>
<div class="keep"><h3 class="ch">Разрыв выката: последняя миграция в коде и на контурах</h3>
<p class="lead">Код — по файлам <code>relay/node/db</code> сейчас; контуры — по закреплённым тегам <code>relay/wizard/environments.toml</code> (роадмап {ru_date(road['as_of'])}). <code>schema_migrations</code> на боксах не опрашивался.</p>
{chart_migrations()}</div>

<h2>4. Что сделано {ru_date(day['date'])}</h2>
<div class="cards">
{"".join(f'  <div class="card"><h4>{e(c["title"])}</h4><p>{P(c["text"])}</p></div>' for c in day["cards"])}
</div>

<h2>5. Продукт по шагам</h2>
<p class="lead">Сервер — <code>relay/node</code>, клиент — <code>depth</code>. Шаги — §13 <code>docs/chat_RU.md</code>.</p>
{steps_html()}

<h2>6. Чего нет и что стоит</h2>
<p class="lead">Состояние на {ru_date(state['as_of'])}.</p>
<div class="callout red"><h3>Ждёт действия или решения владельца</h3><ul>
{li(state['owner'])}
</ul></div>
<h3 class="ch">Не построено в коде</h3>
<ul class="plain">
{li(state['not_built'])}
</ul>

<h2>7. Живой контур</h2>
<p class="lead">Замер при сборке ({e(measured)}): GET по адресам и <code>scripts/check-node-images.sh</code>.</p>
{live_html()}
<p>Прод: узел <code>{e(prod['node'])}</code>, {e(prod['region'])}, образ <code>{e(prod['image'])}</code>, база <code>{e(prod['database'])}</code>, почта <code>{e(prod['mail'])}</code>, хранилище <code>{e(prod['storage_transport'])}</code>, бренды {e(', '.join(prod['brands']))}.</p>
<h3 class="ch">Пул узлов</h3>
{pool_html()}
<p class="lead">{e(pool_sum or pool_why)}</p>

<h2>8. Экраны</h2>
<h3 class="ch">Живые — сняты при сборке отчёта</h3>
<div class="shots two">
{img(SH/'sosed-desktop.png', 'sosed.place — витрина, десктоп', 'сейчас')}
{img(SH/'neighbro-desktop.png', 'neighbro.place — витрина, десктоп', 'сейчас')}
</div>
<div class="shots four">
{img(SH/'sosed-mobile-dark.png', 'sosed.place — телефон, тёмная', 'сейчас', 'phone')}
{img(SH/'neighbro-mobile-light.png', 'neighbro.place — телефон', 'сейчас', 'phone')}
{img(SH/'panel-login.png', 'xor.panov.id — вход в панель', 'сейчас', 'wide2')}
</div>

<h3 class="ch">Терминал depth — настоящие кадры</h3>
<p class="lead">Последний кадр каждого теста экранов (<code>depth/ink/screens.node-test.ts</code>), прогон сейчас: пройдено {screens_passed}, провалено {screens_failed}. Цвет и жирность — как их отдаёт Ink.</p>
<div class="terms">
{term('registration will not go on', 'регистрация')}
{term('the location refuses', 'точка и радиус')}
{term('a long row of actions', 'лента')}
{term('a safety code that changed', 'код безопасности')}
{term('the chat says its own span', 'чат и срок беседы')}
{term('blocking asks twice', 'блокировка')}
{term('a statement shows all five', 'мотивировка ст. 17')}
{term('stepping away shows its price', 'отлучка')}
</div>

<h3 class="ch">Панель — последние снимки</h3>
<div class="shots two">
{img(SS/'panel-panel-users-desktop-light.png', 'Панель: пользователи панели')}
{img(SS/'panel-waitlist-desktop-dark.png', 'Панель: лист ожидания, тёмная')}
{img(DS/'feed-queue-mockup.png', 'Макет: очередь модерации ленты')}
{img(DS/'support-queue-mockup.png', 'Макет: очередь поддержки')}
</div>
<h3 class="ch">Приложение — макеты (веб-лица ещё нет)</h3>
<div class="shots two">
{img(DS/'screen-03.png', 'Экран 03 — лента')}
{img(DS/'screen-23.png', 'Экран 23 — фраза во весь экран')}
{img(DS/'screen-17-venue.png', 'Экран 17 — оффер и кабинет заведения')}
{img(DS/'screen-26-place-qr.png', 'Экран 26 — QR места')}
</div>

<h2>9. Реестр открытых вопросов</h2>
<p class="lead"><code>docs/facts/open.tsv</code>, {len(opened)} пунктов, по сроку и весу.</p>
{legend([(S1, "юридическое"), (S2, "продукт"), (S3, "удобство")])}
{open_svg}
<h3 class="ch">Со сроком «сейчас»</h3>
{open_now_html()}

<h2>10. Что проверено и как</h2>
<div class="callout green"><h3>Проверено при сборке отчёта</h3><ul>
<li>Пять живых адресов — GET, {live_ok} из {len(live)} ответили 200; <code>/health</code> прода — образ и база выше.</li>
{f"<li>Пул узлов — <code>scripts/check-node-images.sh</code>: {e(pool_sum.split('·', 1)[-1].strip())}.</li>" if pool_sum else ""}
<li>Контракт — <code>scripts/check-openapi.sh</code>: {ops_total} операций, протокол и код сходятся со спецификацией.</li>
<li>Тесты посчитаны <code>scripts/count-tests.sh</code> ({tests_total}); история — по дереву git на каждый день.</li>
<li>Тесты экранов depth прогнаны в контейнере: пройдено {screens_passed}, провалено {screens_failed}; кадры в разделе 8 — из этого прогона.</li>
<li>Живые снимки витрин и панели — Playwright в контейнере, сейчас.</li>
</ul></div>
<div class="callout red"><h3>Не проверено сейчас</h3><ul>
<li>Проценты готовности, таблица шагов и сетка — оценка роадмапа {ru_date(road['as_of'])}, не замер.</li>
{f"<li>Пул узлов не опрошен: {e(pool_why)}.</li>" if pool_why else ""}
{f"<li>Нет {len(missing)} сохранённых снимков ({e(', '.join(missing))}): каталог <code>testing/screenshots</code> не в git — задать <code>REPORT_SCREENSHOTS</code>.</li>" if missing else ""}
{li(state['unverified'])}
</ul></div>

<h2>Приложение А. Коммиты, которых нет на удалённом</h2>
{unpushed_html()}
<p class="src">Источники: docs/roadmap_RU.md, docs/facts/open.tsv, docs/chat_RU.md §13, git {e(git['branch'])}, замеры scripts/*. Собрано {e(measured)}.</p>
</body></html>"""
(OUT / "report.html").write_text(doc)
print("ok", len(doc))
