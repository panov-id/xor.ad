#!/usr/bin/env bash
# Shoot every screen of the web face at 375x812, light and dark, next to the
# design sheets (WD0). A throwaway stand from docker-compose.web.yml (node and
# built page, project name with this PID), two people walked through the
# screens by shoot-web.mjs with Playwright from the panel-tests-runner image,
# then the sheets rendered by render-design-mockup.sh. Nothing on the host.
#
#   scripts/design/shoot-web.sh           # up, shoot, render sheets, down
#
# Out: testing/screenshots/web/<screen>-<light|dark>.png, a list of what opened
# and what did not in testing/screenshots/web/shots.tsv; the sheets in
# testing/screenshots/design/.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/scripts/design"
out="$root/testing/screenshots/web"
project="shoot-web-$$"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$out"

cleanup() { "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

echo "== stand: postgres, migrations, seed, node, web ($project)"
"${compose[@]}" up -d --build --wait web || { "${compose[@]}" logs --no-color --tail 40 node web >&2; exit 1; }
web="$("${compose[@]}" ps -q web)"

echo "== shoot"
timeout 900 docker run --rm --network "container:$web" \
  -v "$here/shoot-web.mjs":/tests/shoot-web.mjs:ro -v "$out":/out -w /tests \
  -e WEB_URL=http://localhost:4173 \
  --entrypoint node panel-tests-runner:latest shoot-web.mjs
status=$?

# The sheets through render-design-mockup.mjs, which reads the top of the
# directory it is given: sheets/ mounted as that top, and both sets of faces
# (the design's first) copied into one directory it falls back to.
echo "== sheets"
mkdir -p "$out/sheets"
fonts="$out/.fonts"; rm -rf "$fonts"; mkdir -p "$fonts"
cp -n "$root"/panel/design/fonts/* "$fonts"/; cp -n "$root"/panel/public/fonts/* "$fonts"/
docker run --rm -u "$(id -u):$(id -g)" \
  -v "$root/scripts/render-design-mockup.mjs":/tests/render.mjs:ro \
  -v "$root/panel/design/sheets":/design:ro \
  -v "$fonts":/panel-fonts:ro \
  -v "$out/sheets":/out -w /tests \
  --entrypoint node panel-tests-runner:latest render.mjs || status=1

echo "== $(grep -c $'\tok' "$out/shots.tsv") opened, $(grep -vc $'\tok' "$out/shots.tsv") not"
exit "$status"
