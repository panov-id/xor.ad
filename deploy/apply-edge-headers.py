#!/usr/bin/env python3
"""Put one edge rule on a Bunny pull zone that sets every security header.

    HEADERS_JSON='{"headers":[{"name":...,"value":...}]}' \
        BUNNY_API_KEY=... apply-edge-headers.py <pull-zone-id>

The headers are computed elsewhere, from the bytes about to be served, and
arrive here as JSON on the environment. This file only knows how to say them to
the edge. The key comes through the environment for the same reason the headers
do: an argument is visible in ps to every local account.

Two facts about the API are load-bearing and were established by experiment on a
private dev zone rather than taken from memory: action type 5 sets a response
header, and one rule can carry several actions through ExtraActions. The second
is what turns six rules per zone into one.
"""

import json
import os
import sys
import urllib.error
import urllib.request

SET_RESPONSE_HEADER = 5
DESCRIPTION = "security headers (managed by the deploy)"

KEY = os.environ.get("BUNNY_API_KEY") or ""


def action(header):
    return {
        "ActionType": SET_RESPONSE_HEADER,
        "ActionParameter1": header["name"],
        "ActionParameter2": header["value"],
        "ActionParameter3": None,
    }


def call(method, path, body=None):
    request = urllib.request.Request(
        f"https://api.bunny.net{path}",
        method=method,
        headers={"AccessKey": KEY, "content-type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    # Both directions are wrapped. Only the POST used to be, so an expired key
    # gave a bare traceback on the GET — after the upload and before the purge,
    # which is the worst place in the deploy to stop.
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        sys.exit(f"{method} {path}: HTTP {error.code} {error.read()[:300]!r}")
    except urllib.error.URLError as error:
        sys.exit(f"{method} {path}: {error.reason}")


def sets_one_of(rule, names):
    """Does this rule set any of the headers we are about to set?"""
    actions = [rule] + list(rule.get("ExtraActions") or [])
    return any(
        item.get("ActionType") == SET_RESPONSE_HEADER
        and item.get("ActionParameter1") in names
        for item in actions
    )


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: BUNNY_API_KEY=… apply-edge-headers.py <pull-zone-id>")
    zone = sys.argv[1]
    if not KEY:
        sys.exit("BUNNY_API_KEY is not set")

    payload = os.environ.get("HEADERS_JSON")
    if not payload:
        sys.exit("HEADERS_JSON is not set")
    try:
        data = json.loads(payload)
        headers = data["headers"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        sys.exit(f"HEADERS_JSON is not what this expects: {error}")
    if not headers:
        sys.exit("HEADERS_JSON carries no headers")

    # The landings print this and the panel did not. A run where the regular
    # expression stopped matching the inline script reports inline_scripts: 0,
    # ships script-src 'self', applies cleanly and kills the page — and without
    # this line the log of that run reads exactly like the log of a good one.
    print("  " + json.dumps(data.get("counted", {})))

    rule = {
        "Guid": None,
        **action(headers[0]),
        "ExtraActions": [action(header) for header in headers[1:]],
        "Enabled": True,
        "Description": DESCRIPTION,
        "TriggerMatchingType": 0,
        "Triggers": [
            {"Type": 0, "PatternMatches": ["*"], "PatternMatchingType": 0, "Parameter1": ""}
        ],
    }

    existing = call("GET", f"/pullzone/{zone}")
    # A null is not the same as an absent key: `.get(name, [])` covers only the
    # second, and `for item in None` is what the first gave.
    rules = existing.get("EdgeRules") or []

    # Exact equality, like the two neighbouring scripts in this directory. A
    # prefix match meant that renaming the description in the Bunny interface
    # created a second rule instead of updating the first.
    ours = [item for item in rules if (item.get("Description") or "") == DESCRIPTION]
    names = {header["name"] for header in headers}
    foreign = [
        item for item in rules
        if item not in ours and sets_one_of(item, names)
    ]

    # Two rules setting the same header is not a state this script can resolve:
    # load order decides which wins, and with two Content-Security-Policy headers
    # the browser applies the intersection — a panel that breaks the more, the
    # older the other rule is. A person has to say which one is meant to live.
    if len(ours) > 1:
        sys.exit(f"zone {zone} carries {len(ours)} rules described {DESCRIPTION!r} — "
                 f"remove all but one and run again")
    if foreign:
        described = ", ".join(repr(item.get("Description") or "") for item in foreign)
        sys.exit(f"zone {zone} carries other rules setting the same headers: {described} — "
                 f"resolve by hand and run again")

    rule["Guid"] = ours[0]["Guid"] if ours else None
    updating = bool(rule["Guid"])
    call("POST", f"/pullzone/{zone}/edgerules/addOrUpdate", rule)

    print(f"  {'updated' if updating else 'created'} the rule on zone {zone}: "
          f"{', '.join(header['name'] for header in headers)}")


if __name__ == "__main__":
    main()
