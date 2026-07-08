#!/usr/bin/env bash
# Make panov.id send the panel's auth email via Resend while keeping its six
# forwards — same ImprovMX (MX-based forwarding) + Resend return-path MX approach
# as neighbro.place (see setup-neighbro-email.sh), plus a final step that points
# Supabase Auth's Custom SMTP at Resend.
#
# panov.id apex already holds a CNAME (-> Bunny), so the apex SPF is intentionally
# skipped (Resend aligns via DKIM on the send subdomain; apex SPF isn't required).
#
# Env (deploy/.env.deploy): IMPROVMX_PANOV_KEY, NAMECHEAP_API_USER/API_KEY/USERNAME/
# CLIENT_IP, RESEND_PANOV_KEY, SUPABASE_ACCESS_TOKEN,
# SUPABASE_PROJECT_REF. Optional: PANEL_SMTP_FROM, PANEL_SMTP_SENDER_NAME.
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN=panov.id
FROM="${PANEL_SMTP_FROM:-no-reply@panov.id}"
SENDER_NAME="${PANEL_SMTP_SENDER_NAME:-Xor}"
# ImprovMX free = 1 domain/account → panov.id lives in its own account.
IMPROVMX_KEY="${IMPROVMX_PANOV_KEY:?Missing IMPROVMX_PANOV_KEY (account 2, panov.id)}"
: "${NAMECHEAP_API_KEY:?Missing NAMECHEAP_API_KEY}"
: "${RESEND_PANOV_KEY:?Missing RESEND_PANOV_KEY}"
: "${SUPABASE_ACCESS_TOKEN:?Missing SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?Missing SUPABASE_PROJECT_REF}"

IP="${NAMECHEAP_CLIENT_IP:-$(curl -s https://ipv4.icanhazip.com)}"

echo "== 1/4 ImprovMX: domain + the six panov.id forwards =="
docker run --rm -e IMPROVMX_API_KEY="$IMPROVMX_KEY" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 improvmx-aliases.py $DOMAIN \
    dev=eugene.panov.id@gmail.com eugene=eugene.panov.id@gmail.com \
    eva=ev.panov@gmail.com yana=ev.panov@gmail.com \
    nikolai=nikoserom@gmail.com nikolai-bus=nikoserom@gmail.com --drop-catchall"

echo "== 2/4 Namecheap: EmailType=MX with ImprovMX + Resend records =="
docker run --rm \
  -e NAMECHEAP_API_USER="$NAMECHEAP_API_USER" -e NAMECHEAP_API_KEY="$NAMECHEAP_API_KEY" \
  -e NAMECHEAP_USERNAME="${NAMECHEAP_USERNAME:-$NAMECHEAP_API_USER}" \
  -e NAMECHEAP_CLIENT_IP="$IP" -e NAMECHEAP_SANDBOX="${NAMECHEAP_SANDBOX:-false}" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 namecheap-add.py $DOMAIN panov-id-email-records.json --apply --email-type=MX"

echo "== 3/4 Resend: verify panov.id (account 1) =="
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

echo "== 4/4 Supabase Auth: Custom SMTP -> Resend =="
# Shared project → one SMTP config for all envs. Resend SMTP: smtp.resend.com:465,
# user 'resend', password = a Resend API key.
curl -s -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"smtp_admin_email\":\"$FROM\",\"smtp_host\":\"smtp.resend.com\",\"smtp_port\":\"465\",\"smtp_user\":\"resend\",\"smtp_pass\":\"$RESEND_PANOV_KEY\",\"smtp_sender_name\":\"$SENDER_NAME\"}" \
  | python3 -c "import sys,json
d=json.load(sys.stdin)
print('smtp_host:', d.get('smtp_host'), '| sender:', d.get('smtp_sender_name'), '| admin:', d.get('smtp_admin_email'))"

echo "Done. If Resend records are 'pending', DNS is propagating — re-run step 3 shortly."
