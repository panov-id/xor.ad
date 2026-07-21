#!/usr/bin/env bash
# After sosed go-live DNS resolves to Bunny, provision Let's Encrypt certs and
# force SSL for sosed.place + www.sosed.place (Bunny pull zone sosed-prod = 6123213).
set -uo pipefail
cd /home/eugene-panov/Projects/panov-id/xor.ad
set -a; . deploy/.env.deploy; set +a
BK="$BUNNY_API_KEY"
ZONE=6123213
HOSTS=("sosed.place" "www.sosed.place")

resolves(){ curl -s "https://dns.google/resolve?name=$1&type=A" | python3 -c "import sys,json;print('Y' if json.load(sys.stdin).get('Answer') else 'N')"; }

echo "== wait for DNS -> Bunny =="
for i in $(seq 1 40); do
  allok=1
  for h in "${HOSTS[@]}"; do [ "$(resolves "$h")" = Y ] || allok=0; done
  [ "$allok" = 1 ] && { echo "all resolve ($((i*15))s)"; break; }
  sleep 15
done
for h in "${HOSTS[@]}"; do echo "  $h resolves: $(resolves "$h")"; done

echo "== provision Let's Encrypt certs =="
for h in "${HOSTS[@]}"; do
  code=$(curl -s -o /tmp/le.txt -w "%{http_code}" "https://api.bunny.net/pullzone/loadFreeCertificate?hostname=$h" -H "AccessKey: $BK")
  echo "  cert $h: HTTP $code $( [ "$code" = 200 ] || head -c 160 /tmp/le.txt )"
  sleep 3
done

echo "== force SSL =="
for h in "${HOSTS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.bunny.net/pullzone/${ZONE}/setForceSSL" -H "AccessKey: $BK" -H "Content-Type: application/json" -d "{\"Hostname\":\"$h\",\"ForceSSL\":true}")
  echo "  forceSSL $h: HTTP $code"
done

echo "== verify HTTPS =="
for h in "${HOSTS[@]}"; do
  echo "  https://$h -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$h/" || echo FAIL)"
done
