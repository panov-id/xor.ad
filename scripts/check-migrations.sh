#!/usr/bin/env bash
# Hygiene of the relay's migrations (relay/node/db/NNN_*.sql).
#
# relay/node/tools/migrate_db.ts says it outright: every file so far survives a
# re-run by hand-written IF NOT EXISTS, "and nothing required them to". This is
# what requires it, and two more things a file on a live box cannot take back:
#
#   if-not-exists   CREATE TABLE and CREATE [UNIQUE] INDEX carry IF NOT EXISTS,
#                   so a file applied and not recorded survives its second run;
#   not-null        ADD COLUMN ... NOT NULL carries a DEFAULT — on a table with
#                   rows it fails otherwise, and a backfill in the same file
#                   cannot come before the column it fills (a table created in
#                   the same file is empty and exempt); ALTER COLUMN ... SET NOT
#                   NULL comes after an UPDATE of that column in the same file;
#   number          NNN is three digits and used once, and a file is not added
#                   below a number already added before it: the migrator refuses
#                   such a file on every database that has the higher one
#                   (migration_order.ts).
#
# The files already on the boxes are not rewritten. What they break is listed in
# scripts/check-migrations.exceptions with a reason, and the gate goes red only
# on what is not listed — and on a listed line that no longer happens, so the
# list cannot keep excusing a file that has changed.
#
#   scripts/check-migrations.sh
#   MIGRATIONS_DIR=<dir> scripts/check-migrations.sh    # another directory (its probes)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
export MIGRATIONS_DIR="${MIGRATIONS_DIR:-$root/relay/node/db}"
export EXCEPTIONS="${EXCEPTIONS:-$here/check-migrations.exceptions}"
export REPO_ROOT="$root"

exec python3 - <<'PY'
import os, re, subprocess, sys
from pathlib import Path

db = Path(os.environ["MIGRATIONS_DIR"])
root = Path(os.environ["REPO_ROOT"])
exceptions_file = Path(os.environ["EXCEPTIONS"])

def clean(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    # Dollar-quoted bodies (DO blocks, functions) are code of their own, not DDL.
    sql = re.sub(r"\$(\w*)\$.*?\$\1\$", " ", sql, flags=re.S)
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)
    return sql

def top_level_split(text, sep=","):
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append(cur); cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts

found = []   # (file, rule, object, detail)
files = sorted(p for p in db.glob("*.sql"))

for f in files:
    stmts = [re.sub(r"\s+", " ", s).strip() for s in clean(f.read_text()).split(";")]
    created_here = set()
    updated = {}  # table -> set of columns set by an UPDATE so far in this file
    for s in stmts:
        if not s:
            continue
        m = re.match(r"(?i)create table (if not exists )?(\w+)", s)
        if m:
            created_here.add(m.group(2).lower())
            if not m.group(1):
                found.append((f.name, "if-not-exists", f"table {m.group(2).lower()}", "CREATE TABLE without IF NOT EXISTS"))
            continue
        m = re.match(r"(?i)create (unique )?index (concurrently )?(if not exists )?(\w+)", s)
        if m:
            if not m.group(3):
                found.append((f.name, "if-not-exists", f"index {m.group(4).lower()}", "CREATE INDEX without IF NOT EXISTS"))
            continue
        m = re.match(r"(?i)update (\w+) (?:\w+ )?set (.*?)(?: from | where |$)", s)
        if m:
            cols = {c.split("=")[0].strip().lower() for c in top_level_split(m.group(2)) if "=" in c}
            updated.setdefault(m.group(1).lower(), set()).update(cols)
            continue
        m = re.match(r"(?i)alter table (?:if exists )?(?:only )?(\w+) (.*)", s)
        if m:
            table, rest = m.group(1).lower(), m.group(2)
            for clause in top_level_split(rest):
                c = clause.strip()
                a = re.match(r"(?i)add (?:column )?(?:if not exists )?(\w+) (.*)", c)
                if a and not re.match(r"(?i)add (constraint|primary|unique|check|foreign)\b", c):
                    col, spec = a.group(1).lower(), a.group(2)
                    if re.search(r"(?i)\bnot null\b", spec) and not re.search(r"(?i)\bdefault\b", spec) \
                            and not re.search(r"(?i)\bgenerated\b", spec) and table not in created_here:
                        found.append((f.name, "not-null", f"{table}.{col}", "ADD COLUMN NOT NULL without DEFAULT on a table not created in this file"))
                    continue
                n = re.match(r"(?i)alter (?:column )?(\w+) set not null", c)
                if n:
                    col = n.group(1).lower()
                    if table not in created_here and col not in updated.get(table, set()):
                        found.append((f.name, "not-null", f"{table}.{col}", "SET NOT NULL with no UPDATE of the column before it in this file"))

# Numbers: three digits, once each, and never added below one added earlier.
by_number = {}
for f in files:
    m = re.match(r"(\d+)_", f.name)
    if not m or len(m.group(1)) != 3:
        found.append((f.name, "number", f.name, "the name does not start with a three-digit number and _"))
        continue
    by_number.setdefault(m.group(1), []).append(f.name)
for number, names in by_number.items():
    if len(names) > 1:
        for name in names:
            found.append((name, "number", number, f"number {number} is used by {len(names)} files"))

def added_at(path):
    try:
        out = subprocess.run(["git", "-C", str(root), "log", "--diff-filter=A", "--follow", "--format=%ct", "--", str(path)],
                             capture_output=True, text=True, check=True).stdout.split()
    except (subprocess.CalledProcessError, FileNotFoundError):
        out = []
    return int(out[-1]) if out else None   # None: not committed yet — the newest

import time
order = []
for f in files:
    t = added_at(f)
    order.append((t if t is not None else int(time.time()) + 1, f.name))
order.sort()
highest = ""
for t, name in order:
    if highest and name < highest:
        found.append((name, "number", name, f"added after {highest}, below it: the migrator refuses it on every database that has {highest}"))
    highest = max(highest, name)

# Exceptions: file<TAB>rule<TAB>object<TAB>reason.
listed = {}
if exceptions_file.exists():
    for line in exceptions_file.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4 or not parts[3].strip():
            print(f"✗ {exceptions_file.name}: a line without four columns or without a reason: {line!r}")
            sys.exit(1)
        listed[tuple(parts[:3])] = parts[3]

bad = 0
seen = set()
for name, rule, obj, detail in found:
    key = (name, rule, obj)
    seen.add(key)
    if key not in listed:
        print(f"✗ {name}: {rule}: {obj} — {detail}")
        bad += 1
for key in listed:
    if key not in seen:
        print(f"✗ {exceptions_file.name}: {key[0]}\t{key[1]}\t{key[2]} is listed but no longer happens — drop the line")
        bad += 1

print(f"migrations: {len(files)} files, {len(found)} breach(es), {len(found) - (len(seen & set(listed)))} not excused, "
      f"{len(listed)} excused — " + ("RED" if bad else "clean"))
sys.exit(1 if bad else 0)
PY
