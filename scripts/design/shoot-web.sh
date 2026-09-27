#!/usr/bin/env bash
# Shoot every screen of the web face at 375x812, light and dark, next to the
# design sheets (WD0). A throwaway stand from docker-compose.web.yml (node and
# built page, project name with this PID), two people walked through the
# screens by shoot-web.mjs with Playwright from the panel-tests-runner image,
# then the sheets rendered by render-design-mockup.sh. Nothing on the host.
#
#   scripts/design/shoot-web.sh           # up, shoot, render sheets, down
#   scripts/design/shoot-web.sh --sheets  # only the sheets
#   SHOTS_OUT=testing/screenshots/web-before scripts/design/shoot-web.sh
#
# Out: testing/screenshots/web/<screen>-<light|dark>.png, a list of what opened
# and what did not in shots.tsv beside them, the sheets in sheets/ beside them.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/scripts/design"
out="$root/${SHOTS_OUT:-testing/screenshots/web}"
project="shoot-web-$$"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$out"
status=0

if [ "${1:-}" != "--sheets" ]; then
  cleanup() {
    if [ -n "${SHOTS_KEEP:-}" ]; then echo "stand kept: ${compose[*]} down -v --rmi local"; return; fi
    "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  echo "== stand: postgres, migrations, seed, node, web ($project)"
  "${compose[@]}" up -d --build --wait web web-adv || { "${compose[@]}" logs --no-color --tail 40 node web web-adv >&2; exit 1; }
  web="$("${compose[@]}" ps -q web)"

  # The statements screen needs a statement, which only a moderator's decision
  # writes: when shoot-web.mjs names an identity in statement.want, one row of
  # dsa_statements (relay/node/db/005_dsa_notices.sql) is written for it.
  rm -f "$out/statement.want" "$out/statement.done"
  (
    for _ in $(seq 1 1800); do
      if [ -s "$out/statement.want" ]; then
        who="$(tr -cd '0-9a-zA-Z_-' < "$out/statement.want")"
        "${compose[@]}" exec -T postgres psql -U relay -d relay_test -v ON_ERROR_STOP=1 -q -c \
          "INSERT INTO dsa_statements (brand, target_id, recipient_identity, restriction, facts, ground_kind, ground_text)
           VALUES ('sosed', 'shoot-web', '$who', 'hidden', 'фраза скрыта по жалобе соседа', 'contractual', 'правила сообщества, п. 3')" \
          && touch "$out/statement.done"
        exit 0
      fi
      sleep 0.5
    done
  ) &
  statements=$!

  echo "== shoot"
  timeout 900 docker run --rm --network "container:$web" \
    -v "$here/shoot-web.mjs":/tests/shoot-web.mjs:ro -v "$out":/out -w /tests \
    -e WEB_URL=http://localhost:4173 \
    --entrypoint node panel-tests-runner:latest shoot-web.mjs
  status=$?
  kill "$statements" 2>/dev/null || true
fi

# The sheets as built: panel/design/screen-*.svg, flattened from sheets/ and the
# kit by build-design-sheets.py. The sources in sheets/ draw by an external
# <use href="kit/…">, which renders as empty phones (seen 27.09.2026), so the
# flat ones are rendered, after a check that they match their sources.
echo "== sheets"
python3 "$root/scripts/build-design-sheets.py" --check || status=1
mkdir -p "$out/sheets"
for s in "$root"/panel/design/screen-*.svg; do
  n="$(basename "$s" .svg)"
  "$root/scripts/render-design-mockup.sh" "$n" >/dev/null || { echo "sheet not rendered: $n" >&2; status=1; }
  cp "$root/testing/screenshots/design/$n.png" "$out/sheets/"
done

echo "== $(grep -c $'\tok' "$out/shots.tsv") opened, $(grep -vc $'\tok' "$out/shots.tsv") not"
exit "$status"
