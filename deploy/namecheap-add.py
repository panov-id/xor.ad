"""
Add arbitrary DNS records (from a JSON file) to a Namecheap domain, preserving
existing host records. Safe: getHosts → merge → setHosts, dry-run unless --apply.

Records JSON: either a list of {name,type,value,priority?,ttl?} or a Resend
domain payload {records:[{name,type,value,priority,ttl}]}.

Env (same as namecheap-dns.py): NAMECHEAP_API_USER/API_KEY/USERNAME/CLIENT_IP/SANDBOX.
Usage (in a container): python3 namecheap-add.py <domain> <records.json> [--apply]
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

import requests


def api_base():
    sandbox = os.environ.get("NAMECHEAP_SANDBOX", "false").lower() == "true"
    return f"https://{'api.sandbox' if sandbox else 'api'}.namecheap.com/xml.response"


def client_ip():
    ip = os.environ.get("NAMECHEAP_CLIENT_IP", "").strip()
    return ip or requests.get("https://api.ipify.org", timeout=10).text.strip()


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
    r = requests.get(api_base(), params=p, timeout=30); r.raise_for_status()
    root = ET.fromstring(r.text)
    if root.attrib.get("Status") != "OK":
        errs = [e.text for e in root.iter() if strip_ns(e.tag) == "Error"]
        raise SystemExit(f"Namecheap API error: {errs or r.text[:400]}")
    return root


def get_hosts(sld, tld, ip):
    root = call({"Command": "namecheap.domains.dns.getHosts", "SLD": sld, "TLD": tld}, ip)
    hosts, email_type = [], "NONE"
    for el in root.iter():
        t = strip_ns(el.tag)
        if t == "DomainDNSGetHostsResult":
            email_type = el.attrib.get("EmailType", email_type)
        if t == "host":
            a = el.attrib
            hosts.append({"Name": a.get("Name", ""), "Type": a.get("Type", ""),
                          "Address": a.get("Address", ""), "MXPref": a.get("MXPref", "10"),
                          "TTL": a.get("TTL", "1800")})
    return hosts, email_type


def set_hosts(sld, tld, hosts, email_type, ip):
    params = {"Command": "namecheap.domains.dns.setHosts", "SLD": sld, "TLD": tld, "EmailType": email_type}
    for i, h in enumerate(hosts, 1):
        params[f"HostName{i}"] = h["Name"]; params[f"RecordType{i}"] = h["Type"]
        params[f"Address{i}"] = h["Address"]; params[f"MXPref{i}"] = h.get("MXPref", "10")
        params[f"TTL{i}"] = h.get("TTL", "1800")
    call(params, ip)


def load_records(path):
    d = json.load(open(path))
    recs = d["records"] if isinstance(d, dict) and "records" in d else d
    out = []
    for r in recs:
        out.append({
            "Name": (r.get("name") or "").strip() or "@",
            "Type": (r.get("type") or "").upper(),
            "Address": r.get("value") or r.get("address") or "",
            "MXPref": str(r.get("priority") or r.get("mxpref") or 10),
            "TTL": "1800",
        })
    return out


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    pos = [a for a in args if not a.startswith("--")]
    domain, path = pos[0], pos[1]
    sld, tld = domain.split(".", 1)
    ip = client_ip()
    print(f"Domain: {domain}  ·  ClientIp: {ip}")

    existing, email_type = get_hosts(sld, tld, ip)
    new = load_records(path)
    print(f"Existing records: {len(existing)}  ·  EmailType: {email_type}")

    have = {(h["Name"], h["Type"], h["Address"]) for h in existing}
    merged = list(existing)
    added = []
    for r in new:
        key = (r["Name"], r["Type"], r["Address"])
        if key in have:
            print(f"  · exists, skip: {r['Type']} {r['Name']}")
            continue
        merged.append(r); added.append(r)
        print(f"  + add: {r['Type']} {r['Name']} = {r['Address'][:60]}{'…' if len(r['Address'])>60 else ''}"
              + (f" (pref {r['MXPref']})" if r['Type'] == 'MX' else ""))

    # EmailType: honour an explicit --email-type override (e.g. keep FWD so root
    # forwarding survives); otherwise switch to MX when adding MX records.
    override = next((a.split("=", 1)[1] for a in args if a.startswith("--email-type=")), None)
    if override:
        email_type = override
        print(f"  (keeping EmailType={email_type} as requested)")
    elif any(r["Type"] == "MX" for r in added) and email_type != "MX":
        email_type = "MX"
        print("  (setting EmailType=MX for custom mail records)")

    if not added:
        print("Nothing to add.")
        return
    if not apply:
        print(f"\n(dry-run) would write {len(merged)} records. Re-run with --apply.")
        return
    set_hosts(sld, tld, merged, email_type, ip)
    print(f"✓ Done. {len(merged)} total records on {domain}.")


if __name__ == "__main__":
    main()
