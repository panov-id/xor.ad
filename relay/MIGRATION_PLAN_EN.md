# Plan: full move onto relay + decommission Supabase

> ✅ **COMPLETE (2026-07-22).** All 4 phases done: data migrated, sosed+neighbro
> landings and the panel on relay, both Supabase projects deleted (backup in
> `supabase-backup-2026-07-22/`). relay `v0.2.0` across all envs.

Goal: move **the landings (neighbro + sosed) and the panel** fully off Supabase onto
relay, migrate the data, then **tear down the old infra**. The panel is designed up
front as an extensible control plane (not a one-off endpoint) — it will grow.

Strict order: **Phase 1 → 2 → 3 → 4**. Teardown (Phase 4) only after everything has
moved and been validated. Nothing in Supabase is deleted without a backup and an
explicit go-ahead.

Legend: ☐ not started · ⧗ in progress · ☑ done · 🔒 needs the user.

---

## Starting state (verified against the code 2026-07-21)

Supabase schema (`db/migrations/`):

```
waitlist(id uuid, email text, source text, early_access bool, created_at tz,
         lang text, accent text, mode text)          -- 0001,0004(unique email),0007
panel_users(id uuid=auth.users.id, email text, role text in('admin','moderator'), created_at)
client_errors(id, kind, message, ... , source, created_at)   -- 0005
push_subscriptions(id, ... , source, lang, created_at)       -- 0003 (unused)
```

Volumes: prod `waitlist`=17, dev=3, client_errors(dev)=1, push=0.

Panel (`panel/`, Refine + `@refinedev/supabase`):
- `providers/supabase-client.ts` — `createClient(SUPABASE_URL, SUPABASE_KEY)`
- `providers/auth.ts` — magic link (`signInWithOtp`, `shouldCreateUser:false`) + role from `panel_users`
- `providers/data.ts` — `supabaseDataProvider(supabaseClient)`
- `App.tsx` resources: `waitlist` (list `/waitlist`), `panel_users` (list `/panel-users`)
- ⚠️ Supabase SMTP is a placeholder — the magic link was never actually delivered.

relay (`relay/node/src`):
- `main.ts` — exact-match router `Record<"METHOD /path", Handler>` (no path params)
- `lib/storage.ts` — `exists/put/get` over Bunny/fs; **`list` missing** (to add)
- `routes/` — `waitlist`, `client_error`, `health`, `metrics`; `/chat` is a stub
- lead write: `waitlist/<env>/<sha256(email)>.json`, welcome via Resend (per-brand)

---

## Phase 1 — Migrate landing data (Supabase → Bunny)

☑ 1.1 Script `relay/wizard/migrate_waitlist.py` — export `waitlist` (dev+prod) → relay format,
      upload to Bunny (zone `sosed-waitlist-dev`, paths `waitlist/<env>/`). 20 rows (3 dev + 17 prod).
☑ 1.2 Verified: dedup — POST a migrated email to a node returns `{"duplicate":true}`; object shape correct,
      Supabase `created_at` preserved. (UA fix: the WAF 403s the default `python-urllib` User-Agent.)

Script (`relay/wizard/migrate_waitlist.py`, run inside the relay-wizard container):

```python
import base64, hashlib, json, os, urllib.request

SB_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
ENVS = {
    "dev":  {"ref": os.environ["SB_DEV_REF"],  "env": "dev"},
    "prod": {"ref": os.environ["SB_PROD_REF"], "env": "prod"},
}
BUNNY_HOST = os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com")
BUNNY_ZONE = os.environ["BUNNY_STORAGE_ZONE"]
BUNNY_KEY  = os.environ["BUNNY_STORAGE_KEY"]

def sb_query(ref, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {SB_TOKEN}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

def brand_of(source):                      # mirror relay resolveBrand
    s = (source or "").lower()
    return "sosed" if "sosed" in s else "neighbro"

def bunny_put(path, obj):
    req = urllib.request.Request(
        f"https://{BUNNY_HOST}/{BUNNY_ZONE}/{path}",
        data=json.dumps(obj).encode(), method="PUT",
        headers={"AccessKey": BUNNY_KEY, "Content-Type": "application/json"})
    urllib.request.urlopen(req).read()

for name, cfg in ENVS.items():
    rows = sb_query(cfg["ref"], "select email,source,early_access,lang,accent,mode,created_at from public.waitlist")
    for r in rows:
        email = r["email"].strip().lower()
        h = hashlib.sha256(email.encode()).hexdigest()
        rec = {                             # same shape as routes/waitlist.ts
            "email": email, "source": r.get("source"),
            "brand": brand_of(r.get("source")),
            "lang": r.get("lang") or "en", "mode": r.get("mode"),
            "early_access": bool(r.get("early_access")),
            "node": "migrated", "region": "supabase", "env": cfg["env"],
            "created_at": r.get("created_at"),
        }
        bunny_put(f"waitlist/{cfg['env']}/{h}.json", rec)
        print(f"  {cfg['env']} {email} -> waitlist/{cfg['env']}/{h}.json")
```

Validation: `GET https://{host}/{zone}/waitlist/<env>/` (Bunny listing) → object count;
and `POST /waitlist` with the same email to the matching node → `{"duplicate":true}`.

---

## Phase 2 — Migrate sosed onto relay (mirror of neighbro)

🔒 2.1 Create a Resend account for `sosed.place`, issue a Full-access key.
      Then I do the rest: add the domain via API, DKIM/SPF in DNS
      (`deploy/namecheap-add.py`), wait for `verified`, add the key to `RESEND_KEYS`:

```bash
# relay/wizard/secrets.env
RESEND_KEYS={"neighbro":"re_G58h…","sosed":"re_SOSED_KEY…"}
```

☐ 2.2 sosed landing (`sosed.place/landing`) — the same edits as neighbro:
   - `config.js`: `apiUrl` instead of `supabaseUrl/anonKey`
   - `index.html`: waitlist → `${API}/waitlist` (+`brand:"sosed"`), client-error → `${API}/client-error`, CSP `connect-src` → relay hosts
   - `deploy/deploy-landing.sh`: inject `apiUrl` from `RELAY_API_URL`
   - `.github/workflows/deploy-{dev,uat,prod}.yml`: pass `RELAY_API_URL`
☐ 2.3 `RELAY_API_URL` secret in sosed GitHub environments:
      dev→`https://n1-dev.relay.panov.id`, uat→`https://n1-staging.relay.panov.id`,
      production→`https://api.relay.panov.id`. (relay `allowed_origins` for sosed already set.)
☑ 2.2 sosed landing migrated (config.js apiUrl, index waitlist/client-error → relay, CSP, deploy-landing.sh).
☑ 2.3 `RELAY_API_URL` in sosed GitHub environments (dev/uat/prod).
☑ 2.4 Deployed sosed dev→uat→prod; validated (waitlist 200 + CORS; dev welcome to Mailpit).
☑ 2.5 Public launch: DNS cutover `sosed.place`+www → Bunny (ALIAS/CNAME, email preserved),
      Let's Encrypt + ForceSSL, apex+www LIVE. (Namecheap API — IP whitelisted via the user's VPN.)
🔒 2.1 sosed Resend account — DEFERRED (sosed welcome falls back and fails; leads still store).

> sosed data needs no separate migration — Phase 1 already moves sosed leads too
> (they live in the shared `waitlist` table, split by `source`/`brand`).

---

## Phase 3 — Panel: control plane on relay (full move off Supabase)

Designed as a foundation: **auth (magic link + JWT) + a generic resource store**, so
new panel sections are added without a rewrite.

### 3.0 Storage (Bunny, private zone)

```
waitlist/<env>/<sha256(email)>.json        # leads (exists)
client-errors/<env>/<uuid>.json            # (exists)
panel/<env>/users/<sha256(email)>.json     # {email, role, created_at}
panel/<env>/magic/<token>.json             # {email, exp}  — one-time links
```

Sessions are **stateless JWTs** (HS256, secret `SESSION_SECRET`); not stored.

### 3.1 `storage.ts`: add `list` (Bunny directory listing)

```ts
// Bunny: a GET on a directory path returns an array of {ObjectName, IsDirectory,...}
export async function list(prefix: string): Promise<string[]> {
  if (s.transport === "fs") {
    try { return [...Deno.readDirSync(fsPath(prefix))].filter(e => e.isFile).map(e => e.name); }
    catch { return []; }
  }
  const res = await fetch(bunnyUrl(prefix.endsWith("/") ? prefix : prefix + "/"),
                          { headers: bunnyHeaders() });
  if (!res.ok) { await res.body?.cancel(); return []; }
  const items = await res.json() as Array<{ ObjectName: string; IsDirectory: boolean }>;
  return items.filter(i => !i.IsDirectory).map(i => i.ObjectName);
}
export async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(bunnyUrl(path), { headers: bunnyHeaders() });
  if (!res.ok) { await res.body?.cancel(); return null; }
  return await res.json() as T;
}
```

### 3.2 Router: add path patterns (the exact-map can't do `/:id`)

```ts
// lib/router.ts — a minimal pattern router alongside the current exact-map
type Ctx = { req: Request; params: Record<string,string>; url: URL };
type H = (c: Ctx) => Response | Promise<Response>;
const table: Array<{ m: string; re: RegExp; keys: string[]; h: H }> = [];
export function route(m: string, pattern: string, h: H) {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  table.push({ m, re, keys, h });
}
export function match(method: string, path: string): { h: H; params: Record<string,string> } | null {
  for (const r of table) {
    if (r.m !== method) continue;
    const mm = r.re.exec(path);
    if (mm) return { h: r.h, params: Object.fromEntries(r.keys.map((k,i)=>[k, mm[i+1]])) };
  }
  return null;
}
```

### 3.3 Auth (magic link via Resend + a signed JWT)

```ts
// lib/auth.ts
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { get, put, del } from "./storage.ts";
import { sha256hex } from "./hash.ts";
import { config } from "../config.ts";

const key = await crypto.subtle.importKey(
  "raw", new TextEncoder().encode(config.session.secret),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const userKey = async (email: string) => `panel/${config.envName}/users/${await sha256hex(email)}.json`;

export interface PanelUser { email: string; role: "admin" | "moderator"; created_at: string; }

export async function requestMagicLink(email: string): Promise<void> {
  const user = await get<PanelUser>(await userKey(email));
  if (!user) return;                                   // don't leak membership
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await put(`panel/${config.envName}/magic/${token}.json`,
            { email, exp: Date.now() + 15 * 60_000 });
  const link = `${config.panel.url}/auth/callback?token=${token}`;
  await sendMagicEmail(email, link);                   // Resend, from panov.id
}

export async function redeem(token: string): Promise<string | null> {
  const path = `panel/${config.envName}/magic/${token}.json`;
  const m = await get<{ email: string; exp: number }>(path);
  if (!m) return null;
  await del(path);                                     // one-time use
  if (Date.now() > m.exp) return null;
  const user = await get<PanelUser>(await userKey(m.email));
  if (!user) return null;
  return await create({ alg: "HS256", typ: "JWT" },
    { sub: user.email, role: user.role, exp: Math.floor(Date.now()/1000) + 7*86400 }, key);
}

export async function authed(req: Request, minRole?: "admin"): Promise<PanelUser | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  try {
    const p = await verify(jwt, key) as { sub: string; role: "admin"|"moderator" };
    if (minRole === "admin" && p.role !== "admin") return null;
    return { email: p.sub, role: p.role, created_at: "" };
  } catch { return null; }
}
```

### 3.4 Admin routes (RBAC) + registration

```ts
// routes/admin.ts
import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { authed, requestMagicLink, redeem } from "../lib/auth.ts";
import { list, get } from "../lib/storage.ts";
import { config } from "../config.ts";

route("POST", "/auth/request-link", async ({ req }) => {
  const { email } = await req.json(); await requestMagicLink(email); return json({ ok: true }, 204);
});
route("GET", "/auth/callback", async ({ url }) => {
  const jwt = await redeem(url.searchParams.get("token") || "");
  return jwt ? json({ token: jwt }) : json({ error: "invalid" }, 401);
});
route("GET", "/auth/me", async ({ req }) => {
  const u = await authed(req); return u ? json(u) : json({ error: "unauth" }, 401);
});

// generic list of a stored collection (waitlist first; extensible)
route("GET", "/admin/waitlist", async ({ req }) => {
  if (!await authed(req)) return json({ error: "unauth" }, 401);
  const files = await list(`waitlist/${config.envName}`);
  const items = (await Promise.all(files.map(f => get(`waitlist/${config.envName}/${f}`))))
    .filter(Boolean);
  return json({ data: items, total: items.length });   // Refine-compatible
});

// panel_users CRUD — admin only
route("GET",    "/admin/panel-users",        async ({ req }) => { /* authed(req,'admin') + list */ });
route("POST",   "/admin/panel-users",        async ({ req }) => { /* create user */ });
route("PATCH",  "/admin/panel-users/:email", async ({ req, params }) => { /* update role */ });
route("DELETE", "/admin/panel-users/:email", async ({ req, params }) => { /* delete */ });
```

`main.ts`: after the exact-map miss, fall back to the pattern router (`match(method, pathname)`),
plus `import "./routes/admin.ts"` to register.

### 3.5 Node config (`config.ts`)

```ts
session: { secret: env("SESSION_SECRET") },           // HS256 signing
panel:   { url: env("PANEL_URL") },                   // for the email link
```
and pass `SESSION_SECRET`, `PANEL_URL` through `wizard/env_file()`.

### 3.6 Panel: custom providers instead of Supabase

```ts
// providers/auth.ts (Refine AuthProvider) — magic link via relay
export const authProvider: AuthProvider = {
  login: async ({ email }) => {
    await fetch(`${API}/auth/request-link`, { method:"POST",
      headers:{'content-type':'application/json'}, body: JSON.stringify({ email }) });
    return { success: true, successNotification: { message: "Check your email for the link" } };
  },
  // the /auth/callback page reads ?token=…, GET /auth/callback -> saves JWT to localStorage
  check: async () => {
    const t = localStorage.getItem("panel_jwt");
    if (!t) return { authenticated: false, redirectTo: "/login" };
    const r = await fetch(`${API}/auth/me`, { headers:{ authorization:`Bearer ${t}` }});
    return r.ok ? { authenticated: true } : { authenticated: false, redirectTo: "/login" };
  },
  logout: async () => { localStorage.removeItem("panel_jwt"); return { success:true, redirectTo:"/login" }; },
  getPermissions: async () => { /* decode role from jwt */ },
  getIdentity:    async () => { const r = await fetch(`${API}/auth/me`,{headers:{authorization:`Bearer ${localStorage.getItem("panel_jwt")}`}}); return r.ok? r.json(): null; },
  onError: async () => ({}),
};
```
```ts
// providers/data.ts — a custom Refine dataProvider over /admin/<resource>
const authH = () => ({ authorization: `Bearer ${localStorage.getItem("panel_jwt")}` });
export const dataProvider: DataProvider = {
  getList: async ({ resource }) => {
    const r = await fetch(`${API}/admin/${resource}`, { headers: authH() });
    const { data, total } = await r.json(); return { data, total };
  },
  getOne:    async ({ resource, id }) => { /* GET /admin/<resource>/<id> */ },
  create:    async ({ resource, variables }) => { /* POST */ },
  update:    async ({ resource, id, variables }) => { /* PATCH */ },
  deleteOne: async ({ resource, id }) => { /* DELETE */ },
  getApiUrl: () => API,
};
```
Remove `providers/supabase-client.ts`, `@refinedev/supabase`, the Supabase `constants`.
`API` = `VITE_RELAY_API_URL` (per-env, like the landing: dev→n1-dev, uat→n1-staging, prod→api.relay.panov.id).

### 3.7 Panel infra
☐ relay `allowed_origins` += panel hosts (`dev/uat.xor.panov.id`, `xor.panov.id`).
☐ Seed `panel_users`: move from Supabase into `panel/<env>/users/…` (script like Phase 1).
☐ `SESSION_SECRET` (generate), `PANEL_URL`, `VITE_RELAY_API_URL` — into the env secrets.
☐ Build/deploy the panel (build → Bunny panel zones, as today); validate: a real
   emailed magic link, login, lead list, panel_users CRUD, role checks.

---

## Phase 4 — Decommission the old infra (irreversible, after 1–3)

☑ 4.1 Confirm nobody calls Supabase: `grep -rn supabase panel/src sosed.place/landing neighbro.place/landing`
      = empty (except the inert push); network audit of requests.
☑ 4.2 Delete the dead Bunny proxy zones: `api.dev/uat.neighbro.panov.id`, `api.neighbro.place`,
      `api.dev/uat.sosed.panov.id`, `api.sosed.place` (Bunny API `DELETE /pullzone/{id}`).
☑ 4.3 Clean the landings: drop `supabaseUrl/anonKey`, the inert push, `*.supabase.co` from CSP.
☑ 4.4 🔒 **Point of no return.** Back up both DBs (`pg_dump` via the connection string), then
      delete the Supabase projects dev (`vrkqnfonmaixuvfqsfzt`) and prod (`xyydqnwgpruqwjzacuef`)
      (`DELETE https://api.supabase.com/v1/projects/{ref}`). Only on a separate go-ahead.
☑ 4.5 Clean `SUPABASE_*`/`SUPABASE_ANON_KEY`/`VITE_SUPABASE_*` secrets in the GitHub
      environments (neighbro/sosed/xor.ad) and `deploy/.env.deploy`; remove the dead Supabase `db/` tooling.
☑ 4.6 Update the docs: `relay/ARCHITECTURE_*`, the landings' `SPEC_*`, the READMEs of all three repos.

---

## Order, risks, what the user provides

- Strict sequence **1 → 2 → 3 → 4**; Phase 4 doesn't start until 1–3 have moved and been verified.
- 🔒 From the user: (2.1) the sosed Resend account; (4.4) confirmation to delete the Supabase projects.
- Before 4.4 — a mandatory **backup** of both DBs.
- Panel auth (3.3–3.4) is the most sensitive part: one-time tokens, JWT lifetime,
  `SESSION_SECRET` rotation, no membership leak. Implement with tests (`deno test`).
- Known loose ends along the way: metric `relay_mail_total{sent}` (a non-2xx counts as sent);
  a single shared waitlist store `sosed-waitlist-dev` for all envs (split by prefix).
