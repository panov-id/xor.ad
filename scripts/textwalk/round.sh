#!/usr/bin/env bash
# One perfectionist round (owner 12.10.2026, «красиво на всех ширинах»): rebuild both stands, the sheet gate,
# the walk shot as SVG at every width, the JPEGs to look at. Out: testing/walk-svg/<name>/.
#   scripts/textwalk/round.sh round2
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
name="${1:?round name}"
cd "$root"
for b in sosed neighbro; do bash scripts/up-local.sh "$b" >/dev/null 2>&1 || { echo "stand $b failed"; exit 2; }; done
bash scripts/design/check-adaptive.sh 2>&1 | grep -E "ИТОГ|^  (лишнее|нет|радиус)"
bash scripts/textwalk/svg-walk.sh "testing/walk-svg/$name" 2>&1 | tail -12
docker run --rm -u "$(id -u):$(id -g)" -v "$root/testing/walk-svg/$name:/svg" \
  -v "$root/scripts/textwalk/svg-to-jpg.mjs:/walk/svg-to-jpg.mjs:ro" xor-textwalk:1.48.2 node /walk/svg-to-jpg.mjs 2>&1 | tail -3
