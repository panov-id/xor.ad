#!/usr/bin/env bash
# Make panov.id send the panel's auth email via Resend while keeping its six
# forwards — same ImprovMX (MX-based forwarding) + Resend return-path MX approach
# as neighbro.place (see setup-neighbro-email.sh).
#
# It used to end by pointing Supabase Auth's Custom SMTP at Resend. The panel's
# magic links are sent by the relay now (relay/node/src/lib/mailer.ts), which
# takes its SMTP settings from the node's own environment — so that step is gone
# and there is no Supabase project to configure.
#
# panov.id apex already holds a CNAME (-> Bunny), so the apex SPF is intentionally
# skipped (Resend aligns via DKIM on the send subdomain; apex SPF isn't required).
#
# Env (deploy/.env.deploy): IMPROVMX_PANOV_KEY, NAMECHEAP_API_USER/API_KEY/USERNAME/
# CLIENT_IP, RESEND_PANOV_KEY. Optional: PANEL_SMTP_FROM, PANEL_SMTP_SENDER_NAME.
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN=panov.id
FROM="${PANEL_SMTP_FROM:-no-reply@panov.id}"
SENDER_NAME="${PANEL_SMTP_SENDER_NAME:-Xor}"
# ImprovMX free = 1 domain/account → panov.id lives in its own account.
IMPROVMX_KEY="${IMPROVMX_PANOV_KEY:?Missing IMPROVMX_PANOV_KEY (account 2, panov.id)}"
: "${NAMECHEAP_API_KEY:?Missing NAMECHEAP_API_KEY}"
: "${RESEND_PANOV_KEY:?Missing RESEND_PANOV_KEY}"

IP="${NAMECHEAP_CLIENT_IP:-$(curl -s https://ipv4.icanhazip.com)}"

echo "== 1/3 ImprovMX: domain + the six panov.id forwards =="
docker run --rm -e IMPROVMX_API_KEY="$IMPROVMX_KEY" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 improvmx-aliases.py $DOMAIN \
    dev=eugene.panov.id@gmail.com eugene=eugene.panov.id@gmail.com \
    eva=ev.panov@gmail.com yana=ev.panov@gmail.com \
    nikolai=nikoserom@gmail.com nikolai-bus=nikoserom@gmail.com --drop-catchall"

echo "== 2/3 Namecheap: EmailType=MX with ImprovMX + Resend records =="
docker run --rm \
  -e NAMECHEAP_API_USER="$NAMECHEAP_API_USER" -e NAMECHEAP_API_KEY="$NAMECHEAP_API_KEY" \
  -e NAMECHEAP_USERNAME="${NAMECHEAP_USERNAME:-$NAMECHEAP_API_USER}" \
  -e NAMECHEAP_CLIENT_IP="$IP" -e NAMECHEAP_SANDBOX="${NAMECHEAP_SANDBOX:-false}" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 namecheap-add.py $DOMAIN panov-id-email-records.json --apply --email-type=MX"

echo "== 3/3 Resend: verify panov.id (account 1) =="
DID="${RESEND_PANOV_DOMAIN_ID:-}"
if [ -z "$DID" ]; then
  DID=$(curl -s -H "Authorization: Bearer $RESEND_PANOV_KEY" https://api.resend.com/domains \
    | python3 -c "import sys,json;print(next(d['id'] for d in json.load(sys.stdin).get('data',[]) if d['name']=='$DOMAIN'))")
fi
curl -s -X POST -H "Authorization: Bearer $RESEND_PANOV_KEY" "https://api.resend.com/domains/$DID/verify" >/dev/null
sleep 15
curl -s -H "Authorization: Bearer $RESEND_PANOV_KEY" "https://api.resend.com/domains/$DID" \
  | python3 -c "import sys,json
d=json.load(sys.stdin)
print('resend status:', d['status'])
for r in d['records']:
    print(' ', r['type'], r['name'], '->', r['status'])"

echo
echo "Sending side is set up. Point the relay node at it with MAIL_SMTP_HOST=smtp.resend.com,"
echo "MAIL_SMTP_PORT=465, user 'resend', password = a Resend API key, sender ${SENDER_NAME} <${FROM}>."
echo "Done. If Resend records are 'pending', DNS is propagating — re-run step 3 shortly."
