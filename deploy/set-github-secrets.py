"""
Push GitHub Actions environment secrets across repos from a JSON config.

Reads deploy/github-secrets.json:
  { "github_token": "...", "repos": { "owner/repo": { "<env>": { NAME: VALUE } } } }

For each repo → environment, ensures the environment exists and sets every
secret (sealed-box encrypted with the environment's public key). Generic:
it pushes whatever names are in the config, so landing and panel secret sets
both work. Adapted from noisen-app/infrastructure/setup/setup.py.

The reserved scope name "repository" writes repository-level secrets instead.
A job that declares no `environment:` cannot see environment secrets at all, and
the failure is silent in the worst way: the tool reports every secret set, the
workflow reads an empty string, and the step it feeds does nothing while the run
stays green. That is exactly how the blog spent weeks unable to purge its cache.
Match the scope to the workflow: `environment: production` in the job means the
environment form, no `environment:` line means "repository".

    python3 set-github-secrets.py --dry-run   # what would be set where, no values
"""
import base64
import json
import os
import sys

# requests and PyNaCl are imported where they are used, not here: --dry-run needs
# neither, and importing them up front made the plan unprintable without the
# container that exists only to carry them.

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/config/github-secrets.json")

# Scope name that means "not an environment, the repository itself".
REPOSITORY = "repository"


def _requests():
    import requests
    return requests


def gh_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def encrypt(public_key_b64, value):
    from nacl import encoding, public

    pk = public.PublicKey(base64.b64decode(public_key_b64), encoding.RawEncoder)
    return base64.b64encode(public.SealedBox(pk).encrypt(value.encode())).decode()


def ensure_environment(repo, env, headers):
    r = _requests().put(
        f"https://api.github.com/repos/{repo}/environments/{env}",
        headers=headers,
        json={},
    )
    if r.status_code not in (200, 201):
        print(f"   ! environment '{env}' → {r.status_code} {r.text}", file=sys.stderr)


def env_public_key(repo, env, headers):
    r = _requests().get(
        f"https://api.github.com/repos/{repo}/environments/{env}/secrets/public-key",
        headers=headers,
    )
    r.raise_for_status()
    return r.json()


def repo_public_key(repo, headers):
    r = _requests().get(
        f"https://api.github.com/repos/{repo}/actions/secrets/public-key",
        headers=headers,
    )
    r.raise_for_status()
    return r.json()


def set_repo_secret(repo, name, value, key, headers):
    r = _requests().put(
        f"https://api.github.com/repos/{repo}/actions/secrets/{name}",
        headers=headers,
        json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]},
    )
    mark = "✓" if r.status_code in (201, 204) else f"✗ {r.status_code}"
    print(f"   {mark} [{REPOSITORY}] {name}")


def set_env_secret(repo, env, name, value, key, headers):
    r = _requests().put(
        f"https://api.github.com/repos/{repo}/environments/{env}/secrets/{name}",
        headers=headers,
        json={"encrypted_value": encrypt(key["key"], value), "key_id": key["key_id"]},
    )
    mark = "✓" if r.status_code in (201, 204) else f"✗ {r.status_code}"
    print(f"   {mark} [{env}] {name}")


def plan(cfg):
    """What would be written, without a token and without the network."""
    total = 0
    for repo, scopes in cfg["repos"].items():
        print(f"\n── {repo}")
        for scope, secrets in scopes.items():
            where = "репозиторий" if scope == REPOSITORY else f"окружение {scope}"
            for name, value in secrets.items():
                state = "пусто, будет пропущено" if value == "" else "значение задано"
                print(f"   · [{where}] {name}: {state}")
                if value != "":
                    total += 1
    print(f"\nбудет записано секретов: {total}")
    return total


def main():
    dry_run = "--dry-run" in sys.argv

    with open(CONFIG_PATH) as f:
        cfg = json.load(f)

    if dry_run:
        plan(cfg)
        return

    token = cfg["github_token"]
    if not token or token.startswith("ghp_or_"):
        print("Fill in github_token in the config first.", file=sys.stderr)
        sys.exit(1)
    headers = gh_headers(token)

    for repo, scopes in cfg["repos"].items():
        print(f"\n── {repo}")
        for scope, secrets in scopes.items():
            if scope == REPOSITORY:
                key = repo_public_key(repo, headers)
            else:
                ensure_environment(repo, scope, headers)
                key = env_public_key(repo, scope, headers)
            for name, value in secrets.items():
                if value == "":
                    print(f"   · [{scope}] {name} skipped (empty)")
                    continue
                if scope == REPOSITORY:
                    set_repo_secret(repo, name, str(value), key, headers)
                else:
                    set_env_secret(repo, scope, name, str(value), key, headers)

    print("\nDone.")


if __name__ == "__main__":
    main()
