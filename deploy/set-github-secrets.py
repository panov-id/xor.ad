"""
Push GitHub Actions environment secrets across repos from a JSON config.

Reads deploy/github-secrets.json:
  { "github_token": "...", "repos": { "owner/repo": { "<env>": { NAME: VALUE } } } }

For each repo → environment, ensures the environment exists and sets every
secret (sealed-box encrypted with the environment's public key). Generic:
it pushes whatever names are in the config, so landing and panel secret sets
both work. Adapted from noisen-app/infrastructure/setup/setup.py.
"""
import base64
import json
import os
import sys

import requests
from nacl import encoding, public

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/config/github-secrets.json")


def gh_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def encrypt(public_key_b64, value):
    pk = public.PublicKey(base64.b64decode(public_key_b64), encoding.RawEncoder)
    return base64.b64encode(public.SealedBox(pk).encrypt(value.encode())).decode()


def ensure_environment(repo, env, headers):
    r = requests.put(
        f"https://api.github.com/repos/{repo}/environments/{env}",
        headers=headers,
        json={},
    )
    if r.status_code not in (200, 201):
        print(f"   ! environment '{env}' → {r.status_code} {r.text}", file=sys.stderr)


def env_public_key(repo, env, headers):
    r = requests.get(
        f"https://api.github.com/repos/{repo}/environments/{env}/secrets/public-key",
        headers=headers,
    )
    r.raise_for_status()
    return r.json()


def set_env_secret(repo, env, name, value, key, headers):
    r = requests.put(
        f"https://api.github.com/repos/{repo}/environments/{env}/secrets/{name}",
        headers=headers,
        json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]},
    )
    mark = "✓" if r.status_code in (201, 204) else f"✗ {r.status_code}"
    print(f"   {mark} [{env}] {name}")


def main():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)

    token = cfg["github_token"]
    if not token or token.startswith("ghp_or_"):
        print("Fill in github_token in the config first.", file=sys.stderr)
        sys.exit(1)
    headers = gh_headers(token)

    for repo, envs in cfg["repos"].items():
        print(f"\n── {repo}")
        for env, secrets in envs.items():
            ensure_environment(repo, env, headers)
            key = env_public_key(repo, env, headers)
            for name, value in secrets.items():
                if value == "":
                    print(f"   · [{env}] {name} skipped (empty)")
                    continue
                set_env_secret(repo, env, name, str(value), key, headers)

    print("\nDone.")


if __name__ == "__main__":
    main()
