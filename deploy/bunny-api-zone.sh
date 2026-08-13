#!/usr/bin/env bash
# Create (idempotently) the pull zone that will sit in front of the prod REST API,
# with caching off, and verify it proxies before anything is repointed at it.
#
#   deploy/bunny-api-zone.sh            # show the plan
#   deploy/bunny-api-zone.sh --apply
#
# Why: /waitlist has no rate limit anywhere, and an external captcha would mean a
# new processor of visitors' IPs. Bunny is already our processor, and Shield Basic
# is free — but only if the traffic actually passes through it. See
# relay/ARCHITECTURE_RU.md, "Решение: REST через Bunny".
#
# This script does NOT touch DNS. Repointing api.relay.panov.id is a separate,
# deliberate step, and it must come after the origin is locked (X-Origin-Token in
# Caddy + firewall allowlist), or the CDN is bypassed in one line.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DEPLOY_DIR/.env.deploy"; set +a
apply="${1:-}"

ZONE_NAME="xorad-api-prod"   # *.b-cdn.net names are globally unique
ORIGIN="https://p1-prod.relay.panov.id"

# Through the environment, not argv: an argument is visible in ps to
# every local account for the life of the call.
BUNNY_API_KEY="$BUNNY_API_KEY" \
python3 - "$ZONE_NAME" "$ORIGIN" "$apply" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

zone_name, origin, apply = sys.argv[1:4]
api_key = os.environ["BUNNY_API_KEY"]
BASE = "https://api.bunny.net"


def call(method, path, payload=None):
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "AccessKey": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode()[:300]
        raise SystemExit(f"{method} {path} -> {error.code}: {detail}")


zones = call("GET", "/pullzone?page=0&perPage=100")
zones = zones if isinstance(zones, list) else zones.get("Items", [])
existing = next((z for z in zones if z["Name"] == zone_name), None)

if apply != "--apply":
    print("ПЛАН (ничего не меняется):")
    if existing:
        print(f"  зона {zone_name} уже есть (id={existing['Id']}), origin={existing.get('OriginUrl')}")
        print("  привести настройки к: кэш выключен, host-заголовок origin, WS выкл")
    else:
        print(f"  создать pull-зону {zone_name} с origin {origin}")
        print("  выставить: кэш выключен, host-заголовок origin, WS выкл")
    print("  DNS НЕ трогается: api.relay.panov.id остаётся A-записью на ноду")
    raise SystemExit(0)

if existing:
    zone_id = existing["Id"]
    print(f"зона {zone_name} уже есть (id={zone_id})")
else:
    created = call("POST", "/pullzone", {"Name": zone_name, "OriginUrl": origin, "Type": 0})
    zone_id = created["Id"]
    print(f"создана зона {zone_name} (id={zone_id})")

# Caching off: this is an API, every response is per-request.
# AddHostHeader=False makes Bunny send the origin's own hostname, so Caddy serves
# the certificate it already has for p1-prod.relay.panov.id.
call("POST", f"/pullzone/{zone_id}", {
    "OriginUrl": origin,
    "CacheControlMaxAgeOverride": 0,
    "CacheControlBrowserMaxAgeOverride": 0,
    "AddHostHeader": False,
    "EnableWebSocketProxy": False,
    "EnableQueryStringOrdering": False,
    "DisableCookies": False,
})
print("настройки применены: кэш выключен, host-заголовок origin, WS выкл, cookies проходят")

zone = call("GET", f"/pullzone/{zone_id}")
print(f"\nпроверочный хостнейм: https://{zone_name}.b-cdn.net")
print(f"  origin            = {zone.get('OriginUrl')}")
print(f"  cache override    = {zone.get('CacheControlMaxAgeOverride')}")
print(f"  add host header   = {zone.get('AddHostHeader')}")
print(f"  websocket proxy   = {zone.get('EnableWebSocketProxy')}")
PY
