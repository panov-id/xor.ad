"""
VPS provisioning per provider. Each provider creates (or finds, idempotently by
name) one server, attaches an SSH key, waits for a public IP, and returns it.

Secrets/config from the wizard environment:
  SSH_PUBLIC_KEY   the public key to attach (so configure() can SSH in afterwards)
  SSH_KEY_NAME     name to register the key under (default "edge-nodes")
  HETZNER_TOKEN | VULTR_API_KEY | DIGITALOCEAN_TOKEN
Per-node provider fields (inventory): location (provider region code),
  server_type/plan/size, image/os_id.

No provider SDKs — plain REST via requests. Can't be exercised here without live
tokens; implemented against each provider's documented v2 API.
"""
from __future__ import annotations

import os
import time

import requests

TIMEOUT = 20
POLL_SECONDS = 5
POLL_TRIES = 40  # ~3.5 min for the IP to appear


class ProviderError(Exception):
    pass


def _need(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ProviderError(f"{name} not set")
    return value


def _pubkey() -> str:
    key = os.environ.get("SSH_PUBLIC_KEY", "").strip()
    if not key:
        raise ProviderError("SSH_PUBLIC_KEY not set (needed to attach a key to the new VPS)")
    return key


def _key_name() -> str:
    return os.environ.get("SSH_KEY_NAME", "edge-nodes")


def _location(node: dict) -> str:
    loc = node.get("location")
    if not loc:
        raise ProviderError(f"{node['id']}: set inventory `location` (provider region code)")
    return loc


def _poll(fn):
    for _ in range(POLL_TRIES):
        result = fn()
        if result:
            return result
        time.sleep(POLL_SECONDS)
    raise ProviderError("timed out waiting for public IP")


# --- Hetzner Cloud ----------------------------------------------------------

def hetzner(node: dict) -> str:
    h = {"Authorization": f"Bearer {_need('HETZNER_TOKEN')}"}
    base = "https://api.hetzner.cloud/v1"
    name = node["hostname"]

    found = requests.get(f"{base}/servers", headers=h, params={"name": name}, timeout=TIMEOUT)
    found.raise_for_status()
    servers = found.json()["servers"]
    if servers:
        ip = servers[0]["public_net"]["ipv4"]["ip"]
        if ip:
            return ip

    # ensure ssh key
    keys = requests.get(f"{base}/ssh_keys", headers=h, params={"name": _key_name()}, timeout=TIMEOUT)
    keys.raise_for_status()
    existing = keys.json()["ssh_keys"]
    if existing:
        key_id = existing[0]["id"]
    else:
        made = requests.post(f"{base}/ssh_keys", headers=h,
                             json={"name": _key_name(), "public_key": _pubkey()}, timeout=TIMEOUT)
        made.raise_for_status()
        key_id = made.json()["ssh_key"]["id"]

    created = requests.post(f"{base}/servers", headers=h, json={
        "name": name,
        "server_type": node.get("server_type", "cx22"),
        "image": os.environ.get("HETZNER_IMAGE", "ubuntu-24.04"),
        "location": _location(node),
        "ssh_keys": [key_id],
        "start_after_create": True,
    }, timeout=TIMEOUT)
    if not created.ok:
        raise ProviderError(f"hetzner create: {created.status_code} {created.text}")
    sid = created.json()["server"]["id"]

    def ip():
        r = requests.get(f"{base}/servers/{sid}", headers=h, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()["server"]["public_net"]["ipv4"]["ip"]

    return _poll(ip)


# --- Vultr ------------------------------------------------------------------

def vultr(node: dict) -> str:
    h = {"Authorization": f"Bearer {_need('VULTR_API_KEY')}"}
    base = "https://api.vultr.com/v2"

    listed = requests.get(f"{base}/instances", headers=h, params={"label": node["hostname"]},
                          timeout=TIMEOUT)
    listed.raise_for_status()
    for inst in listed.json().get("instances", []):
        if inst.get("label") == node["hostname"] and inst.get("main_ip", "0.0.0.0") != "0.0.0.0":
            return inst["main_ip"]

    keys = requests.get(f"{base}/ssh-keys", headers=h, timeout=TIMEOUT)
    keys.raise_for_status()
    match = [k for k in keys.json().get("ssh_keys", []) if k["name"] == _key_name()]
    if match:
        key_id = match[0]["id"]
    else:
        made = requests.post(f"{base}/ssh-keys", headers=h,
                             json={"name": _key_name(), "ssh_key": _pubkey()}, timeout=TIMEOUT)
        made.raise_for_status()
        key_id = made.json()["ssh_key"]["id"]

    os_id = node.get("os_id") or os.environ.get("VULTR_OS_ID")
    if not os_id:
        raise ProviderError(f"{node['id']}: set inventory `os_id` (Vultr Ubuntu os_id)")
    created = requests.post(f"{base}/instances", headers=h, json={
        "region": _location(node),
        "plan": node.get("plan", "vc2-1c-1gb"),
        "os_id": int(os_id),
        "label": node["hostname"],
        "sshkey_id": [key_id],
    }, timeout=TIMEOUT)
    if not created.ok:
        raise ProviderError(f"vultr create: {created.status_code} {created.text}")
    iid = created.json()["instance"]["id"]

    def ip():
        r = requests.get(f"{base}/instances/{iid}", headers=h, timeout=TIMEOUT)
        r.raise_for_status()
        v = r.json()["instance"].get("main_ip", "0.0.0.0")
        return v if v != "0.0.0.0" else None

    return _poll(ip)


# --- DigitalOcean -----------------------------------------------------------

def digitalocean(node: dict) -> str:
    h = {"Authorization": f"Bearer {_need('DIGITALOCEAN_TOKEN')}"}
    base = "https://api.digitalocean.com/v2"

    listed = requests.get(f"{base}/droplets", headers=h, params={"name": node["hostname"]},
                          timeout=TIMEOUT)
    listed.raise_for_status()
    for d in listed.json().get("droplets", []):
        for net in d.get("networks", {}).get("v4", []):
            if net.get("type") == "public":
                return net["ip_address"]

    keys = requests.get(f"{base}/account/keys", headers=h, timeout=TIMEOUT)
    keys.raise_for_status()
    match = [k for k in keys.json().get("ssh_keys", []) if k["name"] == _key_name()]
    if match:
        key_ref = match[0]["id"]
    else:
        made = requests.post(f"{base}/account/keys", headers=h,
                             json={"name": _key_name(), "public_key": _pubkey()}, timeout=TIMEOUT)
        made.raise_for_status()
        key_ref = made.json()["ssh_key"]["id"]

    created = requests.post(f"{base}/droplets", headers=h, json={
        "name": node["hostname"],
        "region": _location(node),
        "size": node.get("plan", "s-1vcpu-1gb"),
        "image": node.get("image", "ubuntu-24-04-x64"),
        "ssh_keys": [key_ref],
    }, timeout=TIMEOUT)
    if not created.ok:
        raise ProviderError(f"digitalocean create: {created.status_code} {created.text}")
    did = created.json()["droplet"]["id"]

    def ip():
        r = requests.get(f"{base}/droplets/{did}", headers=h, timeout=TIMEOUT)
        r.raise_for_status()
        for net in r.json()["droplet"].get("networks", {}).get("v4", []):
            if net.get("type") == "public":
                return net["ip_address"]
        return None

    return _poll(ip)


PROVIDERS = {"hetzner": hetzner, "vultr": vultr, "digitalocean": digitalocean}


def provision_server(node: dict) -> str:
    """Create/find the VPS for this node and return its public IP."""
    fn = PROVIDERS.get(node["provider"])
    if not fn:
        raise ProviderError(f"{node['id']}: provider '{node['provider']}' has no API "
                            f"(use mode=configure with a manual ssh_host)")
    return fn(node)
