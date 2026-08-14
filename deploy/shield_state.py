#!/usr/bin/env python3
"""Is Bunny Shield doing anything, or only watching?

    BUNNY_API_KEY=… python3 deploy/shield_state.py

Shield has two settings that decide whether it can ever act: `wafEnabled`, and
`wafExecutionMode` — 0 logs, anything else enforces. A zone can sit enabled and
logging for as long as nobody looks, which is exactly what happened: the API zone
finished its learning window on 12 August 2026 and stayed in log-only, because
nothing switches that automatically and nothing said so out loud.

Learning is the reason to be in log-only. Once it has ended, log-only is no
longer a stage — it is a decision nobody made. That is what this reports.

The judgement is a pure function so it can be tested without a key or a network
(deploy/test_shield_state.py); only the fetching needs either.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://api.bunny.net"


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


def judge(zones, now=None):
    """zones: [{name, wafEnabled, wafExecutionMode, learningMode, learningModeUntil}]

    Returns (problems, notes). A problem is a zone that has stopped learning and
    still cannot act — or one where Shield is off entirely.
    """
    now = now or datetime.now(timezone.utc)
    problems, notes = [], []

    for zone in sorted(zones, key=lambda z: z.get("name") or ""):
        name = zone.get("name") or f"(зона {zone.get('pullZoneId')})"
        if not zone.get("wafEnabled"):
            problems.append(f"{name}: Shield подключён, но WAF выключен — он не смотрит вообще")
            continue

        enforcing = zone.get("wafExecutionMode") not in (0, None)
        until = parse_time(zone.get("learningModeUntil"))
        learning = bool(zone.get("learningMode")) and (until is None or until > now)

        if enforcing:
            notes.append(f"{name}: блокирует")
        elif learning:
            notes.append(f"{name}: учится до {until:%d.%m.%Y}" if until else f"{name}: учится")
        else:
            since = f" (обучение кончилось {until:%d.%m.%Y})" if until else ""
            problems.append(
                f"{name}: только журнал{since} — режим надо переключить руками, "
                f"сам он не переключится"
            )
    return problems, notes


def fetch():
    key = os.environ.get("BUNNY_API_KEY")
    if not key:
        sys.exit("BUNNY_API_KEY is not set")

    def get(path):
        request = urllib.request.Request(
            f"{API}{path}", headers={"AccessKey": key, "accept": "application/json"})
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read())

    names = {z["Id"]: z["Name"] for z in get("/pullzone?page=1&perPage=100")["Items"]}
    rows = get("/shield/shield-zones?page=1&perPage=100")["data"]
    return [{**row, "name": names.get(row["pullZoneId"])} for row in rows]


if __name__ == "__main__":
    zones = fetch()
    problems, notes = judge(zones)

    print(f"зон под Shield: {len(zones)}")
    for note in notes:
        print(f"  ok   {note}")
    for problem in problems:
        print(f"  ЖДЁТ {problem}")

    if problems:
        print("\nЧитать журнал и продлевать обучение можно только в интерфейсе Bunny:")
        print("оба этих действия его API не отдаёт — проверено перебором.")
        sys.exit(1)
