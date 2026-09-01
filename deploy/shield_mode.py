#!/usr/bin/env python3
"""Switch a Shield zone from watching to acting.

    python3 deploy/shield_mode.py --block sosed-prod neighbro-prod panel-prod
    python3 deploy/shield_mode.py --block sosed-prod --apply
    python3 deploy/shield_mode.py --log-only sosed-prod --apply     # откат

`deploy/shield_state.py` says a zone finished learning and still cannot act. It
does not act itself, and for a while nothing did: the four production zones sat
in log-only for eleven days after learning ended, because the only way to change
that was a human remembering to open a cabinet. This is that missing half.

Two things it refuses to do on its own.

The first is `xorad-api-prod`. Every other zone hands out static files; that one
carries `POST /report`, the Article 16 intake, and the panel's own API calls
(`panel/src/providers/constants.ts` points the panel at `api.relay.panov.id`,
which is that zone). Blocking there without having read the WAF journal risks
refusing a notice of illegal content — the one failure that costs more than the
attack. The journal is not in the API: twenty-three candidate endpoints in three
namespaces answered 404 on 01.09.2026, so reading it stays a human step. Naming
the zone is not enough; `--include-api` has to be spelled out as well.

The second is a zone still learning. Learning has an end date, and cutting it
short throws away the very observations the decision is supposed to rest on.

Writing is off by default. Without `--apply` this prints the plan and changes
nothing — the same request shape, not sent.

The plan is a pure function so it can be tested without a key or a network
(deploy/test_shield_mode.py); only the fetching and the writing need either.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://api.bunny.net"

# 0 logs, anything else enforces — the same two values shield_state.py judges.
LOG_ONLY = 0
BLOCK = 1
MODE_NAMES = {LOG_ONLY: "только журнал", BLOCK: "блокирует"}

# The zone that carries the Article 16 intake. Guarded by name rather than by id
# so the reason survives a zone being recreated.
GUARDED = {
    "xorad-api-prod":
        "несёт POST /report (приём уведомлений по ст. 16) и запросы панели; "
        "журнал WAF в API не отдаётся, читать его — шаг человека",
}


def parse_time(value):
    """Bunny returns both `…Z` and a bare local-looking stamp."""
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        stamp = datetime.fromisoformat(text)
    except ValueError:
        return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


def plan(zones, wanted, mode, include_api=False, now=None):
    """zones: [{name, shieldZoneId, wafEnabled, wafExecutionMode, learningMode,
    learningModeUntil}] · wanted: имена зон · mode: LOG_ONLY | BLOCK

    Returns (changes, refusals, unchanged). A change is a zone that will be
    written; a refusal is a zone that will not, with the reason said out loud.
    """
    now = now or datetime.now(timezone.utc)
    by_name = {zone.get("name"): zone for zone in zones}
    changes, refusals, unchanged = [], [], []

    for name in wanted:
        zone = by_name.get(name)
        if zone is None:
            refusals.append(f"{name}: такой зоны под Shield нет")
            continue

        if name in GUARDED and not include_api:
            refusals.append(f"{name}: {GUARDED[name]} — нужен явный --include-api")
            continue

        if not zone.get("wafEnabled"):
            refusals.append(f"{name}: WAF выключен — режим менять нечему")
            continue

        until = parse_time(zone.get("learningModeUntil"))
        if mode == BLOCK and zone.get("learningMode") and (until is None or until > now):
            ends = f" до {until:%d.%m.%Y}" if until else ""
            refusals.append(f"{name}: ещё учится{ends} — блокировку включать рано")
            continue

        current = zone.get("wafExecutionMode")
        if current == mode:
            unchanged.append(f"{name}: уже {MODE_NAMES.get(mode, mode)}")
            continue

        changes.append({
            "name": name,
            "shieldZoneId": zone["shieldZoneId"],
            "from": current,
            "to": mode,
        })

    return changes, refusals, unchanged


def request(method, path, body=None, key=None):
    data = json.dumps(body).encode() if body is not None else None
    call = urllib.request.Request(f"{API}{path}", data=data, method=method, headers={
        "AccessKey": key,
        "accept": "application/json",
        "content-type": "application/json",
    })
    with urllib.request.urlopen(call, timeout=45) as response:
        return json.loads(response.read() or b"null")


def fetch(key):
    names = {z["Id"]: z["Name"]
             for z in request("GET", "/pullzone?page=1&perPage=100", key=key)["Items"]}
    rows = request("GET", "/shield/shield-zones?page=1&perPage=100", key=key)["data"]
    return [{**row, "name": names.get(row["pullZoneId"])} for row in rows]


def write(shield_zone_id, mode, key):
    """PATCH /shield/shield-zone, measured on 01.09.2026: a flat body is refused
    with `model_validation_error.shieldzone`, the field has to sit inside a
    `shieldZone` wrapper, and a minimal wrapper is accepted — the whole object
    does not have to be echoed back."""
    return request("PATCH", "/shield/shield-zone", {
        "shieldZoneId": shield_zone_id,
        "shieldZone": {"wafExecutionMode": mode},
    }, key=key)


def main():
    parser = argparse.ArgumentParser(description="режим WAF у зон Bunny Shield")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--block", nargs="+", metavar="ЗОНА",
                       help="включить блокировку в этих зонах")
    group.add_argument("--log-only", nargs="+", metavar="ЗОНА",
                       help="вернуть эти зоны в режим наблюдения")
    parser.add_argument("--apply", action="store_true",
                        help="действительно записать; без него печатается только план")
    parser.add_argument("--include-api", action="store_true",
                        help=f"разрешить трогать {', '.join(GUARDED)}")
    arguments = parser.parse_args()

    key = os.environ.get("BUNNY_API_KEY")
    if not key:
        sys.exit("BUNNY_API_KEY is not set")

    mode = BLOCK if arguments.block else LOG_ONLY
    wanted = arguments.block or arguments.log_only

    zones = fetch(key)
    changes, refusals, unchanged = plan(zones, wanted, mode, arguments.include_api)

    for line in unchanged:
        print(f"  ok   {line}")
    for line in refusals:
        print(f"  НЕТ  {line}")
    for change in changes:
        verb = "переключаю" if arguments.apply else "переключил бы"
        print(f"  →    {change['name']}: {MODE_NAMES.get(change['from'], change['from'])} "
              f"→ {MODE_NAMES.get(change['to'], change['to'])} ({verb})")

    if not arguments.apply:
        if changes:
            print("\nэто был план; чтобы записать, добавьте --apply")
        return 1 if refusals else 0

    failed = 0
    for change in changes:
        try:
            write(change["shieldZoneId"], change["to"], key)
        except urllib.error.HTTPError as error:
            failed += 1
            print(f"  ОШИБКА {change['name']}: {error.code} "
                  f"{error.read().decode('utf-8', 'replace')[:200]}")

    # The write is not the proof. Re-reading is: a 200 on a PATCH whose body the
    # API quietly ignored looks exactly like a switch that happened.
    after = {zone["name"]: zone for zone in fetch(key)}
    print()
    for change in changes:
        now_mode = after.get(change["name"], {}).get("wafExecutionMode")
        if now_mode == change["to"]:
            print(f"  ok   {change['name']}: {MODE_NAMES.get(now_mode, now_mode)} — перечитано")
        else:
            failed += 1
            print(f"  FAIL {change['name']}: просили {change['to']}, в API {now_mode}")

    return 1 if failed or refusals else 0


if __name__ == "__main__":
    sys.exit(main())
