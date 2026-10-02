#!/usr/bin/env bash
# The brands' sheets, the reference of the web's design gate since 02.10.2026
# (scripts/check-web-design.sh, scripts/design/web-design-map.tsv): for each
# brand its light theme and its night pair, generated from the theme JSON
# (web/themes/<brand>/<id>.json) by scripts/design/<brand>-sheets.py into
# panel/design/sheets-<brand>/<id>/, and linted by lint_svg.py when inkscape
# is there.
#
#   scripts/design/brand-sheets.sh                 # write the sheets
#   scripts/design/brand-sheets.sh --check         # red when the committed sheets are not what the JSON gives
#   scripts/design/brand-sheets.sh --render <dir>  # PNG @2x of every sheet into <dir>/sheets-<brand>/<id>/ (Docker)
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/scripts/design"
mode="${1:-}"
status=0
pairs() {  # brand theme-id: the light theme and its night pair
  for brand in sosed neighbro; do
    night="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("night","dark"))' "$root/web/themes/$brand/light.json")"
    echo "$brand light"; echo "$brand $night"
  done
}

if [ "$mode" = "--render" ]; then
  out="$(mkdir -p "${2:?out dir}" && cd "$2" && pwd)"
  runner="panel-tests-runner"
  docker image inspect "$runner" >/dev/null 2>&1 || docker build -q -t "$runner" "$root/panel/tests" >/dev/null
  while read -r brand id; do
    mkdir -p "$out/sheets-$brand/$id"
    docker run --rm -u "$(id -u):$(id -g)" \
      -v "$root/scripts/render-design-mockup.mjs":/tests/render.mjs:ro \
      -v "$root/panel/design/sheets-$brand/$id":/design:ro \
      -v "$here/fonts":/panel-fonts:ro \
      -v "$out/sheets-$brand/$id":/out \
      -w /tests --entrypoint node "$runner" render.mjs >/dev/null || { echo "✗ not rendered: sheets-$brand/$id" >&2; status=1; }
  done < <(pairs)
  exit "$status"
fi

dest="$root/panel/design"
if [ "$mode" = "--check" ]; then
  dest="$(mktemp -d)"; trap 'rm -rf "$dest"' EXIT
fi
while read -r brand id; do
  o="$dest/sheets-$brand/$id"
  rm -rf "$o"; mkdir -p "$o"
  python3 "$here/$brand-sheets.py" --theme "$root/web/themes/$brand/$id.json" --out "$o" >/dev/null || { echo "✗ $brand-sheets.py failed on $id"; status=1; continue; }
  if command -v inkscape >/dev/null; then
    (cd "$o" && python3 "$here/lint_svg.py" Arrival.svg Feed.svg Card.svg Card-liked.svg Card-more.svg Compose.svg Match.svg Chat.svg Profile.svg Card-dark.svg | tail -1 | sed "s#^#  $brand/$id #")
  fi
  if [ "$mode" = "--check" ]; then
    diff -rq "$o" "$root/panel/design/sheets-$brand/$id" >/dev/null || { echo "✗ panel/design/sheets-$brand/$id is not what web/themes/$brand/$id.json gives — scripts/design/brand-sheets.sh"; status=1; }
  fi
done < <(pairs)
[ "$status" = 0 ] && echo "✓ brand sheets: $(pairs | wc -l) themes ${mode:+(checked)}"
exit "$status"
