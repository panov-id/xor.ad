#!/usr/bin/env python3
"""The Shield judgement, without a key and without a network.

    python3 deploy/test_shield_state.py

What is worth pinning is the one distinction the state has: log-only *while
learning* is a stage, and log-only *after* learning is a decision nobody made.
The API zone sat in the second condition for two days and nothing said so,
because "enabled" and "acting" look alike from a dashboard.
"""

import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta, timezone

MODULE = pathlib.Path(__file__).with_name("shield_state.py")
spec = importlib.util.spec_from_file_location("shield_state", MODULE)
shield = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shield)

NOW = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
LATER = (NOW + timedelta(days=7)).isoformat()
EARLIER = (NOW - timedelta(days=2)).isoformat()

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def judge(zone):
    return shield.judge([{"name": "z", "pullZoneId": 1, **zone}], now=NOW)


problems, notes = judge({"wafEnabled": True, "wafExecutionMode": 0,
                         "learningMode": True, "learningModeUntil": LATER})
check("learning, log-only: a stage, not a problem", not problems and notes, str(problems))

problems, _ = judge({"wafEnabled": True, "wafExecutionMode": 0,
                     "learningMode": True, "learningModeUntil": EARLIER})
check("learning over, still log-only: reported", len(problems) == 1, str(problems))
check("and it says the switch is manual",
      problems and "руками" in problems[0], str(problems))
check("and it names when learning ended",
      problems and "12.08.2026" in problems[0], str(problems))

problems, notes = judge({"wafEnabled": True, "wafExecutionMode": 1,
                         "learningMode": False, "learningModeUntil": EARLIER})
check("enforcing: not a problem", not problems and notes, str(problems))

problems, _ = judge({"wafEnabled": False, "wafExecutionMode": 1,
                     "learningMode": False, "learningModeUntil": None})
check("Shield attached with the WAF off is reported",
      len(problems) == 1 and "выключен" in problems[0], str(problems))

# A zone with learningMode true and no end date is still learning: absent is not
# expired, and treating it as expired would nag about a zone doing its job.
problems, notes = judge({"wafEnabled": True, "wafExecutionMode": 0,
                         "learningMode": True, "learningModeUntil": None})
check("learning with no end date is not treated as expired", not problems, str(problems))

# A zone held on purpose is not a decision nobody made. What has to stay true is
# that HELD covers exactly the named zones: a map that quietly silenced everything
# would turn this report into the thing it was written to catch.
problems, notes = shield.judge(
    [{"name": "panel-prod", "pullZoneId": 2, "wafEnabled": True, "wafExecutionMode": 0,
      "learningMode": True, "learningModeUntil": EARLIER}], now=NOW)
check("a held zone is a note, not a problem", not problems and len(notes) == 1, str(problems))
check("and the note names the item that carries its deadline",
      notes and "G12" in notes[0] and "держим сознательно" in notes[0], str(notes))

problems, _ = shield.judge(
    [{"name": "some-other-prod", "pullZoneId": 3, "wafEnabled": True, "wafExecutionMode": 0,
      "learningMode": True, "learningModeUntil": EARLIER}], now=NOW)
check("a zone that is NOT held is still reported", len(problems) == 1, str(problems))

# Holding is about log-only. A held zone that is in fact blocking must report as
# blocking, or the map would hide a zone that changed under us.
_, notes = shield.judge(
    [{"name": "panel-prod", "pullZoneId": 2, "wafEnabled": True, "wafExecutionMode": 1,
      "learningMode": False, "learningModeUntil": EARLIER}], now=NOW)
check("a held zone that is actually blocking says so",
      notes and "блокирует" in notes[0], str(notes))

# Every held zone must name an item, or "held" becomes a place to hide a delay.
check("every held zone carries an item and a reason",
      all(len(value) == 2 and value[0] and value[1] for value in shield.HELD.values()),
      str(shield.HELD))

# Bunny returns both shapes for the same field; a parser that only knows one of
# them would silently treat the other as "no date" and stay quiet forever.
check("both time shapes parse",
      shield.parse_time("2026-08-12T20:49:10") is not None
      and shield.parse_time("2026-08-21T17:36:07.997Z") is not None)

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("shield state: every case passed")
