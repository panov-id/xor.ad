#!/usr/bin/env bash
# J1: create privacy@ on both storefronts.
#
# Both privacy policies already publish these addresses and promise an answer
# within a month, so the mailbox has to exist. Aliases only — DNS, MX and Resend
# are already in place from setup-<brand>-email.sh, and nothing here touches them.
#
# The catch-all is deliberately NOT dropped: these domains already had it handled
# during the initial setup, and re-running that here would delete other aliases.
#
# Env (deploy/.env.deploy): IMPROVMX_SOSED_KEY, IMPROVMX_NEIGHBRO_KEY.
# Optional: PRIVACY_FORWARD (default ev.panov@gmail.com).
source "$(dirname "$0")/lib.sh"
load_env

FORWARD="${PRIVACY_FORWARD:-ev.panov@gmail.com}"
: "${IMPROVMX_SOSED_KEY:?Missing IMPROVMX_SOSED_KEY}"
: "${IMPROVMX_NEIGHBRO_KEY:?Missing IMPROVMX_NEIGHBRO_KEY}"

add_alias() {
  local domain="$1" key="$2"
  echo "== $domain: privacy@ -> $FORWARD =="
  docker run --rm -e IMPROVMX_API_KEY="$key" \
    -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
    sh -c "pip install --quiet requests && python3 improvmx-aliases.py $domain $FORWARD privacy"
  echo
}

add_alias "sosed.place" "$IMPROVMX_SOSED_KEY"
add_alias "neighbro.place" "$IMPROVMX_NEIGHBRO_KEY"
