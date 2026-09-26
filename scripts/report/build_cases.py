#!/usr/bin/env python3
"""Cases for build.py: each one builds the page from made-up measurements and
checks one thing the report must not get wrong.

  python3 scripts/report/build_cases.py                # the tree's build.py
  python3 scripts/report/build_cases.py <dir>          # build.py + prose_RU.toml from <dir>

The second form exists to watch the cases go red on an older build.py: a case
that never failed proves nothing. No Docker, no network, no git: seconds.
"""
import json, os, re, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE

LIVE = ["sosed-desktop", "neighbro-desktop", "sosed-mobile-dark", "neighbro-mobile-light", "panel-login"]
STORED = ["panel-panel-users-desktop-light.png", "panel-waitlist-desktop-dark.png"]
DESIGN = ["feed-queue-mockup.png", "support-queue-mockup.png", "screen-03.png", "screen-23.png",
          "screen-17-venue.png", "screen-26-place-qr.png"]
TERMS = ["registration will not go on", "the location refuses", "a long row of actions",
         "a safety code that changed", "the chat says its own span", "blocking asks twice",
         "a statement shows all five", "stepping away shows its price"]


def fixture(tmp, **over):
    """A complete set of measurements; `over` replaces single files."""
    w = Path(tmp) / "work"
    d = w / "data"
    (w / "shots").mkdir(parents=True)
    d.mkdir()
    files = {
        "git.env": "branch=testbranch\nhead=abc1234\nahead_origin_day57=74\nday57_tail=64\n"
                   "uncommitted=0\nupstream=none\nmeasured=26.09.2026 06:00\n",
        "history.tsv": "2026-09-25\tabc\t500\t50\t10\t40\t57\n2026-09-26\tdef\t520\t50\t10\t45\t57\n",
        "commits_per_day.tsv": "2026-09-25\t27\n2026-09-26\t4\n",
        "count-tests.txt": "итого    621\n",
        "openapi.txt": "операций: 139 (built 99, spec 40)\n",
        "live.tsv": "".join(f"https://h{i}.test/\t200\n" for i in range(5)),
        "prod-health.json": json.dumps({"image": "v1", "database": "ok", "mail": "resend", "node": "p1",
                                        "region": "eu", "storage_transport": "bunny", "brands": ["sosed"]}),
        "node-images.txt": "✓ p1 v1\nзаписей в пуле: 2 · сошлось: 1 · разошлось: 0 · без ответа: 1\n",
        "node-images.rc": "0\n",
        "open.tsv": "a\tx\tсейчас\tlegal\tтекст\nb\tx\tс запуском\tproduct\tтекст\n",
        "unpushed.tsv": "abc1234\t26.09 06:00\tmsg\n",
        "frames.json": json.dumps([[t, "frame"] for t in TERMS]),
        "frames.txt": "пройдено 32, провалено 0\n",
    }
    files.update({k: v for k, v in over.items() if v is not None})
    for k in [k for k, v in over.items() if v is None]:
        files.pop(k)
    for name, text in files.items():
        (d / name).write_text(text)
    for n in LIVE:
        (w / "shots" / f"{n}.png").write_bytes(b"png")
    shots = Path(tmp) / "screens"
    (shots / "design").mkdir(parents=True)
    for n in STORED:
        (shots / n).write_bytes(b"png")
    for n in DESIGN:
        (shots / "design" / n).write_bytes(b"png")
    return w, shots


def build(w, shots, prose=None):
    # build.py runs from a copy under a scratch root (relay/ and panel/ linked
    # from the tree), so a case can hand it its own prose_RU.toml.
    root = w.parent / "root"
    rep = root / "scripts" / "report"
    rep.mkdir(parents=True, exist_ok=True)
    for f in ("build.py", "report.css", "prose_RU.toml"):
        (rep / f).write_text((SRC / f).read_text())
    if prose is not None:
        (rep / "prose_RU.toml").write_text(prose)
    for d in ("relay", "panel"):
        if not (root / d).exists():
            (root / d).symlink_to(ROOT / d)
    env = dict(os.environ, REPORT_WORK=str(w), REPORT_SCREENSHOTS=str(shots))
    r = subprocess.run([sys.executable, str(rep / "build.py")], env=env, capture_output=True, text=True)
    page = (w / "out" / "report.html").read_text() if (w / "out" / "report.html").is_file() else ""
    return r.returncode, page, r.stderr


def text(page):
    return re.sub(r"<[^>]+>", "", page)


def section(page, start, end):
    t = text(page)
    return t[t.find(start):t.find(end, t.find(start))]


CASES = []


def case(fn):
    CASES.append(fn)
    return fn


@case
def pool_is_checked_only_on_exit_code_zero(tmp):
    w, s = fixture(tmp, **{"node-images.rc": "3\n",
                           "node-images.txt": "записей в пуле: 2 · сошлось: 0 · без ответа: 2\n"
                                              "внимание: сверить не удалось ни один узел — это не зелёный результат\n"})
    rc, page, err = build(w, s)
    checked = section(page, "Проверено при сборке", "Не проверено сейчас")
    unchecked = section(page, "Не проверено сейчас", "Приложение А")
    assert rc == 0, err
    assert "Пул узлов" not in checked, f"a pool with exit 3 is under 'checked': {checked!r}"
    assert "код 3" in unchecked, f"exit 3 not named under 'not checked': {unchecked!r}"


@case
def pool_with_exit_zero_is_checked(tmp):
    w, s = fixture(tmp)
    rc, page, err = build(w, s)
    assert rc == 0, err
    assert "Пул узлов" in section(page, "Проверено при сборке", "Не проверено сейчас")


@case
def live_shots_are_claimed_only_when_taken(tmp):
    w, s = fixture(tmp)
    (w / "shots" / "panel-login.png").unlink()
    rc, page, err = build(w, s)
    checked = section(page, "Проверено при сборке", "Не проверено сейчас")
    assert rc == 0, err
    assert "Живые снимки" not in checked, "a missing live shot still claimed as taken"
    assert "panel-login" in section(page, "Не проверено сейчас", "Приложение А")


@case
def missing_stored_shots_name_their_real_place(tmp):
    w, s = fixture(tmp)
    empty = Path(tmp) / "empty"
    empty.mkdir()
    rc, page, err = build(w, empty)
    unchecked = section(page, "Не проверено сейчас", "Приложение А")
    assert rc == 0, err
    assert "Нет 8 сохранённых снимков" in unchecked, unchecked
    assert "testing/screenshots" not in unchecked and "/home/" not in page, "blames a place it did not look in"


@case
def address_count_comes_from_the_measurement(tmp):
    w, s = fixture(tmp, **{"live.tsv": "https://a.test/\t200\nhttps://b.test/\t200\nhttps://c.test/\t503\n"})
    rc, page, err = build(w, s)
    assert rc == 0, err
    assert "Пять" not in text(page), "a fixed 'five' over three addresses"
    assert "2 из 3 ответили 200" in text(page)


@case
def an_unquoted_toml_date_builds(tmp):
    w, s = fixture(tmp)
    prose = re.sub(r'^(as_of|date) = "([0-9-]+)"', r"\1 = \2", (SRC / "prose_RU.toml").read_text(), flags=re.M)
    assert re.search(r"^as_of = 20", prose, re.M), "fixture did not unquote a date"
    rc, page, err = build(w, s, prose)
    assert rc == 0, f"unquoted date broke the build: {err.strip().splitlines()[-1:]}"


@case
def numbers_agree_with_their_nouns(tmp):
    w, s = fixture(tmp, **{"open.tsv": "".join(f"i{n}\tx\t-\tlegal\tt\n" for n in range(21)),
                           "live.tsv": "https://a.test/\t200\n"})
    rc, page, err = build(w, s)
    t = text(page)
    assert rc == 0, err
    for wrong in ("4 коммитов", "74 коммитов", "21 пунктов", "итоги дня записан ", "621 тестов"):
        assert wrong not in t, f"disagreement: {wrong!r}"
    for right in ("4 коммита", "74 коммита", "21 пункт", "из 1 живого адреса"):
        assert right in t, f"missing: {right!r}"


@case
def axes_grow_with_the_data(tmp):
    w, s = fixture(tmp, **{
        "history.tsv": "2026-09-25\tabc\t500\t50\t10\t40\t57\n2026-09-26\tdef\t1300\t50\t10\t45\t57\n",
        "commits_per_day.tsv": "2026-09-25\t27\n2026-09-26\t100\n",
        "open.tsv": "".join(f"i{n}\tx\t-\tlegal\tt\n" for n in range(20))})
    rc, page, err = build(w, s)
    assert rc == 0, err
    axes = [int(v) for v in re.findall(r'class="ax">(\d+)</text>', page)]
    assert 1500 in axes, f"tests axis tops out below 1405: {sorted(set(axes))[-5:]}"
    assert 120 in axes, "commits axis tops out below 100"
    assert 24 in axes, "open-items axis tops out below 20"


@case
def prose_holds_no_measured_numbers_and_no_later_facts_under_an_earlier_date(tmp):
    import tomllib
    p = tomllib.loads((SRC / "prose_RU.toml").read_text())
    road = p["roadmap"]
    assert "prod_migration" not in road, "prod migration written twice"
    holds = " ".join(l["holds"] for l in road["layers"])
    assert not re.search(r"e2e \d|юнит \d", holds), f"measured counts in prose: {holds!r}"
    steps = p.get("steps", road)
    dated = str(steps.get("as_of", road["as_of"]))
    for s in steps["steps"]:
        for later in re.findall(r"(\d\d)\.09 —", s["node_text"] + s["depth_text"]):
            assert f"2026-09-{later}" <= dated, f"a {later}.09 fact under a {dated} date: {s['step']}"
    assert "testOnly" not in (SRC / "prose_RU.toml").read_text(), "depth's PIN stubs are gone since A5"


def main():
    bad = 0
    for fn in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                fn(tmp)
                print(f"ok    {fn.__name__}")
            except AssertionError as err:
                bad += 1
                print(f"FAIL  {fn.__name__}: {err}")
            except Exception as err:  # a crash in the build under test is a failure too
                bad += 1
                print(f"FAIL  {fn.__name__}: {type(err).__name__}: {err}")
    print(f"{len(CASES) - bad} passed, {bad} failed ({SRC})")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
