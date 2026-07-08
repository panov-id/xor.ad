#!/usr/bin/env python3
# Point the PROD deploy pipeline at the dedicated prod Supabase project:
#  - GitHub `production` env secrets (anon for the landing; ref/url/anon/service for xor.ad CI)
#  - Bunny prod proxy `neighbro-api-prod` origin → the prod project
# Idempotent. Does NOT trigger deploys.
import base64, os, sys, requests
from nacl import public, encoding

PROD_REF = os.environ["SUPABASE_PROD_REF"]
PROD_URL = os.environ["SUPABASE_PROD_URL"]
PROD_ANON = os.environ["SUPABASE_PROD_ANON_KEY"]
PROD_SERVICE = os.environ["SUPABASE_PROD_SERVICE_ROLE_KEY"]
GH = os.environ["GITHUB_TOKEN"]
BUNNY = os.environ["BUNNY_API_KEY"]
PROXY_ID = "6123218"  # neighbro-api-prod

gh = {"Authorization": f"Bearer {GH}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def set_secrets(repo, secrets):
    requests.put(f"https://api.github.com/repos/{repo}/environments/production", headers=gh, json={})
    key = requests.get(f"https://api.github.com/repos/{repo}/environments/production/secrets/public-key", headers=gh).json()
    pk = public.PublicKey(base64.b64decode(key["key"]), encoding.RawEncoder)
    box = public.SealedBox(pk)
    for name, value in secrets.items():
        enc = base64.b64encode(box.encrypt(value.encode())).decode()
        r = requests.put(
            f"https://api.github.com/repos/{repo}/environments/production/secrets/{name}",
            headers=gh, json={"encrypted_value": enc, "key_id": key["key_id"]},
        )
        print(f"   {'✓' if r.status_code in (201,204) else '✗ '+str(r.status_code)} {repo} :: {name}")


print("== GitHub production secrets ==")
set_secrets("panov-id/neighbro.place", {"SUPABASE_ANON_KEY": PROD_ANON})
set_secrets("panov-id/xor.ad", {
    "SUPABASE_PROJECT_REF": PROD_REF,
    "SUPABASE_URL": PROD_URL,
    "SUPABASE_ANON_KEY": PROD_ANON,
    "SUPABASE_SERVICE_ROLE_KEY": PROD_SERVICE,
})

print("== Bunny: repoint neighbro-api-prod origin → prod ==")
bh = {"AccessKey": BUNNY, "Content-Type": "application/json", "Accept": "application/json"}
r = requests.post(f"https://api.bunny.net/pullzone/{PROXY_ID}", headers=bh, json={
    "OriginUrl": f"https://{PROD_REF}.supabase.co",
    "OriginHostHeader": f"{PROD_REF}.supabase.co",
    "EnableWebSockets": True,
    "CacheControlMaxAgeOverride": 0,
})
print(f"   update status: {r.status_code}")
z = requests.get(f"https://api.bunny.net/pullzone/{PROXY_ID}", headers=bh).json()
print(f"   now: origin={z.get('OriginUrl')} ohh={z.get('OriginHostHeader')} ws={z.get('EnableWebSockets')}")
