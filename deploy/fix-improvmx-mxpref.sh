#!/usr/bin/env bash
# Fix MXPref of mx2.improvmx.com on a Namecheap domain (10 -> 20) via
# getHosts -> setHosts. Runs in a throwaway container; nothing on the host.
# Usage: fix-improvmx-mxpref.sh <domain>
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env

DOMAIN="${1:?Usage: fix-improvmx-mxpref.sh <domain>}"
SLD="${DOMAIN%%.*}"; TLD="${DOMAIN#*.}"
: "${NAMECHEAP_API_KEY:?Missing NAMECHEAP_API_KEY}"
IP="${NAMECHEAP_CLIENT_IP:-$(curl -s https://ipv4.icanhazip.com)}"

docker run --rm -i \
  -e NAMECHEAP_API_USER="$NAMECHEAP_API_USER" -e NAMECHEAP_API_KEY="$NAMECHEAP_API_KEY" \
  -e NAMECHEAP_USERNAME="${NAMECHEAP_USERNAME:-$NAMECHEAP_API_USER}" \
  -e NAMECHEAP_CLIENT_IP="$IP" -e SLD="$SLD" -e TLD="$TLD" python:3.12-alpine \
  sh -c "pip install --quiet requests && python3 -" <<'PY'
import os, requests, xml.etree.ElementTree as ET
U = "https://api.namecheap.com/xml.response"
base = {"ApiUser": os.environ["NAMECHEAP_API_USER"], "ApiKey": os.environ["NAMECHEAP_API_KEY"],
        "UserName": os.environ["NAMECHEAP_USERNAME"], "ClientIp": os.environ["NAMECHEAP_CLIENT_IP"]}
sld, tld = os.environ["SLD"], os.environ["TLD"]
def call(p):
    r = requests.get(U, params={**base, **p}, timeout=60); root = ET.fromstring(r.text)
    if root.attrib.get("Status") != "OK":
        raise SystemExit([e.text for e in root.iter() if e.tag.endswith("Error")])
    return root
root = call({"Command": "namecheap.domains.dns.getHosts", "SLD": sld, "TLD": tld})
hosts = [h.attrib for h in root.iter() if h.tag.endswith("host")]
p = {"Command": "namecheap.domains.dns.setHosts", "SLD": sld, "TLD": tld, "EmailType": "MX"}
changed = 0
for i, h in enumerate(hosts, 1):
    pref = h.get("MXPref", "10")
    if h["Type"] == "MX" and h["Address"].startswith("mx2.improvmx.com") and pref != "20":
        pref = "20"; changed += 1
    p[f"HostName{i}"], p[f"RecordType{i}"], p[f"Address{i}"] = h["Name"], h["Type"], h["Address"]
    p[f"MXPref{i}"], p[f"TTL{i}"] = pref, h.get("TTL", "1800")
if not changed:
    print(f"{sld}.{tld}: nothing to change"); raise SystemExit
call(p)
print(f"{sld}.{tld}: mx2.improvmx.com -> pref 20 ({len(hosts)} records)")
PY
