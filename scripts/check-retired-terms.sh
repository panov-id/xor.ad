#!/usr/bin/env bash
# A decision retires a word. This finds the places that never heard.
#
#   scripts/check-retired-terms.sh
#
# Reading the chat spec on 2026-08-17 turned up three self-contradictions, all
# months old, none catchable by anything we had: an external moderation model
# offered in one paragraph and excluded in the next; an identity recognised by a
# "secret" the spec itself had replaced and said it had replaced; a feed check
# still called synchronous weeks after it moved into a queue. The writing was
# fine. Nobody was watching the vocabulary.
#
# A retired term is allowed where a passage is explicitly about history — the
# spec keeps those on purpose, because a decision without its discarded
# alternative is just an assertion. Such a passage is marked by one of the
# markers below on the same line or the two before it.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="$ROOT_DIR/docs/retired-terms.txt"

[ -f "$REGISTRY" ] || { echo "нет реестра $REGISTRY" >&2; exit 2; }

python3 - "$ROOT_DIR" "$REGISTRY" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
registry = pathlib.Path(sys.argv[2])

# An explicit marker, not a guess. The first version inferred "this passage is
# about history" from nearby words like «раньше» and "used to" — and these
# documents record their reversals constantly, so almost every paragraph had one
# within two lines. It excused two of the three errors it was written to catch.
#
# A marker is a decision: somebody wrote it, meaning "the old wording belongs
# here". It has to sit on the same line or the line above.
MARKER = re.compile(r"\[retired\]")

entries = []
for line in registry.read_text(encoding="utf-8").splitlines():
    line = line.split("#", 1)[0].strip()
    if not line or "|" not in line:
        continue
    term, scope, replacement = (part.strip() for part in line.split("|", 2))
    entries.append((term, scope.split(), replacement))

if not entries:
    raise SystemExit("реестр пуст — проверять нечем")

problems = 0
checked = set()
for term, scope, replacement in entries:
    # Scoped on purpose: the same words are correct elsewhere. «секрет» is right
    # in forty places about GitHub secrets; it was one sentence in one spec that
    # went stale.
    documents = sorted({
        path for glob in scope for path in (root / "docs").glob(glob)
    })
    if not documents:
        print(f"  ! правило «{term}» не нашло ни одного файла из: {' '.join(scope)}")
        problems += 1
        continue
    checked.update(documents)
    pattern = re.compile(re.escape(term), re.IGNORECASE)
    for document in documents:
        lines = document.read_text(encoding="utf-8").splitlines()
        for number, line in enumerate(lines, start=1):
            if not pattern.search(line):
                continue
            context = "\n".join(lines[max(0, number - 2):number])
            if MARKER.search(context):
                continue
            problems += 1
            print(f"  ✗ {document.relative_to(root)}:{number}")
            print(f"      «{term}» — отменено: {replacement}")
            print(f"      если это запись об истории — поставьте [retired] на этой строке или строкой выше")
            print(f"      {line.strip()[:100]}")

print()
if problems:
    print(f"мест, где отменённое подано как действующее: {problems}", file=sys.stderr)
    print("Либо пометьте абзац как историю, либо перепишите под принятое решение.", file=sys.stderr)
    raise SystemExit(1)
print(f"проверено формулировок: {len(entries)}, документов: {len(checked)} — отменённое нигде не выдаётся за действующее")
PY
