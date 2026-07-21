# План: полный переезд на relay + снос Supabase

Цель: увести **лендинги (neighbro + sosed) и панель** полностью с Supabase на relay,
перенести данные, затем **снести старую инфру**. Панель проектируем сразу как
расширяемый control-plane (не разовый эндпоинт) — она будет расти.

Порядок строгий: **Фаза 1 → 2 → 3 → 4**. Снос (Фаза 4) — только после того, как всё
съехало и провалидировано. Ничего в Supabase не удаляем без бэкапа и явного «ок».

Условные обозначения: ☐ не начато · ⧗ в работе · ☑ готово · 🔒 требует пользователя.

---

## Исходное состояние (проверено по коду 2026-07-21)

Схема Supabase (`db/migrations/`):

```
waitlist(id uuid, email text, source text, early_access bool, created_at tz,
         lang text, accent text, mode text)          -- 0001,0004(unique email),0007
panel_users(id uuid=auth.users.id, email text, role text in('admin','moderator'), created_at)
client_errors(id, kind, message, ... , source, created_at)   -- 0005
push_subscriptions(id, ... , source, lang, created_at)       -- 0003 (не используется)
```

Объёмы: prod `waitlist`=17, dev=3, client_errors(dev)=1, push=0.

Панель (`panel/`, Refine + `@refinedev/supabase`):
- `providers/supabase-client.ts` — `createClient(SUPABASE_URL, SUPABASE_KEY)`
- `providers/auth.ts` — magic-link (`signInWithOtp`, `shouldCreateUser:false`) + роль из `panel_users`
- `providers/data.ts` — `supabaseDataProvider(supabaseClient)`
- `App.tsx` resources: `waitlist` (list `/waitlist`), `panel_users` (list `/panel-users`)
- ⚠️ SMTP в Supabase — заглушка, magic-link реально не доставлялся.

relay (`relay/node/src`):
- `main.ts` — exact-match роутер `Record<"METHOD /path", Handler>` (нет path-params)
- `lib/storage.ts` — `exists/put/get` над Bunny/fs; **`list` отсутствует** (добавим)
- `routes/` — `waitlist`, `client_error`, `health`, `metrics`; `/chat` — заглушка
- запись лида: `waitlist/<env>/<sha256(email)>.json`, welcome через Resend (per-brand)

---

## Фаза 1 — Миграция данных лендингов (Supabase → Bunny)

☑ 1.1 Скрипт `relay/wizard/migrate_waitlist.py` — экспорт `waitlist` (dev+prod) → relay-формат,
      upload в Bunny (зона `sosed-waitlist-dev`, пути `waitlist/<env>/`). 20 строк (3 dev + 17 prod).
☑ 1.2 Проверено: дедуп — POST мигрированного email на ноду даёт `{"duplicate":true}`; формат объекта верный,
      `created_at` из Supabase сохранён. (UA-фикс: WAF режет дефолтный `python-urllib` User-Agent.)

Скрипт (`relay/wizard/migrate_waitlist.py`, запуск в контейнере relay-wizard):

```python
import base64, hashlib, json, os, urllib.request

SB_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
# per-env: (supabase ref, bunny storage zone+key, relay env name)
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

Валидация: `GET https://{host}/{zone}/waitlist/<env>/` (Bunny listing) → число объектов;
и `POST /waitlist` тем же email на соответствующую ноду → ответ `{"duplicate":true}`.

---

## Фаза 2 — Миграция sosed на relay (зеркало neighbro)

🔒 2.1 Создать Resend-аккаунт для `sosed.place`, выдать Full-access ключ.
      Далее сам: добавить домен через API, DKIM/SPF в DNS (`deploy/namecheap-add.py`),
      дождаться `verified`, вписать ключ в `RESEND_KEYS`:

```bash
# relay/wizard/secrets.env
RESEND_KEYS={"neighbro":"re_G58h…","sosed":"re_SOSED_KEY…"}
```

☐ 2.2 Лендинг sosed (`sosed.place/landing`) — те же правки, что у neighbro:
   - `config.js`: `apiUrl` вместо `supabaseUrl/anonKey`
   - `index.html`: waitlist → `${API}/waitlist` (+`brand:"sosed"`), client-error → `${API}/client-error`, CSP `connect-src` → relay-хосты
   - `deploy/deploy-landing.sh`: инъекция `apiUrl` из `RELAY_API_URL`
   - `.github/workflows/deploy-{dev,uat,prod}.yml`: проброс `RELAY_API_URL`
☐ 2.3 Секрет `RELAY_API_URL` в GitHub-окружениях sosed:
      dev→`https://n1-dev.relay.panov.id`, uat→`https://n1-staging.relay.panov.id`,
      production→`https://api.relay.panov.id`. (relay `allowed_origins` для sosed уже выставлены.)
☑ 2.2 Лендинг sosed переведён (config.js apiUrl, index waitlist/client-error → relay, CSP, deploy-landing.sh).
☑ 2.3 `RELAY_API_URL` в GitHub-окружениях sosed (dev/uat/prod).
☑ 2.4 Деплой sosed dev→uat→prod; валидация (waitlist 200 + CORS; dev welcome в Mailpit).
☑ 2.5 Публичный запуск: DNS cutover `sosed.place`+www → Bunny (ALIAS/CNAME, email сохранён),
      Let's Encrypt + ForceSSL, apex+www LIVE. (Namecheap API — whitelist IP через VPN пользователя.)
🔒 2.1 Resend-аккаунт sosed — ОТЛОЖЕН (welcome sosed падает на фолбэк, лиды сохраняются).

> Данные sosed отдельно переносить не нужно — Фаза 1 уже переносит и sosed-лидов
> (они в общей таблице `waitlist`, разделены по `source`/`brand`).

---

## Фаза 3 — Панель: control-plane на relay (полный съезд с Supabase)

Проектируем как фундамент: **auth (magic-link + JWT) + generic resource-store**,
чтобы новые разделы панели добавлялись без переписывания.

### 3.0 Хранилище (Bunny, приватная зона)

```
waitlist/<env>/<sha256(email)>.json        # лиды (есть)
client-errors/<env>/<uuid>.json            # (есть)
panel/<env>/users/<sha256(email)>.json     # {email, role, created_at}
panel/<env>/magic/<token>.json             # {email, exp}  — одноразовые ссылки
```

Сессии — **stateless JWT** (HS256, секрет `SESSION_SECRET`), в сторе не храним.

### 3.1 `storage.ts`: добавить `list` (Bunny directory listing)

```ts
// Bunny: GET на путь-каталог возвращает массив объектов {ObjectName, IsDirectory,...}
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

### 3.2 Роутер: добавить path-паттерны (exact-map не умеет `/:id`)

```ts
// lib/router.ts — минимальный паттерн-роутер поверх текущего exact-map
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

### 3.3 Auth (magic-link через Resend + подписанный JWT)

```ts
// lib/auth.ts
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { get, put, del } from "./storage.ts";
import { sha256hex } from "./hash.ts";
import { config } from "../config.ts";

const key = await crypto.subtle.importKey(
  "raw", new TextEncoder().encode(config.session.secret),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const userKey = (email: string) => `panel/${config.envName}/users/${await sha256hex(email)}.json`;

export interface PanelUser { email: string; role: "admin" | "moderator"; created_at: string; }

export async function requestMagicLink(email: string): Promise<void> {
  const user = await get<PanelUser>(await userKey(email));
  if (!user) return;                                   // не палим членство
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
  await del(path);                                     // одноразовость
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

### 3.4 Admin-роуты (RBAC) + регистрация

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
route("GET", "/admin/waitlist", async ({ req, url }) => {
  if (!await authed(req)) return json({ error: "unauth" }, 401);
  const files = await list(`waitlist/${config.envName}`);
  const items = (await Promise.all(files.map(f => get(`waitlist/${config.envName}/${f}`))))
    .filter(Boolean);
  return json({ data: items, total: items.length });   // Refine-совместимо
});

// panel_users CRUD — только admin
route("GET",    "/admin/panel-users",        async ({ req }) => { /* authed(req,'admin') + list */ });
route("POST",   "/admin/panel-users",        async ({ req }) => { /* create user */ });
route("PATCH",  "/admin/panel-users/:email", async ({ req, params }) => { /* update role */ });
route("DELETE", "/admin/panel-users/:email", async ({ req, params }) => { /* delete */ });
```

`main.ts`: после проверки exact-map — фолбэк в паттерн-роутер (`match(method, pathname)`),
плюс `import "./routes/admin.ts"` для регистрации.

### 3.5 Конфиг ноды (`config.ts`)

```ts
session: { secret: env("SESSION_SECRET") },           // HS256 signing
panel:   { url: env("PANEL_URL") },                   // для ссылки в письме
```
и проброс `SESSION_SECRET`, `PANEL_URL` в `wizard/env_file()`.

### 3.6 Панель: кастомные провайдеры вместо Supabase

```ts
// providers/auth.ts  (Refine AuthProvider) — magic-link через relay
export const authProvider: AuthProvider = {
  login: async ({ email }) => {
    await fetch(`${API}/auth/request-link`, { method:"POST",
      headers:{'content-type':'application/json'}, body: JSON.stringify({ email }) });
    return { success: true, successNotification: { message: "Проверь почту — прислали ссылку" } };
  },
  // страница /auth/callback читает ?token=…, GET /auth/callback -> сохраняет JWT в localStorage
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
// providers/data.ts — кастомный Refine dataProvider поверх /admin/<resource>
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
Убрать `providers/supabase-client.ts`, `@refinedev/supabase`, `constants` с Supabase.
`API` = `VITE_RELAY_API_URL` (per-env, как у лендинга: dev→n1-dev, uat→n1-staging, prod→api.relay.panov.id).

### 3.7 Инфра под панель
☐ relay `allowed_origins` += хосты панели (`dev/uat.xor.panov.id`, `xor.panov.id`).
☐ Сидинг `panel_users`: перенести из Supabase в `panel/<env>/users/…` (скрипт как Фаза 1).
☐ `SESSION_SECRET` (сгенерить), `PANEL_URL`, `VITE_RELAY_API_URL` — в секреты окружений.
☐ Сборка/деплой панели (build → Bunny panel-зоны, как сейчас); валидация: реальный
   magic-link по почте, вход, список лидов, CRUD panel_users, проверка ролей.

---

## Фаза 4 — Снос старой инфры (необратимо, после 1–3)

☐ 4.1 Проверить, что никто не ходит в Supabase: `grep -rn supabase panel/src sosed.place/landing neighbro.place/landing`
      = пусто (кроме инертного push); сетевой аудит запросов.
☐ 4.2 Удалить мёртвые Bunny proxy-зоны: `api.dev/uat.neighbro.panov.id`, `api.neighbro.place`,
      `api.dev/uat.sosed.panov.id`, `api.sosed.place` (Bunny API `DELETE /pullzone/{id}`).
☐ 4.3 Почистить лендинги: убрать `supabaseUrl/anonKey`, инертный push, `*.supabase.co` из CSP.
☐ 4.4 🔒 **Точка невозврата.** Бэкап обеих БД (`pg_dump` через connection string), затем
      удалить Supabase-проекты dev (`vrkqnfonmaixuvfqsfzt`) и prod (`xyydqnwgpruqwjzacuef`)
      (`DELETE https://api.supabase.com/v1/projects/{ref}`). Только по отдельному «ок».
☐ 4.5 Почистить секреты `SUPABASE_*`/`SUPABASE_ANON_KEY`/`VITE_SUPABASE_*` в GitHub-окружениях
      (neighbro/sosed/xor.ad) и `deploy/.env.deploy`; убрать `db/`-деплой-тулинг Supabase.
☐ 4.6 Обновить доки: `relay/ARCHITECTURE_*`, лендинговые `SPEC_*`, README всех трёх репо.

---

## Порядок, риски, что от пользователя

- Жёсткая последовательность **1 → 2 → 3 → 4**; Фаза 4 не начинается, пока 1–3 не съехали и не проверены.
- 🔒 От пользователя: (2.1) Resend-аккаунт sosed; (4.4) подтверждение удаления Supabase-проектов.
- Перед 4.4 — обязательный **бэкап** обеих БД.
- Панель-auth (3.3–3.4) — самый чувствительный кусок: одноразовые токены, срок JWT,
  ротация `SESSION_SECRET`, отсутствие утечки членства. Реализую с тестами (`deno test`).
- Известные хвосты по ходу: метрика `relay_mail_total{sent}` (не-2xx считается sent);
  единый waitlist-стор `sosed-waitlist-dev` на все env (разведён по префиксу).
