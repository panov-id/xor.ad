"""
Add the dev/uat CNAME records for the xor.ad faces to panov.id via the Namecheap API.

Safe by design: Namecheap's setHosts REPLACES all host records, so this script
first reads the existing hosts (getHosts), merges our CNAMEs in (replacing only
same-name entries), prints the plan, and writes only with --apply.

Usage (inside deploy/namecheap-dns.sh):
    python3 namecheap-dns.py <dev|uat> [--apply]

Reads Namecheap creds from the environment (see deploy/.env.deploy):
    NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME,
    NAMECHEAP_CLIENT_IP (blank = auto-detect), NAMECHEAP_SANDBOX (true/false)
"""
import os
import sys
import xml.etree.ElementTree as ET

import requests

DOMAIN = "panov.id"          # SLD=panov, TLD=id
SLD, TLD = DOMAIN.split(".", 1)
FACES = ["sosed", "neighbro"]


def records_for(env):
    """(host, cname-target) pairs for one environment, mirroring deploy/wizard.py."""
    sfx = f"-{env}"
    recs = []
    for face in FACES:
        recs.append((f"{env}.{face}", f"{face}{sfx}.b-cdn.net"))
        recs.append((f"api.{env}.{face}", f"{face}-api{sfx}.b-cdn.net"))
    recs.append((f"{env}.xor", f"panel{sfx}.b-cdn.net"))
    return recs


def api_base():
    sandbox = os.environ.get("NAMECHEAP_SANDBOX", "false").lower() == "true"
    host = "api.sandbox.namecheap.com" if sandbox else "api.namecheap.com"
    return f"https://{host}/xml.response"


def client_ip():
    ip = os.environ.get("NAMECHEAP_CLIENT_IP", "").strip()
    if ip:
        return ip
    return requests.get("https://api.ipify.org", timeout=10).text.strip()


def creds(ip):
    return {
        "ApiUser": os.environ["NAMECHEAP_API_USER"],
        "ApiKey": os.environ["NAMECHEAP_API_KEY"],
        "UserName": os.environ.get("NAMECHEAP_USERNAME") or os.environ["NAMECHEAP_API_USER"],
        "ClientIp": ip,
    }


def strip_ns(tag):
    return tag.split("}", 1)[-1]


def call(params, ip):
    p = dict(creds(ip)); p.update(params)
    r = requests.get(api_base(), params=p, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    status = root.attrib.get("Status", "")
    if status != "OK":
        errs = [e.text for e in root.iter() if strip_ns(e.tag) == "Error"]
        raise SystemExit(f"Namecheap API error: {errs or r.text[:400]}")
    return root


def get_hosts(ip):
    root = call({"Command": "namecheap.domains.dns.getHosts", "SLD": SLD, "TLD": TLD}, ip)
    hosts = []
    for el in root.iter():
        if strip_ns(el.tag) == "host":
            a = el.attrib
            hosts.append({
                "Name": a.get("Name", ""),
                "Type": a.get("Type", ""),
                "Address": a.get("Address", ""),
                "MXPref": a.get("MXPref", "10"),
                "TTL": a.get("TTL", "1800"),
            })
    return hosts


def set_hosts(hosts, ip):
    params = {"Command": "namecheap.domains.dns.setHosts", "SLD": SLD, "TLD": TLD}
    for i, h in enumerate(hosts, 1):
        params[f"HostName{i}"] = h["Name"]
        params[f"RecordType{i}"] = h["Type"]
        params[f"Address{i}"] = h["Address"]
        params[f"MXPref{i}"] = h.get("MXPref", "10")
        params[f"TTL{i}"] = h.get("TTL", "1800")
    call(params, ip)


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    env = next((a for a in args if a in ("dev", "uat", "prod")), None)
    if not env:
        raise SystemExit("Usage: namecheap-dns.py <dev|uat|prod> [--apply]")

    ip = client_ip()
    print(f"Domain: {DOMAIN}  ·  ClientIp (must be whitelisted in Namecheap): {ip}")
    wanted = records_for(env)

    existing = get_hosts(ip)
    by_key = {(h["Name"], h["Type"]): h for h in existing}
    print(f"\nExisting host records: {len(existing)}")

    merged = list(existing)
    added, replaced = [], []
    for name, target in wanted:
        rec = {"Name": name, "Type": "CNAME", "Address": target, "MXPref": "10", "TTL": "1800"}
        # drop any existing record at the same name (CNAME can't coexist), then add ours
        before = len(merged)
        merged = [h for h in merged if h["Name"] != name]
        (replaced if before != len(merged) else added).append((name, target))
        merged.append(rec)

    print(f"\nPlan for [{env}] — CNAMEs on {DOMAIN}:")
    for name, target in wanted:
        flag = "replace" if (name, target) in replaced else "add"
        print(f"  · {name}.{DOMAIN}  →  {target}   ({flag})")

    if not apply:
        print("\n(dry-run) Nothing written. Re-run with --apply to save via setHosts.")
        return

    print("\nWriting merged host set via setHosts…")
    set_hosts(merged, ip)
    print(f"✓ Done. {len(merged)} total host records now on {DOMAIN}.")


if __name__ == "__main__":
    main()
