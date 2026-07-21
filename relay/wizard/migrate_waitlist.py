"""Phase 1: migrate the Supabase `waitlist` table (dev + prod) into Bunny Storage
in the relay object format (waitlist/<env>/<sha256(email)>.json). Idempotent —
the key is the email hash, so re-running overwrites the same object and never
re-sends a welcome (this writes storage directly, not via the node)."""
import hashlib
import json
import os
import sys
import urllib.request

SB_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
ENVS = {
    "dev":  os.environ["SB_DEV_REF"],
    "prod": os.environ["SB_PROD_REF"],
}
BUNNY_HOST = os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com")
BUNNY_ZONE = os.environ["BUNNY_STORAGE_ZONE"]
BUNNY_KEY = os.environ["BUNNY_STORAGE_KEY"]
DRY = "--apply" not in sys.argv


UA = "relay-migrate/1.0"  # a plain UA; the WAF 403s the default python-urllib UA


def sb_query(ref, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {SB_TOKEN}", "Content-Type": "application/json",
                 "User-Agent": UA})
    return json.load(urllib.request.urlopen(req))


def brand_of(source):  # mirror relay resolveBrand (match by substring)
    return "sosed" if "sosed" in (source or "").lower() else "neighbro"


def bunny_put(path, obj):
    req = urllib.request.Request(
        f"https://{BUNNY_HOST}/{BUNNY_ZONE}/{path}",
        data=json.dumps(obj).encode(), method="PUT",
        headers={"AccessKey": BUNNY_KEY, "Content-Type": "application/json", "User-Agent": UA})
    urllib.request.urlopen(req).read()


def bunny_count(prefix):
    req = urllib.request.Request(
        f"https://{BUNNY_HOST}/{BUNNY_ZONE}/{prefix}/",
        headers={"AccessKey": BUNNY_KEY, "Accept": "application/json", "User-Agent": UA})
    try:
        items = json.load(urllib.request.urlopen(req))
        return sum(1 for i in items if not i.get("IsDirectory"))
    except Exception:
        return "?"


total = 0
for env, ref in ENVS.items():
    rows = sb_query(ref, "select email,source,early_access,lang,accent,mode,created_at "
                         "from public.waitlist order by created_at")
    print(f"\n== {env} ({ref}): {len(rows)} rows  [Bunny before: {bunny_count(f'waitlist/{env}')}] ==")
    for r in rows:
        email = (r["email"] or "").strip().lower()
        if not email:
            continue
        h = hashlib.sha256(email.encode()).hexdigest()
        rec = {
            "email": email,
            "source": r.get("source"),
            "brand": brand_of(r.get("source")),
            "lang": r.get("lang") or "en",
            "mode": r.get("mode"),
            "early_access": bool(r.get("early_access")),
            "node": "migrated",
            "region": "supabase",
            "env": env,
            "created_at": r.get("created_at"),
        }
        path = f"waitlist/{env}/{h}.json"
        if DRY:
            print(f"  [dry] {email:32} {rec['brand']:9} -> {path}")
        else:
            bunny_put(path, rec)
            print(f"  ok   {email:32} {rec['brand']:9} -> {path}")
        total += 1
    if not DRY:
        print(f"  [Bunny after: {bunny_count(f'waitlist/{env}')}]")

print(f"\n{'DRY-RUN' if DRY else 'APPLIED'}: {total} rows. "
      f"{'Re-run with --apply to write.' if DRY else 'Done.'}")
