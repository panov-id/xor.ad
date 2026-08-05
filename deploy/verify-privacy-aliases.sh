#!/usr/bin/env bash
# J3: prove the privacy@ aliases actually deliver.
#
# Sends from panov.id (a third domain, so no same-domain forwarding loop) to
# each storefront's privacy@ address, then polls Resend for the delivery status.
# Resend can only confirm it handed the mail to the receiving MX (ImprovMX);
# the final hop into the personal inbox has to be eyeballed there.
#
# Env (deploy/.env.deploy): RESEND_PANOV_KEY.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env

: "${RESEND_PANOV_KEY:?Missing RESEND_PANOV_KEY}"
STAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"

send_to() {
  local recipient="$1"
  local response id
  response=$(curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_PANOV_KEY" -H "Content-Type: application/json" \
    -d "{
      \"from\": \"no-reply@panov.id\",
      \"to\": [\"$recipient\"],
      \"subject\": \"Inbound check: $recipient\",
      \"text\": \"Forwarding test for $recipient, sent $STAMP. If this reached the personal inbox, the alias works.\"
    }")
  id=$(python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" <<<"$response")
  if [ -z "$id" ]; then
    echo "  $recipient -> ОТКАЗ: $response"
    return
  fi
  echo "  $recipient -> принято, id=$id"
  echo "$id $recipient" >> /tmp/privacy-alias-ids.txt
}

: > /tmp/privacy-alias-ids.txt
echo "== отправка =="
send_to "privacy@sosed.place"
send_to "privacy@neighbro.place"

echo
echo "== статус доставки (через 20 секунд) =="
sleep 20
while read -r id recipient; do
  status=$(curl -s -H "Authorization: Bearer $RESEND_PANOV_KEY" "https://api.resend.com/emails/$id" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('last_event') or d.get('status') or d)")
  printf '  %-28s %s\n' "$recipient" "$status"
done < /tmp/privacy-alias-ids.txt
