#!/usr/bin/env python3
"""The switch's plan, without a key and without a network.

    python3 deploy/test_shield_mode.py

What is worth pinning is what the switch REFUSES. A tool that flips a mode is
trivial; the whole reason this one exists as code rather than as four clicks is
that two zones must not be flipped by accident — the one carrying the Article 16
intake, and any zone still learning. A refusal that quietly stopped refusing
would look exactly like success.
"""

import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta, timezone

MODULE = pathlib.Path(__file__).with_name("shield_mode.py")
spec = importlib.util.spec_from_file_location("shield_mode", MODULE)
shield = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shield)

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
LATER = (NOW + timedelta(days=7)).isoformat()
EARLIER = (NOW - timedelta(days=11)).isoformat()

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def zone(name, mode=shield.LOG_ONLY, enabled=True, learning=False, until=EARLIER):
    return {"name": name, "shieldZoneId": 1, "wafEnabled": enabled,
            "wafExecutionMode": mode, "learningMode": learning,
            "learningModeUntil": until}


def plan(zones, wanted, mode=shield.BLOCK, include_api=False):
    return shield.plan(zones, wanted, mode, include_api, now=NOW)


# The three static zones: nothing in the way, so they are changes.
statics = [zone("sosed-prod"), zone("neighbro-prod"), zone("panel-prod")]
changes, refusals, unchanged = plan(statics, ["sosed-prod", "neighbro-prod", "panel-prod"])
check("three static zones become three changes", len(changes) == 3, str(changes))
check("and nothing is refused", not refusals, str(refusals))
check("each change names where it goes",
      all(c["to"] == shield.BLOCK and c["from"] == shield.LOG_ONLY for c in changes),
      str(changes))

# The guarded zone: named on the command line is not enough.
guarded = [zone("xorad-api-prod")]
changes, refusals, _ = plan(guarded, ["xorad-api-prod"])
check("the API zone is refused when merely named", not changes and len(refusals) == 1,
      str(changes) + str(refusals))
check("and the refusal says why, not just no",
      refusals and "ст. 16" in refusals[0] and "--include-api" in refusals[0], str(refusals))

changes, refusals, _ = plan(guarded, ["xorad-api-prod"], include_api=True)
check("--include-api lets it through", len(changes) == 1 and not refusals,
      str(changes) + str(refusals))

# A zone still learning must not be cut short — that throws away the evidence
# the decision is supposed to rest on.
changes, refusals, _ = plan([zone("sosed-prod", learning=True, until=LATER)], ["sosed-prod"])
check("a zone still learning is refused", not changes and len(refusals) == 1, str(refusals))
check("and the refusal names the end of learning",
      refusals and "08.09.2026" in refusals[0], str(refusals))

# Learning whose date has passed is not learning, whatever the flag says. This is
# the live condition of all four zones: learningMode true, ended 21.08.2026.
changes, refusals, _ = plan([zone("sosed-prod", learning=True, until=EARLIER)], ["sosed-prod"])
check("learning that has expired does not block the switch",
      len(changes) == 1 and not refusals, str(changes) + str(refusals))

# Going back to log-only is a rollback and must never be held up by learning:
# the whole point of a rollback is that it works when things are wrong.
changes, refusals, _ = plan([zone("sosed-prod", mode=shield.BLOCK, learning=True, until=LATER)],
                            ["sosed-prod"], mode=shield.LOG_ONLY)
check("rollback to log-only is never held up by learning",
      len(changes) == 1 and not refusals, str(changes) + str(refusals))

# Switching the mode of a zone whose WAF is off changes nothing but looks like it
# did — shield_state.py reports that condition as its own problem.
changes, refusals, _ = plan([zone("sosed-prod", enabled=False)], ["sosed-prod"])
check("a zone with the WAF off is refused, not written",
      not changes and refusals and "выключен" in refusals[0], str(refusals))

# Already there: not a change, and not a failure either.
changes, refusals, unchanged = plan([zone("sosed-prod", mode=shield.BLOCK)], ["sosed-prod"])
check("a zone already blocking is left alone",
      not changes and not refusals and len(unchanged) == 1, str(unchanged))

# A name nobody has: silence here would mean a typo'd zone counts as done.
changes, refusals, _ = plan(statics, ["sosed-prd"])
check("an unknown zone name is refused out loud",
      not changes and refusals and "нет" in refusals[0], str(refusals))

# Both stamp shapes Bunny returns must parse, or an unparsed date reads as "no
# date", and a zone still learning would be switched.
check("both time shapes parse",
      shield.parse_time("2026-08-21T17:36:08") is not None
      and shield.parse_time("2026-08-21T17:36:07.997Z") is not None)

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("shield mode: every case passed")
