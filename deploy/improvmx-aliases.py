#!/usr/bin/env python3
"""Create an ImprovMX domain and point aliases via the ImprovMX API.

Auth is HTTP Basic with user "api" and the API key as the password.
Env: IMPROVMX_API_KEY.

Usage (in a container):
  python3 improvmx-aliases.py <domain> [<default-forward>] <alias-or-pair> [...] [--drop-catchall]

Each alias token is either a bare name (forwarded to <default-forward>) or a
"name=forward" pair with its own destination. The optional <default-forward> is
the first token after <domain> that looks like an address (has "@", no "=").
Adds the domain (idempotent), creates each <alias>@<domain> -> <forward>,
optionally deletes the auto-created catch-all "*" alias, then lists the result.
"""
import os
import sys

import requests

BASE = "https://api.improvmx.com/v3"


def main() -> None:
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit("Usage: improvmx-aliases.py <domain> [<default-forward>] <alias-or-pair>... [--drop-catchall]")

    domain, rest = args[0], args[1:]
    default_forward = None
    if rest and "@" in rest[0] and "=" not in rest[0]:
        default_forward, rest = rest[0], rest[1:]

    pairs: list[tuple[str, str]] = []
    for token in rest:
        if "=" in token:
            name, forward = token.split("=", 1)
        elif default_forward:
            name, forward = token, default_forward
        else:
            sys.exit(f"alias '{token}' has no forward and no <default-forward> was given")
        pairs.append((name, forward))
    if not pairs:
        sys.exit("no aliases given")

    key = os.environ.get("IMPROVMX_API_KEY")
    if not key:
        sys.exit("Missing IMPROVMX_API_KEY")
    auth = ("api", key)

    r = requests.post(f"{BASE}/domains/", auth=auth, json={"domain": domain})
    print(f"domain {domain}: {'ok' if r.ok else r.text}")

    for name, forward in pairs:
        r = requests.post(
            f"{BASE}/domains/{domain}/aliases/", auth=auth,
            json={"alias": name, "forward": forward},
        )
        print(f"  alias {name}@{domain} -> {forward}: {'ok' if r.ok else r.text}")

    if "--drop-catchall" in flags:
        r = requests.delete(f"{BASE}/domains/{domain}/aliases/*", auth=auth)
        print(f"  drop catch-all: {'ok' if r.ok else r.text}")

    r = requests.get(f"{BASE}/domains/{domain}/aliases/", auth=auth)
    print("final aliases:")
    for a in r.json().get("aliases", []):
        print(f"  {a['alias']}@{domain} -> {a['forward']}")


if __name__ == "__main__":
    main()
