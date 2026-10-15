#!/usr/bin/env bash
# Redesign package: every screen of both brands against the LIVE local stands (sosed :4173/:4174, neighbro
# :4183/:4184) with their seeded Limassol data, as PNG + full DOM (.html) + a box table (.json) per screen.
# Playwright runs from the panel-tests-runner image on the host network; nothing is installed on the host.
#
#   scripts/design/capture-redesign.sh
#   CAP_BRANDS=sosed CAP_WIDTHS=1440 CAP_LOCALES=en scripts/design/capture-redesign.sh   # a slice
#   CAP_DATE=2026-10-15 ...
#
# Out: testing/redesign/<date>/<brand>/<locale>/<width>/<screen>.{png,html,json} (dark: <screen>.dark.* at 1440),
# results.tsv (brand locale width screen status reason), index_RU.md and index_EN.md.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/scripts/design"
date_="${CAP_DATE:-$(date +%F)}"
out="$root/testing/redesign/$date_"
mkdir -p "$out"
[ -n "${CAP_APPEND:-}" ] || rm -f "$out/results.tsv" "$out/overflow.tsv"   # CAP_APPEND=1 adds rows to a package

# Mail of the local stand and its database (the node of both brands is sosed's).
mailpit_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' xor-local-sosed-mailpit-1)"
psql=(docker exec -i xor-local-sosed-postgres-1 psql -U relay -d relay_test -v ON_ERROR_STOP=1 -qAt)
offer_code="$(echo "SELECT redirect_code FROM offers WHERE redirect_disabled_at IS NULL AND expires_at > now() ORDER BY published_at DESC LIMIT 1;" | "${psql[@]}")"
echo "mailpit $mailpit_ip, offer code ${offer_code:-none}"

pids=()
helpers=()
for brand in ${CAP_BRANDS:-sosed neighbro}; do
  ctl="$out/.ctl-$brand"; mkdir -p "$ctl"; rm -f "$ctl"/*
  (
    # Answers what only the database can give, once per request (as shoot-web.sh does).
    for _ in $(seq 1 20000); do
      if [ -s "$ctl/statement.want" ] && [ ! -e "$ctl/statement.done" ]; then
        who="$(tr -cd '0-9a-zA-Z_-' < "$ctl/statement.want")"
        echo "INSERT INTO dsa_statements (brand, target_id, recipient_identity, restriction, facts, ground_kind, ground_text)
              VALUES (:'brand', 'redesign', :'who', 'hidden', 'phrase hidden after a neighbour complaint', 'contractual', 'community rules, item 3');" \
          | "${psql[@]}" -v who="$who" -v brand="$brand" && touch "$ctl/statement.done"
      fi
      if [ -s "$ctl/envelope.want" ] && [ ! -e "$ctl/envelope.code" ]; then
        code="$(echo "SELECT e.code FROM venue_envelopes e JOIN venues v ON v.id = e.venue_id
                       WHERE v.name = :'name' AND e.used_at IS NULL AND e.burned_at IS NULL LIMIT 1;" \
          | "${psql[@]}" -v name="$(cat "$ctl/envelope.want")")"
        [ -n "$code" ] && printf '%s' "$code" > "$ctl/envelope.code"
      fi
      sleep 0.5
    done
  ) &
  helpers+=($!)
  docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$here/capture-redesign.mjs":/tests/capture-redesign.mjs:ro -v "$out":/out -w /tests \
    -e BRAND="$brand" -e OUT=/out -e CTRL="/out/.ctl-$brand" -e MAILPIT_URL="http://$mailpit_ip:8025" -e OFFER_CODE="$offer_code" \
    -e CAP_ONLY="${CAP_ONLY:-}" -e CAP_STEPS="${CAP_STEPS:-}" \
    -e SHOOT_WIDTHS="${CAP_WIDTHS:-375,768,1024,1440,1920}" -e SHOOT_LOCALES="${CAP_LOCALES:-en,ru}" \
    --entrypoint node panel-tests-runner:latest capture-redesign.mjs > "$out/log-$brand${CAP_TAG:+-$CAP_TAG}.txt" 2>&1 &
  pids+=($!)
done
status=0
for p in "${pids[@]}"; do wait "$p" || status=1; done
kill "${helpers[@]}" 2>/dev/null || true
rm -rf "$out"/.ctl-*
python3 "$here/capture-redesign-index.py" "$out" || status=1
exit "$status"
