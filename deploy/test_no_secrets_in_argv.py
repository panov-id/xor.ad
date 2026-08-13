#!/usr/bin/env python3
"""Check that no deploy script hands a secret to python on the command line.

    python3 deploy/test_no_secrets_in_argv.py

An argument is visible in `ps` to every local account for the life of the call,
and is the first thing to end up in a traceback. The keys therefore travel
through the environment — and moving them is the kind of change that quietly
shifts an argument index, which no syntax check would catch.

So this does two things. It scans every deploy script for a secret passed as an
argument, and it executes each embedded python block with urlopen replaced by
something that raises: everything up to the first request — which is all of the
argument handling — really runs, and nothing leaves the machine.
"""

import os
import pathlib
import re
import sys
import urllib.request

DEPLOY = pathlib.Path(__file__).parent

# script -> (arguments after the program name, environment it now expects)
CASES = {
    "bunny-api-cutover.sh": (
        ["zone", "host.example", "example.com", "1.2.3.4", "status"], {"BUNNY_API_KEY": "k"}),
    "bunny-api-origin-token.sh": (
        ["zone", ""], {"BUNNY_API_KEY": "k", "ORIGIN_TOKEN": "t"}),
    "bunny-api-zone.sh": (
        ["zone", "https://origin.example", ""], {"BUNNY_API_KEY": "k"}),
    "bunny-config-cache-rule.sh": (
        ["zone", "host.example", ""], {"BUNNY_API_KEY": "k"}),
    "bunny-seo-index-redirect.sh": (
        [""], {"BUNNY_API_KEY": "k"}),
}

SECRETS = r"BUNNY_API_KEY|BUNNY_STORAGE_API_KEY|GITHUB_TOKEN|ORIGIN_TOKEN|TOKEN|HETZNER_TOKEN"
HEREDOC = re.compile(r"<<'(PY|PYEOF)'\n(.*?)\n(PY|PYEOF)\n", re.S)

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


class Blocked(Exception):
    pass


def blocked(*_args, **_kwargs):
    raise Blocked("the network is not available to this check")


# --- nothing hands a secret to python on a command line ----------------------

offenders = []
for script in sorted(DEPLOY.glob("*.sh")):
    for number, line in enumerate(script.read_text(encoding="utf-8").splitlines(), 1):
        if "python3 -" in line and re.search(rf'"\${{?({SECRETS})}}?"', line):
            offenders.append(f"{script.name}:{number}")
check("no secret is passed on a command line", not offenders, ", ".join(offenders))

# --- and the argument handling still works -----------------------------------

for name, (argv, environment) in CASES.items():
    script = DEPLOY / name
    blocks = [body for _, body, _ in HEREDOC.findall(script.read_text(encoding="utf-8"))]
    blocks = [block for block in blocks if "urllib" in block]
    if not blocks:
        check(f"{name} has a python block", False, "none found")
        continue

    saved_argv, saved_environment = sys.argv, dict(os.environ)
    saved_urlopen = urllib.request.urlopen
    sys.argv = ["-"] + argv
    os.environ.update(environment)
    urllib.request.urlopen = blocked
    try:
        exec(compile(blocks[0], name, "exec"), {"__name__": "__main__"})
        check(f"{name} parses its arguments", True)
    except (Blocked, SystemExit):
        # Reaching a request, or exiting on purpose, both mean the arguments and
        # the environment were read without complaint.
        check(f"{name} parses its arguments", True)
    except Exception as error:  # noqa: BLE001
        check(f"{name} parses its arguments", False, f"{type(error).__name__}: {error}")
    finally:
        sys.argv = saved_argv
        os.environ.clear()
        os.environ.update(saved_environment)
        urllib.request.urlopen = saved_urlopen

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("deploy scripts: no secret on a command line, and every one still parses")
