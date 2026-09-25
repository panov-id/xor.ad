#!/usr/bin/env bash
# Render depth's real screens (the screen tests) and keep each test's last frame
# in $REPORT_WORK/data/frames.json, the run's own tally in frames.txt.
#
# The screen test is patched into a copy of depth under $REPORT_WORK/dc, never
# into the tree: docker creates missing mount points as root, and a copy inside
# the repository would leave root-owned leftovers to clean. The copy is rebuilt
# from `git ls-files` on every run. Dependencies: the lockfile-named volume
# scripts/run-depth-ui-tests.sh fills.
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
image="node:24.21.0-alpine"
mkdir -p "$W/data"
rm -rf "$W/dc"
mkdir -p "$W/dc/node_modules"
(cd "$R/depth" && git ls-files -z | xargs -0 cp --parents -t "$W/dc")
python3 - "$R/depth/ink/screens.node-test.ts" "$W/dc/ink/_frames.node-test.ts" <<'PY'
import sys
s = open(sys.argv[1]).read()
patches = [
    ('import { render } from "ink-testing-library";',
     'import { render as render0 } from "ink-testing-library";\nimport { writeFileSync } from "node:fs";\nlet current: any = null; const frames: Array<[string,string]> = [];\nconst render = (...a: any[]) => { current = (render0 as any)(...a); return current; };'),
    ('      await fn();\n', '      await fn();\n      frames.push([name, current ? current.lastFrame() : ""]);\n'),
    ('  process.exit(failed === 0 ? 0 : 1);', '  writeFileSync("/out/frames.json", JSON.stringify(frames));\n  process.exit(failed === 0 ? 0 : 1);'),
]
for old, new in patches:
    if old not in s:
        sys.exit(f"frames.sh: screens.node-test.ts changed, anchor not found: {old.strip()[:60]}")
    s = s.replace(old, new)
open(sys.argv[2], "w").write(s)
PY
lock_hash="$(sha1sum "$R/depth/package-lock.json" | cut -c1-12)"
mods="-v depth-node-modules-$lock_hash:/repo/depth/node_modules"
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$W/dc":/repo/depth $mods -w /repo/depth "$image" \
  sh -c '[ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund && touch node_modules/.lock-ok; }' >/dev/null
# shellcheck disable=SC2086
timeout 300 docker run --rm -e FORCE_COLOR=1 -v "$R/relay":/repo/relay:ro -v "$W/dc":/repo/depth $mods \
  -v "$W/data":/out -w /repo/depth "$image" \
  node --experimental-transform-types ink/_frames.node-test.ts 2>&1 | tee "$W/data/frames.txt"
