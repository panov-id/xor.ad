#!/usr/bin/env bash
# Send /index.html to / so the two are not two pages.
#
#   deploy/bunny-seo-index-redirect.sh            # show the plan
#   deploy/bunny-seo-index-redirect.sh --apply
#
# Storage serves the same file at "/" and at "/index.html", so both answer 200.
# The page already declares <link rel="canonical" href="https://<site>/">, and
# Google honours it — Search Console lists the duplicate under "Alternate page
# with proper canonical tag", which is a statement that the setup works, not a
# fault. This rule removes the duplicate one step earlier: at the edge, before a
# crawler ever sees two pages.
#
# Scope, and why it stops here. Each language directory has the same pair
# (/ru/ and /ru/index.html both answer 200), but one rule cannot fix them: the
# redirect target is a literal string, {{path}} substitutes the whole path, and
# nothing strips a suffix. Fixing all of them would mean one rule per language
# per zone — twenty-two rules for URLs that nothing links to and no sitemap
# lists, whose canonical already resolves them correctly. The root is the one
# Google actually found, so the root is what this fixes.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DEPLOY_DIR/.env.deploy"; set +a
apply="${1:-}"

# Through the environment, not argv: an argument is visible in ps to
# every local account for the life of the call.
BUNNY_API_KEY="$BUNNY_API_KEY" \
python3 - "$apply" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

apply = sys.argv[1]
api_key = os.environ["BUNNY_API_KEY"]
BASE = "https://api.bunny.net"
REDIRECT = 1          # confirmed from the live "seo: www to apex" rule, not guessed
DESCRIPTION = "seo: index.html to /"

SITES = {
    "neighbro-prod": "https://neighbro.place",
    "sosed-prod": "https://sosed.place",
}


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
by_name = {zone["Name"]: zone for zone in zones}

planned = []
for zone_name, origin in SITES.items():
    zone = by_name.get(zone_name)
    if not zone:
        raise SystemExit(f"no pull zone named {zone_name}")
    existing = next(
        (rule for rule in zone.get("EdgeRules", [])
         if (rule.get("Description") or "") == DESCRIPTION),
        None,
    )
    planned.append((zone, origin, existing))

if apply != "--apply":
    print("ПЛАН (ничего не меняется):")
    for zone, origin, existing in planned:
        print(f"  зона {zone['Name']} (id={zone['Id']}) — "
              f"{'обновить' if existing else 'создать'} правило «{DESCRIPTION}»")
        print(f"      {origin}/index.html  →  301  →  {origin}/")
    print()
    print("  языковые /xx/index.html остаются на canonical — см. шапку скрипта")
    raise SystemExit(0)

for zone, origin, existing in planned:
    rule = {
        "ActionType": REDIRECT,
        "ActionParameter1": f"{origin}/",
        "ActionParameter2": "301",
        "Triggers": [
            {
                "Type": 0,                 # URL
                "PatternMatches": [f"{origin}/index.html"],
                "PatternMatchingType": 0,  # MatchAny
                "Parameter1": "",
            },
        ],
        "TriggerMatchingType": 0,
        "Enabled": True,
        "Description": DESCRIPTION,
    }
    if existing:
        rule["Guid"] = existing["Guid"]
    call("POST", f"/pullzone/{zone['Id']}/edgerules/addOrUpdate", rule)
    print(f"{zone['Name']}: правило {'обновлено' if existing else 'создано'}")

# Read back rather than trust the write.
print()
print("проверка по зонам:")
for zone, origin, _ in planned:
    fresh = call("GET", f"/pullzone/{zone['Id']}")
    found = next(
        (r for r in fresh.get("EdgeRules", []) if (r.get("Description") or "") == DESCRIPTION),
        None,
    )
    if found:
        print(f"  {zone['Name']}: ActionType={found['ActionType']} "
              f"target={found['ActionParameter1']} code={found['ActionParameter2']} "
              f"enabled={found['Enabled']}")
    else:
        print(f"  {zone['Name']}: ПРАВИЛА НЕТ — запись не применилась")
PY
