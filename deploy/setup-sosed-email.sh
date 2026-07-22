#!/usr/bin/env bash
# Make sosed.place send branded email via Resend (hey@) with hey@/support@
# forwarding via ImprovMX (MX-based) — same scheme as setup-neighbro-email.sh.
#
# Steps: (1) Resend: create the domain (idempotent) and capture its DNS payload
# (DKIM + send.<domain> return-path records), (2) ImprovMX domain + aliases,
# (3) Namecheap: EmailType=MX with ImprovMX + Resend records, (4) trigger
# Resend domain verification. Runs in throwaway containers; nothing on the host.
#
# Env (deploy/.env.deploy): IMPROVMX_SOSED_KEY, NAMECHEAP_API_USER/API_KEY/
# USERNAME/CLIENT_IP, RESEND_SOSED_KEY. Optional: SOSED_EMAIL_DOMAIN,
# SOSED_EMAIL_FORWARD.
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN="${SOSED_EMAIL_DOMAIN:-sosed.place}"
FORWARD="${SOSED_EMAIL_FORWARD:-ev.panov+sosed@gmail.com}"
: "${IMPROVMX_SOSED_KEY:?Missing IMPROVMX_SOSED_KEY}"
: "${NAMECHEAP_API_KEY:?Missing NAMECHEAP_API_KEY}"
: "${RESEND_SOSED_KEY:?Missing RESEND_SOSED_KEY}"

IP="${NAMECHEAP_CLIENT_IP:-$(curl -s https://ipv4.icanhazip.com)}"
RESEND_PAYLOAD="$DEPLOY_DIR/.sosed-resend-domain.json"   # gitignored dot-file

echo "== 1/4 Resend: create domain (idempotent) + capture DNS records =="
DID=$(curl -s -H "Authorization: Bearer $RESEND_SOSED_KEY" https://api.resend.com/domains \
  | python3 -c "import sys,json;print(next((d['id'] for d in json.load(sys.stdin).get('data',[]) if d['name']=='$DOMAIN'),''))")
if [ -z "$DID" ]; then
  DID=$(curl -s -X POST -H "Authorization: Bearer $RESEND_SOSED_KEY" -H "Content-Type: application/json" \
    -d "{\"name\":\"$DOMAIN\"}" https://api.resend.com/domains \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id') or sys.exit('Resend create failed: %s'%d))")
  echo "  created domain $DOMAIN ($DID)"
else
  echo "  domain exists ($DID)"
fi
curl -s -H "Authorization: Bearer $RESEND_SOSED_KEY" "https://api.resend.com/domains/$DID" > "$RESEND_PAYLOAD"
python3 -c "import json;d=json.load(open('$RESEND_PAYLOAD'));[print('  record:',r['type'],r['name'],'->',r['value'][:50]) for r in d['records']]"

echo "== 2/4 ImprovMX: domain + hey@/support@ aliases =="
docker run --rm -e IMPROVMX_API_KEY="$IMPROVMX_SOSED_KEY" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 improvmx-aliases.py $DOMAIN $FORWARD hey support --drop-catchall"

echo "== 3/4 Namecheap: EmailType=MX with ImprovMX + Resend records =="
for RECORDS in sosed-email-records.json .sosed-resend-domain.json; do
  docker run --rm \
    -e NAMECHEAP_API_USER="$NAMECHEAP_API_USER" -e NAMECHEAP_API_KEY="$NAMECHEAP_API_KEY" \
    -e NAMECHEAP_USERNAME="${NAMECHEAP_USERNAME:-$NAMECHEAP_API_USER}" \
    -e NAMECHEAP_CLIENT_IP="$IP" -e NAMECHEAP_SANDBOX="${NAMECHEAP_SANDBOX:-false}" \
    -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
    sh -c "pip install --quiet requests && python3 namecheap-add.py $DOMAIN $RECORDS --apply --email-type=MX"
done

echo "== 4/4 Resend: verify domain =="
curl -s -X POST -H "Authorization: Bearer $RESEND_SOSED_KEY" "https://api.resend.com/domains/$DID/verify" >/dev/null
sleep 15
curl -s -H "Authorization: Bearer $RESEND_SOSED_KEY" "https://api.resend.com/domains/$DID" \
  | python3 -c "import sys,json
d=json.load(sys.stdin)
print('status:', d['status'])
for r in d['records']:
    print(' ', r['type'], r['name'], '->', r['status'])"

echo "Done. If records are still 'pending', DNS is propagating — re-run the verify step in a few minutes."
