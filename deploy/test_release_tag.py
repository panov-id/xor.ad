#!/usr/bin/env python3
"""The UAT release tag must survive a re-run.

    python3 deploy/test_release_tag.py

The tag is `v<date>-g<sha7>`, so it is the same on every run of the same commit
on the same day. Creating it unguarded meant the second run failed with "tag
already exists" — and failed in the worst place: the `release` job went red and
every job depending on it was skipped, so re-running, which is the first thing
anyone reaches for after a bad deploy, could not work.

Two repositories out of three had this and one did not, which is the useful part:
the guard was written once and never copied. A check is cheaper than remembering.
"""

import pathlib
import re
import sys

WORKFLOW = pathlib.Path(__file__).resolve().parent.parent / ".github/workflows/deploy-uat.yml"

if not WORKFLOW.exists():
    sys.exit(f"no {WORKFLOW} — this check is in the wrong repository")

text = WORKFLOW.read_text(encoding="utf-8")
problems = []

for command in ("git tag", "git push origin"):
    # The line that runs it, wherever it sits in the file.
    lines = [line.strip() for line in text.split("\n") if line.strip().startswith(command)]
    if not lines:
        problems.append(f"no `{command}` line at all — has the release step moved?")
        continue
    for line in lines:
        # Guarded means the failure is handled on the same line: `|| echo …`.
        if "||" not in line:
            problems.append(f"unguarded: {line}")

if problems:
    print("the release tag is not idempotent:")
    for problem in problems:
        print(f"  - {problem}")
    print("\nA re-run of the same commit on the same day would fail here, and the jobs")
    print("that depend on `release` would be skipped rather than run.")
    sys.exit(1)

print("release tag: a re-run of the same commit will not fail on it")
