#!/usr/bin/env python3
# Point sosed.place at Bunny prod for go-live, PRESERVING email (MX/SPF/DKIM).
# apex via ALIAS (address-type, coexists with MX); www via CNAME. No api record
# (the landing talks to the shared relay pool api.relay.panov.id, not api.sosed.place).
# Falls back to a URL-redirect apex if Namecheap rejects ALIAS.
# Requires NAMECHEAP_CLIENT_IP to be a Namecheap-whitelisted IP.
import os, sys, requests, xml.etree.ElementTree as ET

U = "https://api.namecheap.com/xml.response"
base = {
    "ApiUser": os.environ["NAMECHEAP_API_USER"], "ApiKey": os.environ["NAMECHEAP_API_KEY"],
    "UserName": os.environ.get("NAMECHEAP_USERNAME") or os.environ["NAMECHEAP_API_USER"],
    "ClientIp": os.environ["NAMECHEAP_CLIENT_IP"],
}
BUNNY_LANDING = "sosed-prod.b-cdn.net"
NS = None

def call(params):
    global NS
    r = requests.get(U, params={**base, **params}, timeout=60)
    root = ET.fromstring(r.text)
    NS = {"n": root.tag.split("}")[0].strip("{")}
    err = root.findall(".//n:Errors/n:Error", NS)
    if err and err[0].text:
        return None, err[0].text
    return root, None

root, err = call({"Command": "namecheap.domains.dns.getHosts", "SLD": "sosed", "TLD": "place"})
if err: sys.exit("getHosts error: " + err)
hosts = [h.attrib for h in root.findall(".//n:host", NS)]

# Keep everything except the parking www CNAME and the apex URL redirect (we replace those).
keep = [a for a in hosts if not (
    (a.get("Type") == "CNAME" and a.get("Name") == "www") or
    (a.get("Type") in ("URL", "URL301", "FRAME") and a.get("Name") == "@")
)]

def build(apex_mode):
    recs = list(keep)
    if apex_mode == "ALIAS":
        recs.append({"Type": "ALIAS", "Name": "@", "Address": BUNNY_LANDING + ".", "TTL": "300"})
        recs.append({"Type": "CNAME", "Name": "www", "Address": BUNNY_LANDING + "."})
    else:  # redirect fallback: serve on www, 301 apex -> www
        recs.append({"Type": "CNAME", "Name": "www", "Address": BUNNY_LANDING + "."})
        recs.append({"Type": "URL301", "Name": "@", "Address": "https://www.sosed.place/"})
    return recs

def apply(recs):
    p = {"Command": "namecheap.domains.dns.setHosts", "SLD": "sosed", "TLD": "place", "EmailType": "MX"}
    for i, a in enumerate(recs, 1):
        p[f"HostName{i}"] = a.get("Name"); p[f"RecordType{i}"] = a.get("Type")
        p[f"Address{i}"] = a.get("Address"); p[f"TTL{i}"] = a.get("TTL") or "1800"
        if a.get("Type") == "MX": p[f"MXPref{i}"] = a.get("MXPref") or "10"
    root, err = call(p)
    if err: return False, err
    res = root.find(".//n:DomainDNSSetHostsResult", NS)
    return (res is not None and res.attrib.get("IsSuccess") == "true"), None

ok, err = apply(build("ALIAS"))
mode = "ALIAS (apex served directly)"
if not ok:
    print(f"ALIAS rejected ({err}); falling back to www + apex 301 redirect")
    ok, err = apply(build("REDIRECT"))
    mode = "www served, apex 301 -> www"

print("setHosts IsSuccess:", ok, "| mode:", mode, ("| err: " + str(err)) if err else "")
