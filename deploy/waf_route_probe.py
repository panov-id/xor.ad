#!/usr/bin/env python3
"""Ask whether blocking would cut a route, by opening a short window and trying.

    python3 deploy/waf_route_probe.py --zone xorad-api-prod
    python3 deploy/waf_route_probe.py --zone xorad-api-prod --apply

G13 was written as "read the WAF log", and there is no log to read. The question
underneath it - would switching this zone to blocking cut the Article 16 intake
or panel sign-in - is answerable directly: open blocking for a few seconds, send
the requests, read the codes, close it. That is how it was answered on
2026-09-03, and the answer was no, neither is cut.

Every probe is chosen so that production is not changed by asking:

- /report goes with a target_kind that does not exist. The route checks the
  kind before it touches the database or the mailer
  (relay/node/src/routes/report.ts), so the node answers 422 and stores
  nothing. This matters more than it sounds: the first version of this probe
  used a real kind, the node accepted it as a genuine Article 16 notice, and a
  row with an injection string in its reason had to be decided by hand in the
  panel afterwards.
- /auth/request-link goes to an address at .invalid, which can hold no mailbox
  and has no panel access.
- The control carries an obvious injection string and the same non-existent
  kind. Under blocking it MUST come back 403; if it does not, the WAF is not
  inspecting these requests and a clean result from the other two would mean
  nothing.

Without --apply the window is not opened: the routes are probed as the zone
stands, so the baseline can be seen before anything is switched.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))

BLOCK = 1
NOTICE = ("The offer at this address is selling counterfeit goods and the "
          "listing text copies a registered trademark word for word. Please "
          "examine it under Article 16.")
NOT_A_KIND = "waf_probe_not_a_kind"
INJECTION = "' OR 1=1-- UNION SELECT username, password FROM users--"


# ---------------------------------------------------------------- pure part --

def verdict(control, results):
    """What a set of probe codes means, given what the control did.

    `results` is {label: status}. Returns (conclusive, lines). The point of the
    split is that "nothing was cut" is only a finding when the control proves
    the WAF was looking; otherwise it is the absence of a measurement, and this
    says so instead of reporting a green.
    """
    if control != 403:
        return False, [
            f"the control answered {control}, not 403 — blocking is not "
            f"cutting even an obvious injection, so nothing here can be "
            f"concluded about these routes"]
    lines = ["control 403: the WAF is inspecting these requests"]
    for label, code in results.items():
        lines.append(f"{label}: " + ("CUT by the WAF" if code == 403
                                     else f"passed ({code})"))
    return True, lines


# ------------------------------------------------------------------- network --

def post(base, path, body, label, origin):
    data = json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method="POST", headers={
        "content-type": "application/json", "origin": origin,
        "accept": "application/json",
        "user-agent": "xorad-waf-probe/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            code, text = response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        code, text = exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - a probe reports, it does not fail
        code, text = 0, repr(exc)
    print(f"  {label:8} {path:22} -> {code:>3} "
          f"({'WAF' if code == 403 else 'node'})  {' '.join(text.split())[:100]}")
    return code


def probes(base, origin):
    report = post(base, "/report", {
        "target_kind": NOT_A_KIND,
        "target_id": "00000000-0000-0000-0000-000000000000",
        "reason_text": NOTICE, "notifier_name": "WAF probe",
        "notifier_email": "waf-probe@example.invalid",
        "bona_fide": True, "brand": "xor", "source": "waf-probe",
    }, "report", origin)
    login = post(base, "/auth/request-link",
                 {"email": "waf-probe@example.invalid"}, "login", origin)
    control = post(base, "/report", {
        "target_kind": NOT_A_KIND, "reason_text": INJECTION, "bona_fide": True,
    }, "control", origin)
    return report, login, control


def main():
    from waf_rule_search import BLOCK as BLOCKING, env, read_zone, write_zone, zone_id

    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="deploy/.env.deploy")
    parser.add_argument("--zone", default="xorad-api-prod")
    parser.add_argument("--base", default="https://api.relay.panov.id")
    parser.add_argument("--origin", default="https://xor.panov.id")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    key = env(args.env)["BUNNY_API_KEY"]
    sid = zone_id(key, args.zone)
    before = read_zone(key, sid)
    saved_mode = before.get("wafExecutionMode")
    saved_rules = [str(r) for r in (before.get("wafLogOnlyRules") or [])]

    print(f"zone {args.zone} shieldZoneId={sid}")
    print(f"  current: wafExecutionMode={saved_mode} "
          f"logOnly={saved_rules or '[]'}")
    print(f"  restore on exit: mode={saved_mode} rules={saved_rules or '[]'}")

    print("\n=== baseline, the zone as it stands ===")
    probes(args.base, args.origin)
    if not args.apply:
        print("\n  --apply not given: the blocking window was not opened.")
        return

    try:
        print("\n=== opening the blocking window ===")
        write_zone(key, sid, BLOCKING, [])
        time.sleep(5)
        report, login, control = probes(args.base, args.origin)
        print("\n=== verdict ===")
        _, lines = verdict(control, {"POST /report": report,
                                     "POST /auth/request-link": login})
        for line in lines:
            print(f"  {line}")
    finally:
        print("\n=== closing the window ===")
        back = write_zone(key, sid, saved_mode, saved_rules)
        print(f"  wafExecutionMode={back.get('wafExecutionMode')} "
              f"wafLogOnlyRules={back.get('wafLogOnlyRules')}")
        print("\n=== after restore ===")
        probes(args.base, args.origin)


if __name__ == "__main__":
    main()
