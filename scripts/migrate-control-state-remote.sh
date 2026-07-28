#!/usr/bin/env bash
# Copy the brands and keys an environment keeps in object storage into its
# database, on the box where that database lives — it has no door anywhere else.
#
#   scripts/migrate-control-state-remote.sh n1 dev            # plan
#   scripts/migrate-control-state-remote.sh n1 dev --apply
#   CONFIRM_PROD=yes scripts/migrate-control-state-remote.sh p1 prod --apply
#
# The objects in storage are left in place: the node reads the database first and
# falls back to them, so unsetting DATABASE_URL undoes the move.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
box="${1:?usage: migrate-control-state-remote.sh <box> <env> [--apply]}"
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

# The deploy user reaches docker through sudo, the same way the wizard does —
# membership in the docker group is not assumed, because granting it is
# equivalent to root and the wizard deliberately does not.
command="cd /opt/relay/compose && sudo -n docker compose run --rm --entrypoint deno \
  node-${environment} run --allow-env --allow-net --allow-read --allow-write \
  tools/migrate_control_state.ts $*"

echo "== ${box} (${host}) · ${environment}"
ssh -o StrictHostKeyChecking=accept-new "${user}@${host}" "bash -lc $(printf '%q' "$command")"
