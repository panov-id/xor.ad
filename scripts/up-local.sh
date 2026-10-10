#!/usr/bin/env bash
# The product on this machine, for a person to walk by hand: the web stand of
# docker-compose.web.yml (Postgres, migrations, seed, node, moderator stub,
# Mailpit, the page) under a project of its own, so it never shares a database
# with an e2e run. Ports are published here, not in the e2e file, which keeps
# them closed for parallel worktrees.
#
#   scripts/up-local.sh [sosed|neighbro]   # up; prints where to look
#   scripts/up-local.sh down [brand]       # stop and drop the volumes
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

cmd=up
if [[ "${1:-}" == down ]]; then cmd=down; shift; fi
brand="${1:-sosed}"
case "$brand" in sosed) web=4173 mail=62125 ;; neighbro) web=4183 mail=62135 ;;
  *) echo "brand: sosed or neighbro, not '$brand'" >&2; exit 2 ;; esac

override="$(mktemp)"
trap 'rm -f "$override"' EXIT
cat >"$override" <<YAML
services:
  mailpit: { ports: ["127.0.0.1:${mail}:8025"] }
  web: { ports: !override ["127.0.0.1:${web}:4173"] }
YAML

dc() { VITE_BRAND="$brand" docker compose -p "xor-local-$brand" \
  -f "$root/docker-compose.web.yml" -f "$override" "$@"; }

if [[ $cmd == down ]]; then dc down -v; exit 0; fi

dc up -d --build --wait web mailpit
echo "page:    http://localhost:${web}/   (brand $brand)"
echo "mailpit: http://localhost:${mail}/  (sign-in letters land here)"
echo "stop:    scripts/up-local.sh down $brand"
