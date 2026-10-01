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

  # What only the stand's database can give, asked for by shoot-web.mjs through
  # files in $out and answered once each:
  #   statement.want (an identity) → one dsa_statements row for it
  #     (relay/node/db/005_dsa_notices.sql), then statement.done — the
  #     statements screen needs a moderator's decision;
  #   envelope.want (a venue's name) → the code of its open envelope in
  #     envelope.code — the cabinet proves a venue by a letter's code, read
  #     here as web/e2e/specs/adv.spec.ts reads it.
  rm -f "$out/statement.want" "$out/statement.done" "$out/envelope.want" "$out/envelope.code"
  psql=("${compose[@]}" exec -T postgres psql -U relay -d relay_test -v ON_ERROR_STOP=1 -qAt)
  (
    for _ in $(seq 1 1800); do
      if [ -s "$out/statement.want" ] && [ ! -e "$out/statement.done" ]; then
        who="$(tr -cd '0-9a-zA-Z_-' < "$out/statement.want")"
        echo "INSERT INTO dsa_statements (brand, target_id, recipient_identity, restriction, facts, ground_kind, ground_text)
              VALUES ('sosed', 'shoot-web', :'who', 'hidden', 'фраза скрыта по жалобе соседа', 'contractual', 'правила сообщества, п. 3');" \
          | "${psql[@]}" -v who="$who" && touch "$out/statement.done"
      fi
      if [ -s "$out/envelope.want" ] && [ ! -e "$out/envelope.code" ]; then
        code="$(echo "SELECT e.code FROM venue_envelopes e JOIN venues v ON v.id = e.venue_id
                       WHERE v.name = :'name' AND e.used_at IS NULL AND e.burned_at IS NULL LIMIT 1;" \
          | "${psql[@]}" -v name="$(cat "$out/envelope.want")")"
        [ -n "$code" ] && printf '%s' "$code" > "$out/envelope.code"
      fi
      [ -e "$out/statement.done" ] && [ -e "$out/envelope.code" ] && exit 0
      sleep 0.5
    done
  ) &
  statements=$!

  echo "== shoot"
  timeout 900 docker run --rm --network "container:$web" \
    -v "$here/shoot-web.mjs":/tests/shoot-web.mjs:ro -v "$out":/out -w /tests \
    -e WEB_URL=http://localhost:4173 -e WEB_BREAK="${WEB_BREAK:-}" \
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

# The comic sheets (since 02.10.2026 the gate's reference, scripts/design/web-design-map.tsv): checked
# against their generator, then rendered beside the shots.
echo "== comic sheets"
python3 "$root/scripts/design/comic-sheets.py" --check || status=1
"$here/render-comic-sheets.sh" "$out/sheets-comic" >/dev/null || { echo "comic sheets not rendered" >&2; status=1; }

echo "== $(grep -c $'\tok' "$out/shots.tsv") opened, $(grep -vc $'\tok' "$out/shots.tsv") not"
exit "$status"
