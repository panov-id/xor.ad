#!/usr/bin/env bash
# "A live phrase" is written once, in relay/node/src/lib/feed_limits.ts
# (LIVE_PHRASE, and livePhraseOf for an aliased table), and nowhere else.
#
# The node held it as text in eight places — the publish refusal, the quota,
# the like, the match, the likes list, the feed, its density, the name freeze
# and the hidden list — and changing one would have let the like, the quota
# and the feed disagree about which phrases are alive (B5 → B8 → B11,
# 2026-09-26). This fails on any copy of the pair "visible_at IS NOT NULL" and
# "expires_at > now()" outside feed_limits.ts, in either order, aliased or not,
# across a line break.
#
# What it does not catch, named so it is not mistaken for more: the pair
# written some other way (`expires_at >= now()`, `now() < expires_at`,
# `NOT (visible_at IS NULL)`). Those are rare enough to be read in review, and
# a pattern for every spelling would be a dictionary, not a gate.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${1:-$root/relay/node/src}"

python3 - "$src" <<'PY'
import os, re, sys

src = sys.argv[1]
col = r"(?:\w+\.)?"
visible = rf"{col}visible_at\s+IS\s+NOT\s+NULL"
alive = rf"{col}expires_at\s*>\s*now\(\)"
# The two within one condition: joined by AND, nothing but whitespace between.
pair = re.compile(rf"(?:{visible}\s+AND\s+{alive}|{alive}\s+AND\s+{visible})", re.IGNORECASE)

found = []
for base, _, files in os.walk(src):
    for name in files:
        if not name.endswith(".ts"):
            continue
        path = os.path.join(base, name)
        if os.path.basename(path) == "feed_limits.ts":
            continue
        text = open(path, encoding="utf-8").read()
        for m in pair.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            found.append(f"{os.path.relpath(path, src)}:{line}: {' '.join(m.group(0).split())}")

if found:
    print("  ✗ живая фраза написана текстом, а не через feed_limits.ts (LIVE_PHRASE / livePhraseOf):")
    for f in found:
        print(f"    {f}")
    sys.exit(1)
print("живая фраза: одна запись, в feed_limits.ts")
PY
