#!/usr/bin/env python3
"""Find which WAF rule blocks a URL, by bisection instead of by reading a log.

    python3 deploy/waf_rule_search.py --zone panel-prod --url /assets/index-*.js
    python3 deploy/waf_rule_search.py --zone panel-prod --url ... --apply

Bunny serves no WAF event log. Twenty-three candidate endpoints answered 404 on
2026-09-01 and thirteen more on 2026-09-03, which is why G12 sat for two weeks
as "a person's step, in the dashboard". It is not one. The rule CATALOGUE is
served (`GET /shield/waf/rules`), and a rule can be excluded per zone through
`wafLogOnlyRules`, so the question "which rule fires" is answerable by
experiment: exclude a set, ask for the URL, and the answer says whether the
culprit was in that set. Six or seven rounds name it out of 260.

That is how 952100 (Java Source Code Leakage, firing on a minified JavaScript
bundle) was found on 2026-09-03, after the panel had been blank under blocking
since 2026-09-01.

Two things this tool refuses to do, both learned the hard way on that day:

- It will not search in green. The first thing it does under blocking is
  reproduce the failure with no exclusions at all. If the URL comes back fine
  there, the run stops: a bisection over a failure that is not happening
  produces a confident and meaningless answer.
- It will not trust a cached answer. The edge served a stored copy under
  blocking - `cdn-cache: HIT`, 200, the WAF never consulted - and a query
  string does not change the cache key. Every probe purges the URL first, and
  a HIT is not counted as a verdict.

The zone is restored in a finally block to the mode and rule list read before
the first write. Without --apply nothing is written at all.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.bunny.net"
LOG_ONLY, BLOCK = 0, 1


# ---------------------------------------------------------------- pure part --
# Everything below this line is testable without a key and without a network,
# which is the same split shield_mode.py uses: the plan is a pure function, only
# fetching and writing need either.

def response_rule_ids(catalogue):
    """Rule ids that inspect the RESPONSE body, in catalogue order.

    Those are the ones that can block a file the origin served successfully -
    the shape of the panel failure, where `cdn-requestpullcode` was 200 and the
    edge still answered 403.
    """
    return [rule["ruleId"]
            for section in catalogue if section.get("name") == "RESPONSE"
            for group in section.get("ruleGroups", [])
            for rule in (group.get("rules") or [])]


def request_rule_ids(catalogue):
    """Rule ids that inspect the REQUEST, for when the culprit is not in the
    response set."""
    return [rule["ruleId"]
            for section in catalogue if section.get("name") == "REQUEST"
            for group in section.get("ruleGroups", [])
            for rule in (group.get("rules") or [])]


def bisect(candidates, passes_when_excluded):
    """Narrow `candidates` to the one rule that blocks, halving each round.

    `passes_when_excluded(subset)` answers whether the URL is served when that
    subset is excluded. The invariant is that the culprit is always inside the
    set held, so the search keeps the half that still lets the URL through, and
    otherwise keeps the other half.

    Returns the rule id, or None for an empty candidate list.
    """
    held = list(candidates)
    if not held:
        return None
    while len(held) > 1:
        half = held[:len(held) // 2]
        held = half if passes_when_excluded(half) else held[len(held) // 2:]
    return held[0]


def rounds_needed(count):
    """How many probes a bisection over `count` candidates costs. Printed in the
    plan so the price is visible before anything is written."""
    rounds = 0
    while count > 1:
        count -= count // 2
        rounds += 1
    return rounds


# ------------------------------------------------------------------- network --

def env(path):
    out = {}
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def api(method, path, key, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "AccessKey": key, "accept": "application/json",
        "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def zone_id(key, name):
    _, zones = api("GET", "/pullzone?page=1&perPage=100", key)
    names = {zone["Id"]: zone["Name"] for zone in zones["Items"]}
    _, shield = api("GET", "/shield/shield-zones?page=1&perPage=100", key)
    for row in shield["data"]:
        if names.get(row.get("pullZoneId")) == name:
            return row["shieldZoneId"]
    sys.exit(f"zone {name} is not under Shield")


def read_zone(key, sid):
    status, body = api("GET", f"/shield/shield-zone/{sid}", key)
    if status != 200:
        sys.exit(f"cannot read zone {sid}: {status} {body}")
    return body["data"]


def write_zone(key, sid, mode, log_only_rules):
    """PATCH, then read back. A 200 on a PATCH whose body the API quietly
    ignored looks exactly like a switch that worked - the same trap
    shield_mode.py:134 guards against."""
    status, body = api("PATCH", "/shield/shield-zone", key, {
        "shieldZoneId": sid,
        "shieldZone": {"wafExecutionMode": mode,
                       "wafLogOnlyRules": list(log_only_rules)},
    })
    if status not in (200, 201, 202, 204):
        sys.exit(f"PATCH refused: {status} {body}")
    back = read_zone(key, sid)
    if back.get("wafExecutionMode") != mode or \
            set(map(str, back.get("wafLogOnlyRules") or [])) != set(map(str, log_only_rules)):
        sys.exit("PATCH was accepted but not applied - refusing to measure "
                 "against a state the API did not take")
    return back


def probe(url, key, tries=4, pause=3.0):
    """Fetch the URL from the edge, uncached. Only a MISS is a verdict."""
    for attempt in range(tries):
        api("POST", "/purge?url=" + urllib.parse.quote(url, safe="") +
            "&async=false", key)
        time.sleep(1.0)
        request = urllib.request.Request(
            f"{url}?_waf_probe={int(time.time() * 1000)}_{attempt}",
            headers={"cache-control": "no-cache", "pragma": "no-cache"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                code, headers = response.status, dict(response.headers)
        except urllib.error.HTTPError as exc:
            code, headers = exc.code, dict(exc.headers)
        cache = headers.get("cdn-cache") or headers.get("CDN-Cache") or "?"
        print(f"       probe -> {code}  cdn-cache={cache}")
        if code in (200, 403) and str(cache).upper() != "HIT":
            return code
        time.sleep(pause)
    print("       every probe came back from cache - no verdict")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="deploy/.env.deploy")
    parser.add_argument("--zone", required=True)
    parser.add_argument("--url", required=True,
                        help="full URL of the blocked file")
    parser.add_argument("--set", choices=("response", "request"),
                        default="response")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--settle", type=float, default=6.0)
    args = parser.parse_args()

    key = env(args.env)["BUNNY_API_KEY"]
    _, catalogue = api("GET", "/shield/waf/rules", key)
    candidates = (response_rule_ids(catalogue) if args.set == "response"
                  else request_rule_ids(catalogue))

    sid = zone_id(key, args.zone)
    before = read_zone(key, sid)
    saved_mode = before.get("wafExecutionMode")
    saved_rules = [str(r) for r in (before.get("wafLogOnlyRules") or [])]

    print(f"zone {args.zone} shieldZoneId={sid}")
    print(f"  current: wafExecutionMode={saved_mode} "
          f"wafLogOnlyRules={saved_rules or '[]'}")
    print(f"  url: {args.url}")
    print(f"  candidates: {len(candidates)} {args.set} rules, "
          f"{rounds_needed(len(candidates))} rounds after the two checks")
    print(f"  restore on exit: mode={saved_mode} rules={saved_rules or '[]'}")
    if not args.apply:
        print("\n  --apply not given: nothing written, nothing probed.")
        return

    found = None
    try:
        print("\n=== positive control: block with no exclusions ===")
        write_zone(key, sid, BLOCK, [])
        time.sleep(args.settle)
        if probe(args.url, key) != 403:
            print("  the url is not blocked with every rule live - there is no "
                  "failure here to bisect, so nothing is concluded.")
            return
        print("  403 reproduced.")

        print(f"\n=== is the culprit among the {args.set} rules? ===")
        write_zone(key, sid, BLOCK, candidates)
        time.sleep(args.settle)
        if probe(args.url, key) != 200:
            print(f"  still blocked with all {args.set} rules excluded - the "
                  f"culprit is elsewhere; try --set "
                  f"{'request' if args.set == 'response' else 'response'}.")
            return
        print("  yes.")

        def passes(subset):
            print(f"\n=== bisect: excluding {len(subset)} "
                  f"({subset[0]}..{subset[-1]}) ===")
            write_zone(key, sid, BLOCK, subset)
            time.sleep(args.settle)
            return probe(args.url, key) == 200

        found = bisect(candidates, passes)
        print(f"\n=== FOUND: rule {found} ===")
    finally:
        print("\n=== restoring zone ===")
        back = write_zone(key, sid, saved_mode, saved_rules)
        print(f"  wafExecutionMode={back.get('wafExecutionMode')} "
              f"wafLogOnlyRules={back.get('wafLogOnlyRules')}")
        if found:
            print(f"\n  put {found} into wafLogOnlyRules for {args.zone} and "
                  f"blocking can be switched on without breaking this url.")


if __name__ == "__main__":
    main()
