#!/usr/bin/env bash
# Add /config.js to a production zone's short-browser-cache edge rule, then purge
# the file so the change takes effect for everyone at once.
#
#   deploy/bunny-config-cache-rule.sh            # show the plan
#   deploy/bunny-config-cache-rule.sh --apply
#
# Why: config.js is served as a .js file, so it inherited the month-long asset
# cache. But it is the opposite of an asset — it exists to switch the backend,
# the publishable key and the analytics id without a rebuild. A month-old copy
# means a returning visitor keeps calling the relay without a key long after the
# landing was deployed with one, and a revoked key stays usable just as long.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DEPLOY_DIR/.env.deploy"; set +a
apply="${1:-}"

# zone id : hostname
ZONES=(
  "6123213:sosed.place"
  "6123217:neighbro.place"
)

for entry in "${ZONES[@]}"; do
  zone="${entry%%:*}"
  host="${entry#*:}"
  echo "== $host (zone $zone)"

  python3 - "$zone" "$host" "$BUNNY_API_KEY" "$apply" <<'PY'
import json
import sys
import urllib.request

zone, host, api_key, apply = sys.argv[1:5]
base = "https://api.bunny.net"


def call(method, path, payload=None):
    request = urllib.request.Request(
        f"{base}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "AccessKey": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        # Bunny explains a rejected rule in the body; without it a 400 is a
        # guessing game.
        raise SystemExit(f"   {method} {path} -> {error.code}: {error.read().decode()[:400]}")


pull_zone = call("GET", f"/pullzone/{zone}")
# ActionType 16 is "set browser cache expiration"; the SEO rule already carries
# the HTML paths, so config.js joins it rather than competing with a second rule.
rule = next(
    (r for r in pull_zone.get("EdgeRules", [])
     if r.get("Description") == "seo: short browser cache for html"),
    None,
)
if rule is None:
    raise SystemExit("   the short-cache rule is missing — not inventing one here")

wanted = f"https://{host}/config.js"
covered = any(wanted in trigger["PatternMatches"] for trigger in rule["Triggers"])
if covered:
    print(f"   already covered: {wanted}")
    raise SystemExit(0)

# A condition holds at most five patterns, and the SEO one is full. The rule
# matches on any condition (TriggerMatchingType 0), so a second condition with
# the single path is equivalent to a sixth pattern — and leaves the existing
# five untouched.
first = rule["Triggers"][0]
room = 5 - len(first["PatternMatches"])
print(f"   would add: {wanted}")
print(f"   existing condition holds {len(first['PatternMatches'])} pattern(s), TTL {rule['ActionParameter1']}s")
print(f"   {'appending to it' if room > 0 else 'adding a second condition (the first is full)'}")
if apply != "--apply":
    print("   (plan only — re-run with --apply)")
    raise SystemExit(0)

if room > 0:
    first["PatternMatches"] = list(first["PatternMatches"]) + [wanted]
else:
    rule["Triggers"].append({
        "Type": first["Type"],
        "PatternMatches": [wanted],
        "PatternMatchingType": first["PatternMatchingType"],
        "Parameter1": first.get("Parameter1", ""),
    })
# Send the rule back exactly as it came, with one pattern added: reconstructing
# it field by field is how a null the API dislikes creeps in.
call("POST", f"/pullzone/{zone}/edgerules/addOrUpdate", rule)
print("   rule updated")

# The edge still holds a copy cached under the old header; purging makes the new
# TTL the one visitors actually receive.
call("POST", f"/purge?url=https://{host}/config.js")
print("   purged https://{}/config.js".format(host))
PY
done
