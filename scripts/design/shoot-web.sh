#!/usr/bin/env bash
# Shoot every screen of the web face at 375x812 for each brand, in the brand's
# light theme and its night pair, next to the brands' sheets (WD0; since
# 02.10.2026 the sheets are panel/design/sheets-<brand>/<theme>, generated from
# web/themes by brand-sheets.sh). Per brand a throwaway stand from
# docker-compose.web.yml built with VITE_BRAND (node and built page, project
# name with this PID and the brand), two people walked through the screens by
# shoot-web.mjs with Playwright from the panel-tests-runner image. Nothing on
# the host.
#
#   scripts/design/shoot-web.sh                       # both brands: up, shoot, down; then the sheets
#   SHOOT_BRANDS=sosed scripts/design/shoot-web.sh    # one brand
#   scripts/design/shoot-web.sh --sheets              # only the sheets
#   SHOTS_OUT=testing/screenshots/web-before scripts/design/shoot-web.sh
#
# Out: testing/screenshots/web/<brand>-<screen>-<theme>.png, a list of what
# opened and what did not in shots.tsv beside them (<brand>-<screen>), the
# sheets rendered in sheets-<brand>/<theme>/ beside them.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/scripts/design"
out="$root/${SHOTS_OUT:-testing/screenshots/web}"
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
mkdir -p "$out"
status=0

shoot_brand() {  # $1: brand
  local brand="$1" project="shoot-web-$$-$1"
  local compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
  export VITE_BRAND="$brand"
  cleanup() {
    if [ -n "${SHOTS_KEEP:-}" ]; then echo "stand kept: ${compose[*]} down -v --rmi local"; return; fi
    "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM
  rm -f "$out/shots.tsv"

  echo "== $brand stand: postgres, migrations, seed, node, web ($project)"
  "${compose[@]}" up -d --build --wait web web-adv || { "${compose[@]}" logs --no-color --tail 40 node web web-adv >&2; cleanup; trap - EXIT INT TERM; return 1; }
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
              VALUES (:'brand', 'shoot-web', :'who', 'hidden', 'фраза скрыта по жалобе соседа', 'contractual', 'правила сообщества, п. 3');" \
          | "${psql[@]}" -v who="$who" -v brand="$brand" && touch "$out/statement.done"
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

  echo "== $brand shoot"
  timeout 900 docker run --rm --network "container:$web" \
    -v "$here/shoot-web.mjs":/tests/shoot-web.mjs:ro -v "$out":/out -w /tests \
    -e WEB_URL=http://localhost:4173 -e WEB_BREAK="${WEB_BREAK:-}" -e BRAND="$brand" \
    --entrypoint node panel-tests-runner:latest shoot-web.mjs
  local code=$?
  kill "$statements" 2>/dev/null || true
  [ -f "$out/shots.tsv" ] && sed "s/^/$brand-/" "$out/shots.tsv" > "$out/shots-$brand.tsv"
  cleanup; trap - EXIT INT TERM
  return "$code"
}

if [ "${1:-}" != "--sheets" ]; then
  for brand in ${SHOOT_BRANDS:-sosed neighbro}; do
    rm -f "$out/shots-$brand.tsv"
    shoot_brand "$brand" || status=1
  done
  rm -f "$out/shots.tsv"  # the shoot container wrote it as root
  cat "$out"/shots-*.tsv > "$out/shots.tsv"
fi

# The brands' sheets (since 02.10.2026 the gate's reference, scripts/design/web-design-map.tsv):
# checked against what the theme JSON gives, then rendered beside the shots.
echo "== brand sheets"
"$here/brand-sheets.sh" --check | tail -1 || status=1
"$here/brand-sheets.sh" --render "$out" || { echo "brand sheets not rendered" >&2; status=1; }

echo "== $(grep -c $'\tok' "$out/shots.tsv") opened, $(grep -vc $'\tok' "$out/shots.tsv") not"
exit "$status"
