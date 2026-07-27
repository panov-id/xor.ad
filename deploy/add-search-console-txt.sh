#!/usr/bin/env bash
# Add a Google Search Console verification TXT record to a domain's apex, keeping
# every existing record (namecheap-add.py does getHosts → merge → setHosts).
#
#   deploy/add-search-console-txt.sh neighbro.place google-site-verification=… [--apply]
#
# Dry-run by default: it prints the plan and writes nothing. Verification by DNS
# covers the whole domain including subdomains, and does not wait for a deploy —
# unlike the meta-tag route, which only appears once the landing ships.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.deploy"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

domain="${1:?usage: add-search-console-txt.sh <domain> <google-site-verification=...> [--apply]}"
token="${2:?}"
shift 2

case "$token" in
  google-site-verification=*) ;;
  *) echo "expected the whole string, starting with google-site-verification=" >&2; exit 1 ;;
esac

records="$(mktemp)"
trap 'rm -f "$records"' EXIT
# The apex, because a Domain property in Search Console verifies the zone itself.
printf '[{"name": "@", "type": "TXT", "value": "%s"}]\n' "$token" > "$records"

set -a; . "$ENV_FILE"; set +a

docker run --rm \
  -e NAMECHEAP_API_USER -e NAMECHEAP_API_KEY -e NAMECHEAP_USERNAME \
  -e NAMECHEAP_CLIENT_IP -e NAMECHEAP_SANDBOX \
  -v "$DEPLOY_DIR/namecheap-add.py:/app/namecheap-add.py:ro" \
  -v "$records:/app/records.json:ro" \
  -w /app python:3.12-alpine \
  sh -c "pip install -q requests && python3 namecheap-add.py $domain records.json $*"
