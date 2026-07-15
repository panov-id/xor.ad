"""
Bunny DNS — register nodes and (at cutover) build the geo-steered pool record.

Two distinct things:
  set_a       one A record `name -> ip` (a node's OWN hostname, e.g. n1.<face>).
              Needed BEFORE configure so Caddy/Let's Encrypt can validate.
  pool_add    add an A member with geolocation to the pool name (api.<face>) so
              Bunny returns the nearest healthy node. This is the CUTOVER action
              and must not run against the live api.* until you mean it.

Auth: BUNNY_API_KEY (account API key) in the wizard env. Plain REST, no SDK.
"""
from __future__ import annotations

import os

import requests

API = "https://api.bunny.net"
TIMEOUT = 20
TYPE_A = 0
# Bunny SmartRoutingType: 0 None, 1 Latency, 2 Geolocation (verify at use).
SMART_GEO = 2


def _headers() -> dict:
    key = os.environ.get("BUNNY_API_KEY")
    if not key:
        raise RuntimeError("BUNNY_API_KEY not set")
    return {"AccessKey": key, "content-type": "application/json", "accept": "application/json"}


def find_zone(hostname: str) -> dict:
    """Return the Bunny DNS zone whose domain is the longest suffix of hostname."""
    r = requests.get(f"{API}/dnszone", headers=_headers(),
                     params={"page": 1, "perPage": 1000}, timeout=TIMEOUT)
    r.raise_for_status()
    zones = r.json().get("Items", [])
    matches = [z for z in zones if hostname == z["Domain"] or hostname.endswith("." + z["Domain"])]
    if not matches:
        raise RuntimeError(f"no Bunny DNS zone covers {hostname}")
    return max(matches, key=lambda z: len(z["Domain"]))


def _subdomain(hostname: str, domain: str) -> str:
    if hostname == domain:
        return ""
    return hostname[: -(len(domain) + 1)]


def _get_zone(zone_id: int) -> dict:
    r = requests.get(f"{API}/dnszone/{zone_id}", headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _put(zone_id: int, body: dict) -> None:
    r = requests.put(f"{API}/dnszone/{zone_id}/records", headers=_headers(), json=body, timeout=TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"bunny dns create: {r.status_code} {r.text}")


def _post(zone_id: int, record_id: int, body: dict) -> None:
    r = requests.post(f"{API}/dnszone/{zone_id}/records/{record_id}", headers=_headers(),
                      json=body, timeout=TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"bunny dns update: {r.status_code} {r.text}")


def set_a(zone: dict, name: str, ip: str, ttl: int = 60) -> str:
    """Ensure a single A record `name -> ip` (create or update). For node hostnames."""
    records = _get_zone(zone["Id"]).get("Records", [])
    body = {"Type": TYPE_A, "Name": name, "Value": ip, "Ttl": ttl}
    same = [r for r in records if r["Type"] == TYPE_A and r["Name"] == name]
    if same:
        _post(zone["Id"], same[0]["Id"], body)
        return "updated"
    _put(zone["Id"], body)
    return "created"


def pool_add(zone: dict, name: str, ip: str, lat: float | None, lon: float | None,
             ttl: int = 60) -> str:
    """Add an A member (name, ip) with optional geolocation to the pool. CUTOVER."""
    records = _get_zone(zone["Id"]).get("Records", [])
    if any(r["Type"] == TYPE_A and r["Name"] == name and r["Value"] == ip for r in records):
        return "present"
    body = {"Type": TYPE_A, "Name": name, "Value": ip, "Ttl": ttl}
    if lat is not None and lon is not None:
        body.update({"GeolocationLatitude": lat, "GeolocationLongitude": lon,
                     "SmartRoutingType": SMART_GEO})
    _put(zone["Id"], body)
    return "added"


# exported for wizard
def subdomain(hostname: str, domain: str) -> str:
    return _subdomain(hostname, domain)
