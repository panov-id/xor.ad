"""
Interactive deploy wizard. Pick an environment (dev/uat/prod); for that env it:
  1. creates (or finds) Bunny Storage+Pull Zones with custom hostnames for the
     two landings and the panel,
  2. applies the Supabase migrations (once),
  3. sets each repo's GitHub Environment secrets.

One Supabase project is shared across all environments for now, so the
Supabase URL/anon/ref are the same everywhere; only domains/zones differ.
"xor" (the gateway/API) is Supabase itself, not a CDN target. Idempotent.

Run via deploy/wizard.sh. Adapted from noisen-app/infrastructure/setup.
"""
import base64
import glob
import os
import sys

import requests
from nacl import encoding, public

# env → (bunny github-environment, zone suffix, per-target hostname)
# Per env: static frontend hostnames + the landings' api.* proxy hostnames.
# Landings talk to their api.* (Bunny Pull Zone → shared Supabase); the panel
# talks to Supabase directly (auth/functions, kept simple).
ENVS = {
    "dev": {
        "gh_env": "dev",
        "suffix": "-dev",
        "sosed": "dev.sosed.panov.id",
        "neighbro": "dev.neighbro.panov.id",
        "panel": "dev.xor.panov.id",
        "api_sosed": "api.dev.sosed.panov.id",
        "api_neighbro": "api.dev.neighbro.panov.id",
    },
    "uat": {
        "gh_env": "uat",
        "suffix": "-uat",
        "sosed": "uat.sosed.panov.id",
        "neighbro": "uat.neighbro.panov.id",
        "panel": "uat.xor.panov.id",
        "api_sosed": "api.uat.sosed.panov.id",
        "api_neighbro": "api.uat.neighbro.panov.id",
    },
    "prod": {
        "gh_env": "production",
        "suffix": "-prod",
        "sosed": "sosed.place",
        "neighbro": "neighbro.place",
        "panel": "xor.panov.id",
        "api_sosed": "api.sosed.place",
        "api_neighbro": "api.neighbro.place",
    },
}


def bunny_headers(key):
    return {"AccessKey": key, "Content-Type": "application/json", "Accept": "application/json"}


def gh_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def encrypt(pub_b64, value):
    pk = public.PublicKey(base64.b64decode(pub_b64), encoding.RawEncoder)
    return base64.b64encode(public.SealedBox(pk).encrypt(value.encode())).decode()


def ensure_storage_zone(bh, name):
    zones = requests.get("https://api.bunny.net/storagezone", headers=bh).json()
    z = next((x for x in zones if x["Name"] == name), None)
    if not z:
        r = requests.post(
            "https://api.bunny.net/storagezone",
            headers=bh,
            json={"Name": name, "Region": "DE", "ZoneTier": 0},
        )
        r.raise_for_status()
        z = r.json()
        print(f"   ✓ storage zone {name} created")
    else:
        print(f"   · storage zone {name} exists")
    password = z.get("Password") or requests.get(
        f"https://api.bunny.net/storagezone/{z['Id']}", headers=bh
    ).json().get("Password", "")
    return z, password


def ensure_pull_zone(bh, name, storage_zone, domain):
    zones = requests.get("https://api.bunny.net/pullzone?page=1&perPage=1000", headers=bh).json()
    items = zones if isinstance(zones, list) else zones.get("Items", [])
    p = next((x for x in items if x["Name"] == name), None)
    if not p:
        r = requests.post(
            "https://api.bunny.net/pullzone",
            headers=bh,
            json={
                "Name": name,
                "OriginUrl": f"https://{storage_zone['Name']}.b-cdn.net",
                "StorageZoneId": storage_zone["Id"],
                "EnableGeoZoneEU": True,
                "EnableGeoZoneUS": True,
                "DisableCookies": True,
            },
        )
        r.raise_for_status()
        p = r.json()
        print(f"   ✓ pull zone {name} created")
    else:
        print(f"   · pull zone {name} exists")
    if domain not in [h["Value"] for h in p.get("Hostnames", [])]:
        r = requests.post(
            f"https://api.bunny.net/pullzone/{p['Id']}/addHostname",
            headers=bh,
            json={"Hostname": domain},
        )
        note = "added (enable SSL in the panel)" if r.status_code in (200, 201, 204) else f"{r.status_code}"
        print(f"   ✓ hostname {domain} {note}")
    return str(p["Id"])


def ensure_proxy_pull_zone(bh, name, origin_url, domain):
    """Pull zone that reverse-proxies an origin (Supabase) — no storage zone,
    caching off. NOTE: set 'Origin Host Header' = the Supabase host and keep
    caching disabled in the Bunny panel; verify on live Bunny."""
    zones = requests.get("https://api.bunny.net/pullzone?page=1&perPage=1000", headers=bh).json()
    items = zones if isinstance(zones, list) else zones.get("Items", [])
    p = next((x for x in items if x["Name"] == name), None)
    if not p:
        r = requests.post(
            "https://api.bunny.net/pullzone",
            headers=bh,
            json={
                "Name": name,
                "OriginUrl": origin_url,
                "EnableGeoZoneEU": True,
                "EnableGeoZoneUS": True,
                "DisableCookies": False,
                "CacheControlMaxAgeOverride": 0,
            },
        )
        r.raise_for_status()
        p = r.json()
        print(f"   ✓ proxy zone {name} → {origin_url} created")
    else:
        print(f"   · proxy zone {name} exists")
    if domain not in [h["Value"] for h in p.get("Hostnames", [])]:
        r = requests.post(
            f"https://api.bunny.net/pullzone/{p['Id']}/addHostname",
            headers=bh,
            json={"Hostname": domain},
        )
        note = "added (enable SSL + set origin host header)" if r.status_code in (200, 201, 204) else f"{r.status_code}"
        print(f"   ✓ hostname {domain} {note}")
    return str(p["Id"])


def set_env_secrets(gh, repo, gh_env, secrets):
    requests.put(
        f"https://api.github.com/repos/{repo}/environments/{gh_env}", headers=gh, json={}
    )
    key = requests.get(
        f"https://api.github.com/repos/{repo}/environments/{gh_env}/secrets/public-key",
        headers=gh,
    ).json()
    for name, value in secrets.items():
        r = requests.put(
            f"https://api.github.com/repos/{repo}/environments/{gh_env}/secrets/{name}",
            headers=gh,
            json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]},
        )
        mark = "✓" if r.status_code in (201, 204) else f"✗ {r.status_code}"
        print(f"   {mark} {name}")


def fetch_supabase(token, ref):
    keys = requests.get(
        f"https://api.supabase.com/v1/projects/{ref}/api-keys",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    anon = next((k["api_key"] for k in keys if k["name"] == "anon"), "")
    return f"https://{ref}.supabase.co", anon


def apply_migrations(token, ref):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    for f in sorted(glob.glob("/repo/db/migrations/*.sql")):
        r = requests.post(
            f"https://api.supabase.com/v1/projects/{ref}/database/query",
            headers=h,
            json={"query": open(f).read()},
        )
        mark = "✓" if r.ok else f"✗ {r.status_code} {r.text[:80]}"
        print(f"   {mark} {os.path.basename(f)}")


def main():
    print("── xor.ad deploy wizard ──\n")
    env = ""
    while env not in ENVS:
        env = input("Environment (dev/uat/prod): ").strip().lower()
    cfg = ENVS[env]
    gh_env = cfg["gh_env"]

    bunny_key = input("Bunny Account API key: ").strip()
    supabase_token = input("Supabase Management API token: ").strip()
    ref = input("Supabase project ref (shared): ").strip()
    github_token = input("GitHub token (Environments+Secrets write): ").strip()

    bh = bunny_headers(bunny_key)
    gh = gh_headers(github_token)

    print("\n── Supabase (shared)")
    url, anon = fetch_supabase(supabase_token, ref)
    print(f"   · {url}  anon {anon[:20]}…")
    apply_migrations(supabase_token, ref)

    # Landings: static zone for the site + an api.* proxy zone → Supabase.
    for face, repo in [("sosed", "panov-id/sosed.place"), ("neighbro", "panov-id/neighbro.place")]:
        domain = cfg[face]
        api_domain = cfg[f"api_{face}"]
        zone_name = f"{face}{cfg['suffix']}"
        print(f"\n── {domain} ({repo}) [{gh_env}]")
        zone, pw = ensure_storage_zone(bh, zone_name)
        pull_id = ensure_pull_zone(bh, zone_name, zone, domain)
        ensure_proxy_pull_zone(bh, f"{face}-api{cfg['suffix']}", url, api_domain)
        set_env_secrets(gh, repo, gh_env, {
            "BUNNY_STORAGE_ZONE": zone["Name"],
            "BUNNY_STORAGE_API_KEY": pw,
            "BUNNY_PULL_ZONE_ID": pull_id,
            "BUNNY_API_KEY": bunny_key,
            "SUPABASE_URL": f"https://{api_domain}",
            "SUPABASE_ANON_KEY": anon,
        })

    # Panel (xor.ad repo)
    panel_domain = cfg["panel"]
    zone_name = f"panel{cfg['suffix']}"
    print(f"\n── {panel_domain} (panov-id/xor.ad) [{gh_env}]")
    zone, pw = ensure_storage_zone(bh, zone_name)
    pull_id = ensure_pull_zone(bh, zone_name, zone, panel_domain)
    set_env_secrets(gh, "panov-id/xor.ad", gh_env, {
        "VITE_SUPABASE_URL": url,
        "VITE_SUPABASE_ANON_KEY": anon,
        "BUNNY_PANEL_STORAGE_ZONE": zone["Name"],
        "BUNNY_PANEL_STORAGE_API_KEY": pw,
        "BUNNY_PANEL_PULL_ZONE_ID": pull_id,
        "BUNNY_API_KEY": bunny_key,
        "SUPABASE_ACCESS_TOKEN": supabase_token,
        "SUPABASE_PROJECT_REF": ref,
        "PANEL_URL": f"https://{panel_domain}",
    })

    print(f"\n════════ {env} done ════════")
    print("DNS (CNAME → <zone>.b-cdn.net), then enable SSL per hostname in the Bunny panel:")
    for face in ("sosed", "neighbro"):
        print(f"  · {cfg[face]}      → {face}{cfg['suffix']}.b-cdn.net   (landing)")
        print(f"  · {cfg[f'api_{face}']}  → {face}-api{cfg['suffix']}.b-cdn.net   (api proxy)")
    print(f"  · {panel_domain} → panel{cfg['suffix']}.b-cdn.net   (panel)")
    print("\nFor each api.* proxy zone in the Bunny panel: disable caching and set")
    print(f"Origin Host Header = {ref}.supabase.co  (so Supabase routes correctly).")
    print("Deploy: push to `dev` (dev) / merge to main (uat) / run Deploy prod with a tag.")


if __name__ == "__main__":
    main()
