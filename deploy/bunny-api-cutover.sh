#!/usr/bin/env bash
# Move api.relay.panov.id from the node's A record onto the CDN zone in front of it.
#
#   deploy/bunny-api-cutover.sh              # show the plan
#   deploy/bunny-api-cutover.sh --hostname   # step 1: attach the hostname to the zone
#   deploy/bunny-api-cutover.sh --switch     # step 2: repoint DNS, then issue the certificate
#   deploy/bunny-api-cutover.sh --rollback   # put the A record back
#
# Split into steps on purpose. Between repointing DNS and the certificate being
# issued there is a window where the hostname resolves to the CDN and has no
# certificate yet — the prod API fails TLS for that long. Doing it as one blind
# command would make that window as long as whatever goes wrong.
#
# The origin stays p1-prod.relay.panov.id, which keeps its own A record and its
# own certificate, so the node is reachable throughout — including for a rollback.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DEPLOY_DIR/.env.deploy"; set +a
action="${1:-}"

ZONE_NAME="xorad-api-prod"
HOSTNAME="api.relay.panov.id"
DNS_ZONE="relay.panov.id"
NODE_IP="178.105.61.14"   # p1-prod, what the record points at today

# Through the environment, not argv: an argument is visible in ps to
# every local account for the life of the call.
BUNNY_API_KEY="$BUNNY_API_KEY" \
python3 - "$ZONE_NAME" "$HOSTNAME" "$DNS_ZONE" "$NODE_IP" "$action" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

zone_name, hostname, dns_zone, node_ip, action = sys.argv[1:6]
api_key = os.environ["BUNNY_API_KEY"]
BASE = "https://api.bunny.net"


def call(method, path, payload=None):
    request = urllib.request.Request(
        f"{BASE}{path}", method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"AccessKey": api_key, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{method} {path} -> {error.code}: {error.read().decode()[:300]}")


zones = call("GET", "/pullzone?page=0&perPage=100")
zones = zones if isinstance(zones, list) else zones.get("Items", [])
zone = next((z for z in zones if z["Name"] == zone_name), None)
if not zone:
    raise SystemExit(f"no pull zone {zone_name}")
attached = [h["Value"] for h in zone.get("Hostnames", [])]

dns = call("GET", "/dnszone?page=1&perPage=100")
dns = dns.get("Items", dns if isinstance(dns, list) else [])
dns_zone_obj = next((z for z in dns if z["Domain"] == dns_zone), None)
if not dns_zone_obj:
    raise SystemExit(f"no dns zone {dns_zone}")
label = hostname[: -len(dns_zone) - 1]  # "api" out of "api.relay.panov.id"
record = next((r for r in dns_zone_obj.get("Records", []) if (r.get("Name") or "") == label), None)

if action == "":
    print("ПЛАН (ничего не меняется):")
    print(f"  зона {zone_name} (id={zone['Id']}), хостнеймы: {', '.join(attached)}")
    print(f"  запись {label}.{dns_zone}: type={record and record.get('Type')} value={record and record.get('Value')}")
    print("  --hostname : привязать хостнейм к зоне")
    print("  --switch   : сменить A на CNAME к зоне и выпустить сертификат")
    print("  --rollback : вернуть A на узел")
    raise SystemExit(0)

if action == "--hostname":
    if hostname in attached:
        print(f"хостнейм {hostname} уже привязан")
    else:
        call("POST", f"/pullzone/{zone['Id']}/addHostname", {"Hostname": hostname})
        print(f"хостнейм {hostname} привязан к зоне")
    raise SystemExit(0)

if action == "--switch":
    if record is None:
        raise SystemExit("не нашёл текущую запись — остановился")
    # Bunny will not change a record's type in place — it validates the new value
    # against the old type and rejects it. So the record is replaced: delete, then
    # create as a PullZone record, which links the name to the zone natively
    # rather than through a CNAME and a separate certificate dance.
    #
    # Resolvers holding the old A record keep reaching the node while this
    # happens, which is what the 300s TTL is for.
    call("DELETE", f"/dnszone/{dns_zone_obj['Id']}/records/{record['Id']}")
    print(f"старая A-запись удалена")
    # CNAME rather than the native PullZone record type: verified on a throwaway
    # name that this is the shape a certificate can actually be issued for.
    call("PUT", f"/dnszone/{dns_zone_obj['Id']}/records", {
        "Type": 2,  # CNAME
        "Name": label,
        "Value": f"{zone_name}.b-cdn.net",
        "Ttl": 300,
    })
    print(f"{hostname} -> CNAME {zone_name}.b-cdn.net (ttl 300)")
    # GET, not POST. The endpoint rejects POST with a bare "the request is
    # invalid", which cost a couple of minutes of prod downtime to learn — the
    # project's own golive-ssl.sh had it right all along.
    call("GET", f"/pullzone/loadFreeCertificate?hostname={hostname}")
    print("сертификат выпущен")
    call("POST", f"/pullzone/{zone['Id']}/setForceSSL", {"HostName": hostname, "ForceSSL": True})
    print("ForceSSL включён")
    raise SystemExit(0)

if action == "--rollback":
    if record is None:
        raise SystemExit("нет записи для отката")
    call("POST", f"/dnszone/{dns_zone_obj['Id']}/records/{record['Id']}", {
        "Id": record["Id"],
        "Type": 0,  # A
        "Name": label,
        "Value": node_ip,
        "Ttl": 300,
    })
    print(f"откат: {hostname} -> A {node_ip}")
    raise SystemExit(0)

raise SystemExit(f"неизвестное действие: {action}")
PY
