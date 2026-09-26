#!/usr/bin/env bash
# The relay's suites that need Postgres are named in one place — the --ignore
# list of `deno task test` in relay/node/deno.json — and that list must be
# exactly the suites that need it.
#
# Everything reads that list: the unit run skips it (deno task test, locally
# through scripts/run-relay-tests.sh and in CI), and the database run runs it
# (scripts/run-relay-database-tests.sh and CI's database job). Until 2026-09-26
# scripts/run-relay-tests.sh kept a copy by hand and it had drifted (B17).
#
# What makes a suite one that needs Postgres is its own refusal: each throws
# "DATABASE_URL is not set" on import rather than skipping quietly, since a
# suite that skips looks exactly like one that passes. So:
#   - a suite with that refusal and not on the list would run in the unit pass,
#     with no database, and die there — or be run by nobody;
#   - a name on the list that has no refusal, or no file, is a suite the unit
#     run silently stopped running.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node="${1:-$root/relay/node}"

python3 - "$node" <<'PY'
import glob, json, os, re, sys

node = sys.argv[1]
task = json.load(open(os.path.join(node, "deno.json")))["tasks"]["test"]
m = re.search(r"--ignore=(\S+)", task)
listed = set(m.group(1).split(",")) if m else set()
refusing = set()
for path in glob.glob(os.path.join(node, "test", "**", "*.test.ts"), recursive=True):
    if "DATABASE_URL is not set" in open(path, encoding="utf-8").read():
        refusing.add(os.path.relpath(path, node))

bad = []
for name in sorted(refusing - listed):
    bad.append(f"{name}: refuses to run without a database and is not in deno.json's --ignore — the unit run would take it")
for name in sorted(listed - refusing):
    if not os.path.exists(os.path.join(node, name)):
        bad.append(f"{name}: in deno.json's --ignore, and there is no such file")
    else:
        bad.append(f"{name}: in deno.json's --ignore, and it does not refuse to run without a database — the unit run skips it for nothing")
if bad:
    print("  ✗ набор тестов с базой разошёлся со списком в relay/node/deno.json:")
    for b in bad:
        print(f"    {b}")
    sys.exit(1)
print(f"тестов с базой: {len(listed)} — список в deno.json совпадает с тем, что просит базу")
PY
