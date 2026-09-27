#!/usr/bin/env bash
# The web face speaks only through its dictionaries (W13).
#
# Red when:
#   - a Cyrillic letter stands in web/src code outside web/src/locales — a
#     word typed into a screen instead of a key (comments do not count);
#   - a web dictionary misses a key of the Russian one, has one it lacks, or
#     loses a {placeholder} — the languages are the terminal's seventeen;
#   - a key named in say("…") is in neither the terminal's Russian dictionary
#     nor the web's — a screen would show the key itself.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$root" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
src = root / "web/src"
locales = src / "locales"
depth = root / "depth/ink/locales"
bad = []

def code_only(text: str) -> str:
    # Strings are kept, comments dropped: a // or /* inside a string literal is
    # not a comment, so the scan walks the text once.
    out, i, n = [], 0, len(text)
    quote = None
    while i < n:
        c = text[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1]); i += 2; continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'`":
            quote = c; out.append(c); i += 1; continue
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        out.append(c); i += 1
    return "".join(out)

used = set()
for path in sorted(list(src.rglob("*.ts")) + list(src.rglob("*.tsx"))):
    if locales in path.parents:
        continue
    raw = path.read_text()
    code = code_only(raw)
    for no, line in enumerate(code.splitlines(), 1):
        if re.search(r"[А-Яа-яЁё]", line):
            bad.append(f"{path.relative_to(root)}:{no}: слово на экране мимо словаря: {line.strip()[:80]}")
    used.update(re.findall(r"""\bsay\(\s*["']([\w.]+)["']""", raw))

ru_web = json.loads((locales / "ru.json").read_text())
ru_depth = json.loads((depth / "ru.json").read_text())
langs = sorted(p.stem for p in depth.glob("*.json"))
if len(langs) != 17:
    bad.append(f"языков у терминала {len(langs)}, ожидается 17")
for lang in langs:
    f = locales / f"{lang}.json"
    if not f.exists():
        bad.append(f"нет файла web/src/locales/{lang}.json"); continue
    other = json.loads(f.read_text())
    for k, v in ru_web.items():
        if not str(other.get(k, "")).strip():
            bad.append(f"{lang}: нет ключа {k}"); continue
        if set(re.findall(r"\{(\w+)\}", v)) != set(re.findall(r"\{(\w+)\}", str(other[k]))):
            bad.append(f"{lang}: {k}: подстановки не совпадают с ru")
    for k in other:
        if k not in ru_web:
            bad.append(f"{lang}: лишний ключ {k}")
for k in sorted(used):
    if k not in ru_web and k not in ru_depth:
        bad.append(f"say(\"{k}\"): такого ключа нет ни у веба, ни у терминала")

for line in bad[:30]:
    print(f"  ✗ {line}")
if len(bad) > 30:
    print(f"  и ещё {len(bad) - 30}")
if bad:
    print(f"нарушений: {len(bad)}", file=sys.stderr); sys.exit(1)
print(f"веб говорит словарями: ключей веба {len(ru_web)}, языков {len(langs)}, названных ключей {len(used)}")
PY
