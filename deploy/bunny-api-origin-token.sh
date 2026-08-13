#!/usr/bin/env bash
# Make the CDN prove itself to the origin.
#
#   deploy/bunny-api-origin-token.sh            # show the plan
#   deploy/bunny-api-origin-token.sh --apply
#
# The zone in front of the prod API adds a shared secret to every request it
# forwards. That header is what makes an X-Real-IP worth believing, and later
# what Caddy will require — a request without it did not come through the CDN,
# and its headers are the sender's own invention.
#
# The value is ORIGIN_TOKEN from relay/wizard/secrets.env: the same secret the
# node already carries, because a secret that lives in two places drifts.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
set -a; . "$DEPLOY_DIR/.env.deploy"; set +a
apply="${1:-}"

SECRETS="$ROOT/relay/wizard/secrets.env"
[ -f "$SECRETS" ] || { echo "no relay/wizard/secrets.env — the token lives there" >&2; exit 1; }
TOKEN="$(grep '^ORIGIN_TOKEN=' "$SECRETS" | cut -d= -f2-)"
[ -n "$TOKEN" ] || { echo "ORIGIN_TOKEN is empty in secrets.env" >&2; exit 1; }

ZONE_NAME="xorad-api-prod"

# Both secrets through the environment, not argv: an argument is visible
# in ps to every local account for the life of the call.
BUNNY_API_KEY="$BUNNY_API_KEY" ORIGIN_TOKEN="$TOKEN" \
python3 - "$ZONE_NAME" "$apply" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

zone_name, apply = sys.argv[1:3]
token = os.environ["ORIGIN_TOKEN"]
api_key = os.environ["BUNNY_API_KEY"]
BASE = "https://api.bunny.net"
SET_REQUEST_HEADER = 6


def call(method, path, payload=None):
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"AccessKey": api_key, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{method} {path} -> {error.code}: {error.read().decode()[:300]}")


zones = call("GET", "/pullzone?page=0&perPage=100")
zones = zones if isinstance(zones, list) else zones.get("Items", [])
zone = next((z for z in zones if z["Name"] == zone_name), None)
if not zone:
    raise SystemExit(f"no pull zone named {zone_name} — run deploy/bunny-api-zone.sh first")

existing = next(
    (rule for rule in zone.get("EdgeRules", [])
     if (rule.get("Description") or "").startswith("origin token")),
    None,
)

if apply != "--apply":
    print("ПЛАН (ничего не меняется):")
    print(f"  зона {zone_name} (id={zone['Id']})")
    print(f"  {'обновить' if existing else 'создать'} edge-правило: добавлять заголовок")
    print("    X-Origin-Token: <секрет из secrets.env, не печатается>")
    print("  правило без триггеров — применяется ко всем запросам зоны")
    raise SystemExit(0)

rule = {
    "ActionType": SET_REQUEST_HEADER,
    "ActionParameter1": "X-Origin-Token",
    "ActionParameter2": token,
    # Bunny insists on at least one condition, so the condition is "any URL".
    # Same intent as no trigger at all: every request this zone forwards carries
    # the header, and there is no path that quietly does not.
    "Triggers": [
        {
            "Type": 0,                    # URL
            "PatternMatches": ["*"],
            "PatternMatchingType": 0,     # MatchAny
            "Parameter1": None,
        },
    ],
    "TriggerMatchingType": 0,
    "Enabled": True,
    "Description": "origin token — proves the request came through the CDN",
}
if existing:
    rule["Guid"] = existing["Guid"]

call("POST", f"/pullzone/{zone['Id']}/edgerules/addOrUpdate", rule)
print(f"edge-правило {'обновлено' if existing else 'создано'}")

# Read back rather than trust the write: the rule is the whole mechanism.
zone = call("GET", f"/pullzone/{zone['Id']}")
for item in zone.get("EdgeRules", []):
    if (item.get("Description") or "").startswith("origin token"):
        print(f"  проверено: ActionType={item['ActionType']}, header={item['ActionParameter1']}, "
              f"enabled={item['Enabled']}, значение задано={bool(item.get('ActionParameter2'))}")
PY
