"""Set RELAY_API_URL in a landing repo's GitHub environment secrets.
Usage: python set_relay_secret.py [panov-id/<repo>]  (default neighbro.place)"""
import base64, os, sys
import requests
from nacl import encoding, public

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = sys.argv[1] if len(sys.argv) > 1 else "panov-id/neighbro.place"
VALUES = {
    "dev": "https://n1-dev.relay.panov.id",
    "uat": "https://n1-staging.relay.panov.id",
    "production": "https://api.relay.panov.id",  # pending Phase C pool cutover
}
H = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
     "X-GitHub-Api-Version": "2022-11-28"}


def encrypt(pub_b64, value):
    pk = public.PublicKey(base64.b64decode(pub_b64), encoding.RawEncoder)
    return base64.b64encode(public.SealedBox(pk).encrypt(value.encode())).decode()


for env, value in VALUES.items():
    requests.put(f"https://api.github.com/repos/{REPO}/environments/{env}", headers=H, json={})
    key = requests.get(
        f"https://api.github.com/repos/{REPO}/environments/{env}/secrets/public-key", headers=H).json()
    r = requests.put(
        f"https://api.github.com/repos/{REPO}/environments/{env}/secrets/RELAY_API_URL",
        headers=H,
        json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]})
    mark = "ok" if r.status_code in (201, 204) else f"FAIL {r.status_code} {r.text[:80]}"
    print(f"  {env:11} RELAY_API_URL={value:40} -> {mark}")
