"""Phase 3: seed panel_users from Supabase into Bunny Storage in the relay auth
format (panel/<env>/users/<sha256(email)>.json). Idempotent. Dry-run by default;
pass --apply to write."""
import hashlib
import json
import os
import sys
import urllib.request

SB_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
ENVS = {"dev": os.environ["SB_DEV_REF"], "prod": os.environ["SB_PROD_REF"]}
BUNNY_HOST = os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com")
BUNNY_ZONE = os.environ["BUNNY_STORAGE_ZONE"]
BUNNY_KEY = os.environ["BUNNY_STORAGE_KEY"]
UA = "relay-migrate/1.0"  # the WAF 403s the default python-urllib UA
DRY = "--apply" not in sys.argv


def sb_query(ref, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {SB_TOKEN}", "Content-Type": "application/json",
                 "User-Agent": UA})
    return json.load(urllib.request.urlopen(req))


def bunny_put(path, obj):
    req = urllib.request.Request(
        f"https://{BUNNY_HOST}/{BUNNY_ZONE}/{path}",
        data=json.dumps(obj).encode(), method="PUT",
        headers={"AccessKey": BUNNY_KEY, "Content-Type": "application/json", "User-Agent": UA})
    urllib.request.urlopen(req).read()


total = 0
for env, ref in ENVS.items():
    rows = sb_query(ref, "select email, role, created_at from public.panel_users")
    print(f"\n== {env} ({ref}): {len(rows)} panel_users ==")
    for r in rows:
        email = (r["email"] or "").strip().lower()
        if not email or r.get("role") not in ("admin", "moderator"):
            print(f"  skip {email} (role={r.get('role')})")
            continue
        h = hashlib.sha256(email.encode()).hexdigest()
        rec = {"email": email, "role": r["role"], "created_at": r.get("created_at")}
        path = f"panel/{env}/users/{h}.json"
        if DRY:
            print(f"  [dry] {email:28} {rec['role']:9} -> {path}")
        else:
            bunny_put(path, rec)
            print(f"  ok   {email:28} {rec['role']:9} -> {path}")
        total += 1

print(f"\n{'DRY-RUN' if DRY else 'APPLIED'}: {total} users. "
      f"{'Re-run with --apply to write.' if DRY else 'Done.'}")
