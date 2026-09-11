#!/usr/bin/env python3
"""The rule search, without a key and without a network.

    python3 deploy/test_waf_rule_search.py

What is worth pinning is the bisection itself. Every round of it costs a write
to a live zone and a window in which the site is blocked, so an off-by-one that
merely returns the wrong neighbour would not look like a failure - it would look
like an answer, get written into wafLogOnlyRules, and leave the real rule still
blocking. So the search is checked against every position in the set, not one.
"""

import pathlib
import sys
import types

# Compiled from source on purpose, rather than through
# spec.loader.exec_module. Loading by spec goes through the bytecode cache,
# which decides a cached .pyc is still good from mtime and size - and on
# 2026-09-03 that made this test report on code no longer on disk: an edit that
# swapped two branches of one line kept the file the same size and landed in
# the same second, so __pycache__ served the previous version and the suite
# stayed red after the file had been restored. A test that can answer about a
# file that is not there is worse than no test.
MODULE = pathlib.Path(__file__).with_name("waf_rule_search.py")
waf = types.ModuleType("waf_rule_search")
waf.__file__ = str(MODULE)
exec(compile(MODULE.read_text(), str(MODULE), "exec"), waf.__dict__)

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name}{(' — ' + detail) if detail else ''}")


CATALOGUE = [
    {"name": "REQUEST", "ruleGroups": [
        {"code": "941", "rules": [{"ruleId": "941100"}, {"ruleId": "941110"}]},
        {"code": "903.9001", "rules": []},
    ]},
    {"name": "RESPONSE", "ruleGroups": [
        {"code": "950", "rules": [{"ruleId": "950130"}]},
        {"code": "952", "rules": [{"ruleId": "952100"}, {"ruleId": "952110"}]},
        {"code": "980", "rules": None},
    ]},
]

print("catalogue")
check("response ids are taken from the RESPONSE section only",
      waf.response_rule_ids(CATALOGUE) == ["950130", "952100", "952110"],
      str(waf.response_rule_ids(CATALOGUE)))
check("request ids are taken from the REQUEST section only",
      waf.request_rule_ids(CATALOGUE) == ["941100", "941110"],
      str(waf.request_rule_ids(CATALOGUE)))
check("a group with no rules does not break the walk",
      waf.response_rule_ids([{"name": "RESPONSE", "ruleGroups": [
          {"code": "980", "rules": None}]}]) == [])

print("\nbisection")


def search(rules, culprit):
    """Run the search against a world where exactly `culprit` blocks."""
    probes = []

    def passes(subset):
        probes.append(len(subset))
        return culprit in subset  # excluded -> the url is served

    return waf.bisect(rules, passes), probes


RULES = [str(900 + i) for i in range(55)]

# One wrong answer here is a rule written into a live zone that does not fix
# anything, so every position gets its own run rather than a sampled few.
wrong = [c for c in RULES if search(RULES, c)[0] != c]
check("every one of the 55 positions is found", not wrong,
      f"missed: {wrong[:5]}")

# rounds_needed is the worst case, not a fixed count: how many rounds a search
# actually takes depends on which half the culprit sits in. The first version of
# this test asserted equality and went red on a run that took five - so the
# bound is what gets pinned, from every position.
costs = [len(search(RULES, c)[1]) for c in RULES]
check("no position costs more than the advertised bound",
      max(costs) <= waf.rounds_needed(55) == 6, f"worst was {max(costs)}")
check("55 candidates cost a handful of probes, not 55",
      max(costs) <= 6 and min(costs) >= 4, f"costs ranged {min(costs)}..{max(costs)}")

check("a single candidate needs no probe at all",
      search(["950130"], "950130") == ("950130", []))
check("an empty candidate list answers None, not a crash",
      waf.bisect([], lambda subset: True) is None)

for size in (1, 2, 3, 7, 8, 9, 16, 17, 260):
    rules = [str(n) for n in range(size)]
    misses = [c for c in rules if search(rules, c)[0] != c]
    check(f"size {size}: every position found", not misses, f"missed {misses[:3]}")

print()
if failed:
    print(f"{failed} проверок не прошло")
    sys.exit(1)
print("все проверки прошли")
