#!/usr/bin/env python3
"""Exercise apply-edge-headers.py against canned zone payloads. No network.

    python3 deploy/test_apply_edge_headers.py

`call` is replaced with a stub, so nothing reaches Bunny. What is under test is
the part that decides which rule to write and when to refuse — every case here
is one that used to be a traceback, a silent overwrite, or a second rule nobody
noticed until the panel went blank.

Every guard in this file has been broken on a copy and watched go red. A test
that has never failed proves nothing.
"""

import contextlib
import importlib.util
import io
import json
import os
import sys

MODULE = os.environ.get(
    "MODULE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "apply-edge-headers.py"),
)

spec = importlib.util.spec_from_file_location("apply_edge_headers", MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

OURS = "security headers (managed by the deploy)"

HEADERS = {
    "headers": [
        {"name": "Content-Security-Policy", "value": "default-src 'self'"},
        {"name": "X-Frame-Options", "value": "DENY"},
    ],
    "counted": {"pages": 1, "inline_scripts": 1},
}


def run_remove(zone):
    """Run main() in --remove mode, returning (exit code, output, calls made)."""
    calls = []

    def stub(method, path, body=None):
        calls.append((method, path))
        return zone if method == "GET" else {}

    module.call = stub
    module.KEY = "test-key"
    os.environ["BUNNY_API_KEY"] = "test-key"
    os.environ["HEADERS_JSON"] = json.dumps(HEADERS)
    sys.argv = ["apply-edge-headers.py", "--remove", "42"]

    output = io.StringIO()
    code = 0
    with contextlib.redirect_stdout(output):
        try:
            module.main()
        except SystemExit as exit_signal:
            code = exit_signal.code if exit_signal.code is not None else 0
        except Exception as error:  # noqa: BLE001
            code = f"EXCEPTION {type(error).__name__}: {error}"
    return code, output.getvalue(), calls


def run(zone, headers_json=None):
    """Run main() over a canned zone. Returns (exit code, output, posted bodies)."""
    posted = []

    def stub(method, path, body=None):
        if method == "GET":
            return zone
        posted.append(body)
        return {}

    module.call = stub
    module.KEY = "test-key"
    os.environ["BUNNY_API_KEY"] = "test-key"
    os.environ["HEADERS_JSON"] = headers_json if headers_json is not None else json.dumps(HEADERS)
    sys.argv = ["apply-edge-headers.py", "42"]

    output = io.StringIO()
    code = 0
    with contextlib.redirect_stdout(output):
        try:
            module.main()
        except SystemExit as exit_signal:
            code = exit_signal.code if exit_signal.code is not None else 0
        except Exception as error:  # noqa: BLE001 — a crash is a failure and must read as one
            code = f"EXCEPTION {type(error).__name__}: {error}"
    return code, output.getvalue(), posted


failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def refused(code, text):
    return isinstance(code, str) and text in code


# An empty zone: the rule is created, and the counts reach the log.
code, out, posted = run({"EdgeRules": []})
check("empty zone creates the rule",
      code == 0 and len(posted) == 1 and posted[0]["Guid"] is None,
      f"exit {code}, {len(posted)} posted")
check("counted is printed", '"inline_scripts": 1' in out, out.strip())
check("one action plus one extra",
      bool(posted) and len(posted[0]["ExtraActions"]) == 1, "wrong rule shape")

# Our rule already there: updated in place, not added beside.
code, out, posted = run({"EdgeRules": [
    {"Guid": "abc", "Description": OURS,
     "ActionType": 5, "ActionParameter1": "Content-Security-Policy"},
]})
check("existing rule is updated by Guid",
      code == 0 and bool(posted) and posted[0]["Guid"] == "abc", f"exit {code}")
check("says updated", "updated" in out, out.strip())

# A JSON null is not an absent key. `.get(name, [])` covered only the second, and
# the first gave `for item in None`.
code, out, posted = run({"EdgeRules": None})
check("EdgeRules: null does not crash", code == 0 and len(posted) == 1, f"exit {code}")

code, out, posted = run({})
check("EdgeRules absent does not crash", code == 0 and len(posted) == 1, f"exit {code}")

# Two rules of ours: load order would decide which wins, and two policies make
# the browser apply the intersection. Refuse rather than guess.
code, out, posted = run({"EdgeRules": [
    {"Guid": "a", "Description": OURS},
    {"Guid": "b", "Description": OURS},
]})
check("duplicates are refused", refused(code, "2 rules"), repr(code))
check("duplicates post nothing", not posted, f"{len(posted)} posted")

# Somebody else's rule setting a header we set.
code, out, posted = run({"EdgeRules": [
    {"Guid": "x", "Description": "legacy CSP", "ActionType": 5,
     "ActionParameter1": "Content-Security-Policy", "ActionParameter2": "default-src *"},
]})
check("a foreign rule setting our header is refused", refused(code, "legacy CSP"), repr(code))
check("a foreign rule posts nothing", not posted, f"{len(posted)} posted")

# The same, hidden in ExtraActions rather than in the head action.
code, out, posted = run({"EdgeRules": [
    {"Guid": "x", "Description": "misc", "ActionType": 3,
     "ExtraActions": [{"ActionType": 5, "ActionParameter1": "X-Frame-Options"}]},
]})
check("a header inside ExtraActions is seen", refused(code, "misc"), repr(code))

# A storefront's rule on a shared zone: the description starts like ours but is
# not ours. Matching by prefix adopted and overwrote it silently.
code, out, posted = run({"EdgeRules": [
    {"Guid": "z", "Description": "security headers (managed by deploy-landing.sh)",
     "ActionType": 5, "ActionParameter1": "Content-Security-Policy",
     "ActionParameter2": "default-src 'self'"},
]})
check("a lookalike description is not adopted", refused(code, "deploy-landing.sh"), repr(code))
check("a lookalike description posts nothing", not posted, f"{len(posted)} posted")

# An unrelated rule is left alone.
code, out, posted = run({"EdgeRules": [
    {"Guid": "y", "Description": "redirect /index.html", "ActionType": 2},
]})
check("an unrelated rule does not block us", code == 0 and len(posted) == 1, repr(code))

# Malformed input says what is wrong instead of raising.
code, out, posted = run({"EdgeRules": []}, headers_json='{"nope": 1}')
check("malformed HEADERS_JSON is refused legibly",
      refused(code, "not what this expects"), repr(code))

# --- taking the policy off -----------------------------------------------------
#
# Rolling back by code recomputes the headers from an older dist, which fixes a
# policy that is wrong for those bytes. It fixes nothing when the builder itself
# is wrong: every version then produces the same broken policy, and the page is
# blank in production and fine everywhere else. There was no way out of that at
# all — no delete, no disable, no flag — so the only move was the Bunny console,
# and the next deploy put the rule back.

code, out, calls = run_remove({"EdgeRules": [
    {"Guid": "abc", "Description": OURS},
    {"Guid": "other", "Description": "somebody else's rule"},
]})
check("--remove deletes our rule", ("DELETE", "/pullzone/42/edgerules/abc") in calls, str(calls))
check("--remove leaves other rules alone",
      not any(path.endswith("/other") for _, path in calls), str(calls))
check("--remove purges, so the change is visible now",
      ("POST", "/pullzone/42/purgeCache") in calls, str(calls))
check("--remove writes no rule", not any("addOrUpdate" in path for _, path in calls), str(calls))
check("--remove exits cleanly", code == 0, repr(code))

code, out, calls = run_remove({"EdgeRules": []})
check("--remove on a zone without our rule says so and stops",
      code == 0 and "nothing to remove" in out and not calls[1:], out.strip())

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("apply-edge-headers: every case passed")
