#!/usr/bin/env bash
# Show ImprovMX delivery logs for a domain (inbound forwarding trace).
# Usage: improvmx-logs.sh <domain>   (key = IMPROVMX_<FIRST_LABEL>_KEY from .env.deploy)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN="${1:?Usage: improvmx-logs.sh <domain>}"
BRAND=$(echo "${DOMAIN%%.*}" | tr '[:lower:]' '[:upper:]')
KEY_NAME="IMPROVMX_${BRAND}_KEY"
KEY="${!KEY_NAME:?Missing $KEY_NAME in deploy/.env.deploy}"

curl -s -u "api:$KEY" "https://api.improvmx.com/v3/domains/$DOMAIN/logs" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('success'):
    print('API error:', d); sys.exit(1)
logs = d.get('logs', [])
if not logs:
    print('No logs yet.')
for l in logs:
    print(f\"{l.get('created','?')}  {l.get('sender',{}).get('email','?')} -> {l.get('recipient',{}).get('email','?')}\")
    print(f\"  subject: {l.get('subject','?')}\")
    for e in l.get('events', []):
        print(f\"  [{e.get('status','?')}] -> {e.get('recipient','?')}: {str(e.get('message',''))[:100]}\")
"
