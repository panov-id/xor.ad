#!/usr/bin/env python3
"""Create an ImprovMX domain and point aliases via the ImprovMX API.

Auth is HTTP Basic with user "api" and the API key as the password.
Env: IMPROVMX_API_KEY.

Usage (in a container):
  python3 improvmx-aliases.py <domain> <forward-address> <alias> [<alias> ...] [--drop-catchall]

Adds the domain (idempotent), creates each <alias>@<domain> -> <forward-address>,
optionally deletes the auto-created catch-all "*" alias, then lists the result.
"""
import os
import sys

import requests

BASE = "https://api.improvmx.com/v3"


def main() -> None:
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 3:
        sys.exit("Usage: improvmx-aliases.py <domain> <forward> <alias> [<alias>...] [--drop-catchall]")

    domain, forward, aliases = args[0], args[1], args[2:]
    key = os.environ.get("IMPROVMX_API_KEY")
    if not key:
        sys.exit("Missing IMPROVMX_API_KEY")
    auth = ("api", key)

    r = requests.post(f"{BASE}/domains/", auth=auth, json={"domain": domain})
    print(f"domain {domain}: {'ok' if r.ok else r.text}")

    for alias in aliases:
        r = requests.post(
            f"{BASE}/domains/{domain}/aliases/", auth=auth,
            json={"alias": alias, "forward": forward},
        )
        print(f"  alias {alias}@{domain} -> {forward}: {'ok' if r.ok else r.text}")

    if "--drop-catchall" in flags:
        r = requests.delete(f"{BASE}/domains/{domain}/aliases/*", auth=auth)
        print(f"  drop catch-all: {'ok' if r.ok else r.text}")

    r = requests.get(f"{BASE}/domains/{domain}/aliases/", auth=auth)
    print("final aliases:")
    for a in r.json().get("aliases", []):
        print(f"  {a['alias']}@{domain} -> {a['forward']}")


if __name__ == "__main__":
    main()
