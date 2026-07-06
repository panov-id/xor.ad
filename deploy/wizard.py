"""
Interactive prod wizard for the landings (sosed.place + neighbro.place).

For each landing it:
  1. creates (or finds) a Bunny Storage Zone + Pull Zone with the custom hostname,
  2. sets the repo's `production` GitHub Environment secrets,
and once, up front, it fetches the prod Supabase anon key and applies the DB
migrations (so the waitlist table exists). Idempotent — safe to re-run.

Run via deploy/wizard.sh (Docker). Adapted from noisen-app/infrastructure/setup.
"""
import base64
import glob
import os
import sys

import requests
from nacl import encoding, public

LANDINGS = [
    {"repo": "panov-id/sosed.place", "domain": "sosed.place", "zone": "sosed-prod"},
    {"repo": "panov-id/neighbro.place", "domain": "neighbro.place", "zone": "neighbro-prod"},
]


def ask(label, secret=False):
    val = input(f"{label}: ").strip()
    return val


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


def ensure_storage_zone(bh, name, region="DE"):
    zones = requests.get("https://api.bunny.net/storagezone", headers=bh).json()
    z = next((x for x in zones if x["Name"] == name), None)
    if not z:
        r = requests.post(
            "https://api.bunny.net/storagezone",
            headers=bh,
            json={"Name": name, "Region": region, "ZoneTier": 0},
        )
        r.raise_for_status()
        z = r.json()
        print(f"   ✓ storage zone {name} created (id={z['Id']})")
    else:
        print(f"   · storage zone {name} exists (id={z['Id']})")
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
        print(f"   ✓ pull zone {name} created (id={p['Id']})")
    else:
        print(f"   · pull zone {name} exists (id={p['Id']})")
    hostnames = [h["Value"] for h in p.get("Hostnames", [])]
    if domain not in hostnames:
        r = requests.post(
            f"https://api.bunny.net/pullzone/{p['Id']}/addHostname",
            headers=bh,
            json={"Hostname": domain},
        )
        if r.status_code in (200, 201, 204):
            print(f"   ✓ hostname {domain} added (enable free SSL in the Bunny panel)")
        else:
            print(f"   ! hostname {domain} → {r.status_code} {r.text}")
    return str(p["Id"])


def set_prod_secret(gh, repo, name, value, key):
    r = requests.put(
        f"https://api.github.com/repos/{repo}/environments/production/secrets/{name}",
        headers=gh,
        json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]},
    )
    mark = "✓" if r.status_code in (201, 204) else f"✗ {r.status_code}"
    print(f"   {mark} secret {name}")


def fetch_supabase(access_token, project_ref):
    h = {"Authorization": f"Bearer {access_token}"}
    keys = requests.get(
        f"https://api.supabase.com/v1/projects/{project_ref}/api-keys", headers=h
    ).json()
    anon = next((k["api_key"] for k in keys if k["name"] == "anon"), "")
    return f"https://{project_ref}.supabase.co", anon


def apply_migrations(access_token, project_ref):
    h = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    for f in sorted(glob.glob("/repo/db/migrations/*.sql")):
        sql = open(f).read()
        r = requests.post(
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
            headers=h,
            json={"query": sql},
        )
        mark = "✓" if r.ok else f"✗ {r.status_code} {r.text[:100]}"
        print(f"   {mark} {os.path.basename(f)}")


def main():
    print("── xor.ad prod landing wizard ──\n")
    bunny_key = ask("Bunny Account API key")
    supabase_token = ask("Supabase Management API token")
    project_ref = ask("Supabase prod project ref (e.g. xor-ad-prod)")
    github_token = ask("GitHub token (Environments+Secrets write)")

    bh = bunny_headers(bunny_key)
    gh = gh_headers(github_token)

    print("\n── Supabase")
    supabase_url, anon_key = fetch_supabase(supabase_token, project_ref)
    print(f"   · URL {supabase_url}")
    print(f"   · anon {anon_key[:24]}…" if anon_key else "   ! could not fetch anon key")
    print("   applying migrations…")
    apply_migrations(supabase_token, project_ref)

    for l in LANDINGS:
        print(f"\n── {l['domain']} ({l['repo']})")
        zone, password = ensure_storage_zone(bh, l["zone"])
        pull_id = ensure_pull_zone(bh, l["zone"], zone, l["domain"])

        requests.put(
            f"https://api.github.com/repos/{l['repo']}/environments/production",
            headers=gh,
            json={},
        )
        key = requests.get(
            f"https://api.github.com/repos/{l['repo']}/environments/production/secrets/public-key",
            headers=gh,
        ).json()
        for name, value in [
            ("BUNNY_STORAGE_ZONE", zone["Name"]),
            ("BUNNY_STORAGE_API_KEY", password),
            ("BUNNY_PULL_ZONE_ID", pull_id),
            ("BUNNY_API_KEY", bunny_key),
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_ANON_KEY", anon_key),
        ]:
            set_prod_secret(gh, l["repo"], name, value, key)

    print("\n════════ Done ════════")
    print("Next:")
    for l in LANDINGS:
        print(f"  · DNS: CNAME {l['domain']} → {l['zone']}.b-cdn.net")
        print(f"  · Bunny panel → pull zone {l['zone']} → SSL → enable free cert for {l['domain']}")
    print("  · Merge dev→main (creates a tag, deploys UAT), then Actions → Deploy prod → the tag.")


if __name__ == "__main__":
    main()
