#!/usr/bin/env bash
# Fold an environment's existing page-view objects into the daily aggregate, on
# the box where that database lives — it has no door anywhere else.
#
#   scripts/backfill-pageviews-remote.sh n1 dev            # plan
#   scripts/backfill-pageviews-remote.sh n1 dev --apply
#   CONFIRM_PROD=yes scripts/backfill-pageviews-remote.sh p1 prod --apply
#
# Run once per environment, before the prune job first removes objects older than
# the retention window. The count lives in the database now; the objects it was
# counted from do not, and until this has run the panel reports more stored than
# counted.
#
# Safe to repeat: the tool rebuilds whole days rather than adding to them, so a
# second run lands on the same numbers.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
box="${1:?usage: backfill-pageviews-remote.sh <box> <env> [--apply] [--brand=<key>]}"
environment="${2:?}"
shift 2

if [ "$environment" = "prod" ] && [ "${CONFIRM_PROD:-}" != "yes" ]; then
  echo "refusing to touch prod without CONFIRM_PROD=yes" >&2
  exit 1
fi

# Where the box is, according to the same inventory the wizard deploys from —
# one source of truth for "which machine is n1" rather than two.
read -r host user < <(python3 - "$root/relay/wizard/inventory.toml" "$box" "$environment" <<'PY'
import sys
import tomllib

path, box_id, environment = sys.argv[1:4]
inventory = tomllib.load(open(path, "rb"))
box = next((b for b in inventory.get("box", []) if b["id"] == box_id), None)
if box is None:
    raise SystemExit(f"no box '{box_id}' in the inventory")
if environment not in box["envs"]:
    raise SystemExit(f"box '{box_id}' does not run '{environment}' (it runs {', '.join(box['envs'])})")
if not box.get("ssh_host"):
    raise SystemExit(f"box '{box_id}' has no ssh_host — it is planned, not deployed")
print(box["ssh_host"], box.get("ssh_user", "deploy"))
PY
)

# The deploy user reaches docker through sudo, the same way the wizard does.
command="cd /opt/relay/compose && sudo -n docker compose run --rm --entrypoint deno \
  node-${environment} run --allow-env --allow-net --allow-read --allow-write \
  tools/backfill_pageview_daily.ts $*"

echo "== ${box} (${host}) · ${environment}"
ssh -o StrictHostKeyChecking=accept-new "${user}@${host}" "bash -lc $(printf '%q' "$command")"
