#!/usr/bin/env bash
# Send a test email from a brand domain via Resend to verify the outbound path.
# Usage: send-test-email.sh <domain> <to> [<from-local-part>]
#   e.g. send-test-email.sh sosed.place ev.panov@gmail.com hey
# Key = RESEND_<FIRST_LABEL>_KEY from deploy/.env.deploy.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN="${1:?Usage: send-test-email.sh <domain> <to> [<from-local-part>]}"
TO="${2:?Missing recipient}"
FROM_LOCAL="${3:-hey}"
BRAND=$(echo "${DOMAIN%%.*}" | tr '[:lower:]' '[:upper:]')
KEY_NAME="RESEND_${BRAND}_KEY"
KEY="${!KEY_NAME:?Missing $KEY_NAME in deploy/.env.deploy}"

curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{
    \"from\": \"$FROM_LOCAL@$DOMAIN\",
    \"to\": [\"$TO\"],
    \"subject\": \"Test: $FROM_LOCAL@$DOMAIN outbound check\",
    \"text\": \"Resend outbound test from $DOMAIN. Reply to this email to also verify the inbound (ImprovMX) path.\"
  }"
echo
