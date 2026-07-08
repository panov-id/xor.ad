#!/usr/bin/env bash
# Make neighbro.place send branded email via Resend while keeping the
# hello@/support@ forwarding — by moving forwarding to ImprovMX (MX-based) so a
# custom Resend return-path MX (send.neighbro.place) can coexist. Namecheap's own
# EmailType=FWD forwarding is domain-wide and strips any explicit MX, which is why
# the forwarder has to move.
#
# Steps: (1) ImprovMX domain + point aliases, (2) flip Namecheap to EmailType=MX
# with the ImprovMX + Resend records, (3) trigger Resend domain verification.
# Everything runs in throwaway containers; nothing is installed on the host.
#
# Env (deploy/.env.deploy): IMPROVMX_NEIGHBRO_KEY, NAMECHEAP_API_USER/API_KEY/USERNAME/
# CLIENT_IP, RESEND_NEIGHBRO_KEY. Optional: NEIGHBRO_EMAIL_DOMAIN,
# NEIGHBRO_EMAIL_FORWARD.
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN="${NEIGHBRO_EMAIL_DOMAIN:-neighbro.place}"
FORWARD="${NEIGHBRO_EMAIL_FORWARD:-ev.panov+neighbro@gmail.com}"
: "${IMPROVMX_NEIGHBRO_KEY:?Missing IMPROVMX_NEIGHBRO_KEY}"
: "${NAMECHEAP_API_KEY:?Missing NAMECHEAP_API_KEY}"
: "${RESEND_NEIGHBRO_KEY:?Missing RESEND_NEIGHBRO_KEY}"

IP="${NAMECHEAP_CLIENT_IP:-$(curl -s https://ipv4.icanhazip.com)}"

echo "== 1/3 ImprovMX: domain + hello@/support@ aliases =="
docker run --rm -e IMPROVMX_API_KEY="$IMPROVMX_NEIGHBRO_KEY" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 improvmx-aliases.py $DOMAIN $FORWARD hello support --drop-catchall"

echo "== 2/3 Namecheap: EmailType=MX with ImprovMX + Resend records =="
docker run --rm \
  -e NAMECHEAP_API_USER="$NAMECHEAP_API_USER" -e NAMECHEAP_API_KEY="$NAMECHEAP_API_KEY" \
  -e NAMECHEAP_USERNAME="${NAMECHEAP_USERNAME:-$NAMECHEAP_API_USER}" \
  -e NAMECHEAP_CLIENT_IP="$IP" -e NAMECHEAP_SANDBOX="${NAMECHEAP_SANDBOX:-false}" \
  -v "$DEPLOY_DIR:/deploy:ro" -w /deploy python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 namecheap-add.py $DOMAIN neighbro-email-records.json --apply --email-type=MX"

echo "== 3/3 Resend: verify domain =="
DID="${RESEND_NEIGHBRO_DOMAIN_ID:-}"
if [ -z "$DID" ]; then
  DID=$(curl -s -H "Authorization: Bearer $RESEND_NEIGHBRO_KEY" https://api.resend.com/domains \
    | python3 -c "import sys,json;print(next(d['id'] for d in json.load(sys.stdin).get('data',[]) if d['name']=='$DOMAIN'))")
fi
curl -s -X POST -H "Authorization: Bearer $RESEND_NEIGHBRO_KEY" "https://api.resend.com/domains/$DID/verify" >/dev/null
sleep 15
curl -s -H "Authorization: Bearer $RESEND_NEIGHBRO_KEY" "https://api.resend.com/domains/$DID" \
  | python3 -c "import sys,json
d=json.load(sys.stdin)
print('status:', d['status'])
for r in d['records']:
    print(' ', r['type'], r['name'], '->', r['status'])"

echo "Done. If records are still 'pending', DNS is propagating — re-run the verify step in a few minutes."
