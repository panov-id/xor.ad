#!/usr/bin/env python3
"""The route probe's verdict, without a key and without a network.

    python3 deploy/test_waf_route_probe.py

One thing is worth pinning here, and it is not the happy path. "Neither route
was cut" is a conclusion only when the control proves the WAF was looking at
them at all; without that it is the absence of a measurement wearing the same
words. A verdict that quietly stopped distinguishing the two would read as good
news either way - which is exactly the failure this guards.

The probe bodies are pinned too: the kind must be one the node refuses before
it writes anything. When it was a real kind, production got a genuine Article
16 notice out of a measurement (2026-09-03).
"""

import pathlib
import sys
import types

# Compiled from source rather than loaded by spec: the bytecode cache decides
# from mtime and size, and on 2026-09-03 that let a stale .pyc answer for a file
# that had already been restored. See test_waf_rule_search.py.
MODULE = pathlib.Path(__file__).with_name("waf_route_probe.py")
probe = types.ModuleType("waf_route_probe")
probe.__file__ = str(MODULE)
exec(compile(MODULE.read_text(), str(MODULE), "exec"), probe.__dict__)

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name}{(' — ' + detail) if detail else ''}")


print("verdict")

conclusive, lines = probe.verdict(403, {"POST /report": 422,
                                        "POST /auth/request-link": 204})
check("a 403 control makes the run conclusive", conclusive)
check("a route that answered 422 is reported as passed",
      any("passed (422)" in line for line in lines), str(lines))
check("the control is named in the output, not assumed",
      any("control 403" in line for line in lines), str(lines))

conclusive, lines = probe.verdict(403, {"POST /report": 403,
                                        "POST /auth/request-link": 204})
check("a route that answered 403 is reported as cut",
      conclusive and any("CUT by the WAF" in line for line in lines), str(lines))

# The heart of it: same clean routes, but the control never fired.
for control in (422, 200, 0, 429):
    conclusive, lines = probe.verdict(control, {"POST /report": 422,
                                                "POST /auth/request-link": 204})
    check(f"control {control}: clean routes are NOT reported as a finding",
          not conclusive, str(lines))
    check(f"control {control}: the output says why nothing is concluded",
          any("nothing here can be concluded" in line for line in lines),
          str(lines))

print("\nprobe bodies")
check("the probed kind is not one the node accepts",
      probe.NOT_A_KIND not in
      {"feed_message", "offer", "table_line", "chat", "other"},
      probe.NOT_A_KIND)
check("the notifier address cannot receive mail",
      "@example.invalid" in "waf-probe@example.invalid")

print()
if failed:
    print(f"{failed} проверок не прошло")
    sys.exit(1)
print("все проверки прошли")
