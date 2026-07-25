# Panel: role model and log viewing — checklist

Goal: show logs in the XOR panel. The logs permission requires a role model, so the
role model comes first — as a self-contained core that is ported by copying one
directory into another project, with no separate repository and no workspace package.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Permission model | RBAC: the `role → permissions` map lives in code; a user carries only a role. `PanelUser` stays unchanged |
| Module shape | Self-contained `access/` directory — plain TypeScript, zero imports outside the directory |
| Adapters | Live outside the core: relay (JWT → subject, guard), panel (Refine `accessControlProvider`) |
| Logs | All three sources, phased: client-errors → audit → relay server logs |

## Starting point (what exists today)

- `relay/node/src/lib/auth.ts` — `type Role = "admin" \| "moderator"`, `authed(req, minRole?)`
  understands only `minRole === "admin"`.
- `relay/node/src/routes/admin.ts:22` — `guard(req, admin = false)`: a binary
  admin/not-admin check, repeated in every route.
- `relay/node/src/lib/log.ts` — structured JSON logging to stdout, never persisted.
- `relay/node/src/routes/client_error.ts` — already writes `client-errors/<env>/*.json`
  to Bunny Storage. No reader exists.
- `panel/src/providers/auth.ts` — `getPermissions()` returns the role string.
- `panel/src/App.tsx` — Refine without an `accessControlProvider`.

---

## Phase 1. The `access/` core — ✅ done

Result: `relay/node/src/access/` (4 files + README), `relay/node/test/access.test.ts`
(7 tests), `scripts/run-relay-tests.sh`. `deno check` plus 17 tests green.

**1.1** Create `relay/node/src/access/` as the source of truth. Zero outward imports,
no knowledge of Bunny Storage, HTTP, or Refine.

```
relay/node/src/access/
  permissions.ts   # permission catalogue + Permission type
  roles.ts         # ROLE_PERMISSIONS: Record<Role, readonly Permission[]>
  can.ts           # can(subject, permission) + permissionsOf(role)
  index.ts         # public surface
  README.md        # how to port the directory into another project
```

**1.2** `permissions.ts` — a flat catalogue, full words, no abbreviations:

```ts
// Panel permission catalogue. The strings are stable: they travel in JWT sessions
// and in client-side checks, so renaming one is a migration.
export const PERMISSIONS = [
  "waitlist.read",
  "panel_users.read",
  "panel_users.write",
  "logs.client_errors.read",
  "logs.audit.read",
  "logs.server.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
```

**1.3** `roles.ts` — the role map. `"*"` means every permission:

```ts
import type { Permission } from "./permissions.ts";

export const ROLES = ["admin", "moderator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly (Permission | "*")[]> = {
  admin: ["*"],
  moderator: ["waitlist.read", "panel_users.read", "logs.client_errors.read", "logs.audit.read"],
  viewer: ["waitlist.read"],
};
```

**1.4** `can.ts` — the single place where "allowed or not" is decided:

```ts
import { PERMISSIONS, type Permission } from "./permissions.ts";
import { ROLE_PERMISSIONS, type Role } from "./roles.ts";

export interface AccessSubject {
  role: Role;
}

export function permissionsOf(role: Role): readonly Permission[] {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  return granted.includes("*") ? PERMISSIONS : (granted as readonly Permission[]);
}

export function can(subject: AccessSubject | null, permission: Permission): boolean {
  if (!subject) return false;
  return permissionsOf(subject.role).includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_PERMISSIONS;
}
```

**1.5** `index.ts` — re-export `PERMISSIONS`, `Permission`, `ROLES`, `Role`,
`ROLE_PERMISSIONS`, `AccessSubject`, `can`, `permissionsOf`, `isRole`.

**1.6** `access/README.md`: porting means copying the directory, editing
`permissions.ts` and `roles.ts` for the new project, and writing new adapters.
State the rule explicitly: **no file inside `access/` imports anything from outside.**

**1.7** Core unit tests in `relay/node/test/` (next to `unit.test.ts`): `admin` covers
every permission; `viewer` cannot read logs; an unknown role resolves to `false`;
`can(null, ...)` is `false`.

---

## Phase 2. Relay adapter — ✅ done

Result: `lib/auth.ts` (role from the core, `authed()` without `minRole`), new
`lib/access_guard.ts`, all five admin routes on permissions, `/auth/me` returning
`permissions[]`, last-admin protection in PATCH/DELETE (409), and
`test/access_guard.test.ts`. `deno check` plus 20 tests green.

Behaviour change: `moderator` now sees the panel-users list (`panel_users.read`)
but cannot modify it. Previously the list was admin-only.

**2.1** `lib/auth.ts`: drop the local `type Role`, import it from `access/`.
`PanelUser` stays unchanged. Backward compatibility: existing sessions carrying
`admin`/`moderator` keep working; `viewer` is the new role.

**2.2** Move `authed()` from `minRole` to permissions:

```ts
// before
export async function authed(req: Request, minRole?: Role): Promise<PanelUser | null>
  ... if (minRole === "admin" && claims.role !== "admin") return null;

// after — resolves the subject; the caller decides via can()
export async function authed(req: Request): Promise<PanelUser | null>
```

**2.3** `lib/http.ts` (or `access_guard.ts` next to the routes) — one guard replacing
`guard(req, admin)`:

```ts
// 401 when unauthenticated, 403 when authenticated but under-privileged.
export async function requirePermission(
  req: Request,
  permission: Permission,
): Promise<{ user: PanelUser } | { response: Response }> {
  const user = await authed(req);
  if (!user) return { response: json({ error: "unauthorized" }, 401) };
  if (!can(user, permission)) return { response: json({ error: "forbidden" }, 403) };
  return { user };
}
```

**2.4** Move the existing routes in `routes/admin.ts` onto permissions:

| Route | Before | After |
| --- | --- | --- |
| `GET /admin/waitlist` | `guard(req)` | `waitlist.read` |
| `GET /admin/panel-users` | `guard(req, true)` | `panel_users.read` |
| `POST/PATCH/DELETE /admin/panel-users/*` | `guard(req, true)` | `panel_users.write` |

**2.5** Role validation on panel-user create/update: replace the hardcoded
`b.role !== "admin" && b.role !== "moderator"` with `isRole(b.role)`.

**2.6** `GET /auth/me` returns both the role and the expanded permission list, so the
panel never duplicates the role map:

```ts
return json({ id: u.email, email: u.email, role: u.role, permissions: permissionsOf(u.role) });
```

**2.7** Last-admin protection. Found during implementation: the relay had none —
`PATCH` could demote and `DELETE` could remove the only admin, after which nobody
can sign in. Added `isLastAdmin()` in `routes/admin.ts`; both routes answer 409.
`scripts/test-last-admin-guard.sh` exercises the Postgres trigger
`prevent_last_admin_removal` on `public.panel_users` — an artefact of the pre-relay
architecture that does not cover the current path. Open tail: cover `isLastAdmin()`
with a test (needs a storage stub — the only route test that would) and decide the
fate of the old script.

---

## Phase 3. Panel: client-side permissions — ✅ done

Result: `panel/src/access/` (permission catalogue, role names, resource map),
`providers/access.ts`, an `/auth/me` cache in `providers/auth.ts`, the
`Gated`/`Forbidden` components, a menu that checks every item, the panel-users page
on permissions, and `viewer` in the select and badges. `typecheck-panel.sh` clean.

Deviations from the sketch:
- An unmapped resource/action pair is **denied** (the 3.3 sketch had it the other
  way round) — a page with no permission decision must not open for everyone.
- A local `Gated` over `useCan` instead of `CanAccess`: a third state is needed for
  "permissions still loading", otherwise the first render after sign-in shows a
  refusal that then corrects itself.
- The menu checks each item explicitly via `useCan` rather than assuming `useMenu`
  filters by access (unverifiable here without a running stack).

**3.1** `panel/src/access/` — either a copy of the core or one thin module that uses
the `permissions` list from `/auth/me`. Decision: the panel does **not** hold the role
map; it reads the ready permission list from `/auth/me`, so a copy of the core is only
needed for the `Permission` type.

**3.2** `providers/auth.ts`: `getPermissions()` returns a permission array instead of a
role string; cache the `/auth/me` response (it is currently refetched on every
`check`/`getIdentity`/`getPermissions` call).

**3.3** A Refine `accessControlProvider`, registered in `App.tsx`:

```ts
const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const permissions = await loadPermissions();
    const required = PERMISSION_BY_RESOURCE[`${resource}.${action}`];
    return { can: !required || permissions.includes(required) };
  },
};
```

**3.4** The menu (`components/menu/index.tsx`) hides inaccessible sections — Refine
does this itself given an `accessControlProvider`; verify the actual behaviour rather
than assuming it.

**3.5** A 403 page for direct URL access without the permission.

---

## Phase 4. Logs, step 1 — client-errors — ✅ done (Grafana-lite)

Scope widened by the user's decision: not a plain table but a log explorer — a time
window, a histogram of the load, and cursor paging backwards.

Result: `listDetailed()` in `lib/storage.ts`, new `lib/log_reader.ts`, route
`GET /admin/logs-client-errors`, page `pages/logs/client-errors/list.tsx`,
`test/log_reader.test.ts` (7 tests), `scripts/verify-logs-local.sh`. 27 relay unit
tests and the panel typecheck are green; the route was verified live on the local
stand (window, cursor, histogram, 403/401/422).

Deviations and findings:
- **Record keys are random UUIDs** and `list()` returned names only, so ordering by
  time was impossible without reading every object. Added `listDetailed()`, taking
  the timestamp from the listing (Bunny `DateCreated`, mtime on fs). One listing
  instead of thousands of GETs.
- **Bunny timestamps arrive without a zone** (`2025-07-25T10:12:33.123`); read as
  local time they would shift the ordering. Normalised to canonical ISO
  (`canonicalTimestamp`), after which lexicographic comparison is time comparison.
- **Path `/admin/logs-client-errors`**, not `/admin/logs/client-errors`: a nested
  path would have required a data-provider change.
- **The page does not use `dataProvider`/`useList`**: the response is an envelope
  (`rows` plus `total`/`matched`/`truncated` plus `buckets`), which is not the
  list + total contract. It calls `api()` directly, so the provider was never
  touched. The resource stays in Refine for the menu, the route and the access gate.
- **Message search covers the loaded window only.** Full-text search over all time
  would mean reading every object in the period — that needs an index (Loki, option
  (c) in 6.1). A storage limitation, not a UI one.
- To verify locally, `SESSION_SECRET`/`PANEL_URL` were added to
  `relay/local/docker-compose.yml` (panel auth could not be exercised on the stand
  at all before) along with `relay/node/tools/mint_panel_token.ts`.
- Auto-refresh (live tail) was not built — the user's choice.

### Original phase 4 plan

**4.1** `GET /admin/logs/client-errors` behind `logs.client_errors.read`: reads the
`client-errors/<env>/` prefix, sorts by `received_at` descending, sets `x-total-count`.

**4.2** Bound the read: the prefix grows without limit. Pick a cap (e.g. the newest N
objects) and report truncation **explicitly** in the response — silent truncation reads
as "these are all the logs".

**4.3** Page `panel/src/pages/logs/client-errors/list.tsx`: table of
`received_at / kind / message / page_url / source`, row expansion for `stack` and
`extra`, filters by `kind` and a `message` substring.

**4.4** Register the `logs_client_errors` resource in `App.tsx` (the data provider
already maps `_` → `-`, so no provider change is needed).

**4.5** e2e tests in `panel/tests/e2e/`: an admin sees the page; `viewer` gets 403;
unauthenticated gets 401.

---

## Phase 5. Logs, step 2 — panel audit log — ✅ done

Result: `lib/audit.ts`, event recording in every mutating admin route (refusals
included), route `GET /admin/logs-audit`, the shared `components/log-explorer/`
component with both log pages built on it, and `scripts/verify-audit-local.sh`.
27 relay tests and the panel typecheck are green; the trail was verified live —
six events, two of them refusals with reasons.

Decisions and findings:
- **Refusals are recorded** (403 and 409). For that, a denied `AccessResult` now
  carries the actor: a 401 has nobody to name, a 403 does.
- **`LogExplorer` was extracted** (window, histogram, cursor, filters) and the
  client-errors page rewritten on top of it: both pages are now ~25 lines, and the
  third one (server logs, phase 6) comes nearly free.
- **`DELETE` of a missing user answered 200** and wrote a "deleted" event. A trail
  must not claim what did not happen — it is 404 now, like `PATCH`.
- A no-op `PATCH` (unchanged role) is recorded too: someone opened the role and
  pressed save, and that is an event.
- Found while verifying: addresses like `admin@local` fail validation (no TLD).
  That is `isEmail` behaving correctly; the verification script uses a `.test` domain.

### Original phase 5 plan

**5.1** Record shape (new `audit/<env>/` prefix):

```ts
interface AuditEvent {
  id: string;            // uuid
  at: string;            // ISO
  actor_email: string;
  action: string;        // "panel_users.create" | "panel_users.role_change" | ...
  target: string | null; // email/identifier of the object
  before: unknown;       // null on create
  after: unknown;        // null on delete
  node: string;
  env: string;
}
```

**5.2** `lib/audit.ts` — `recordAuditEvent(...)`, fire-and-forget; a write failure never
breaks the primary operation (same discipline as `client_error.ts`).

**5.3** Call it from every mutating admin route: panel-user create/patch/delete. Decide
and record whether denied attempts (403) are logged — proposal: yes, under a distinct
`action` marked as denied.

**5.4** `GET /admin/logs/audit` behind `logs.audit.read`, plus
`pages/logs/audit/list.tsx` with actor and action filters.

**5.5** Test: changing a user's role produces exactly one audit record with correct
`before`/`after`.

---

## Phase 6. Logs, step 3 — relay server logs — ✅ done (option a)

Decision on 6.1: `log.ts` additionally writes `warn`/`error` to
`server-logs/<env>/`. Result: the sink in `lib/log.ts`, route
`GET /admin/logs-server` behind `logs.server.read` (admin only), page
`pages/logs/server/list.tsx`, `test/log_sink.test.ts`, and
`scripts/verify-server-logs-local.sh`. 29 relay tests and the panel typecheck are
green; verified live against a real node failure.

Decisions:
- **Storm guard.** A node in trouble logs in bursts, and every persisted line is a
  storage request. Past 32 writes in flight the copy is dropped, and the number
  dropped rides along as `dropped_before` on the next line that gets through — a
  reader sees the gap instead of silently reading a partial picture. stdout still
  has everything.
- **No recursion.** A failed write goes straight to `console.error` rather than
  through `log()`, which would make every failed write produce another attempt.
- **`info` is not stored** — it is one line per request, so one object per
  request. The script proves it by comparing counts rather than asserting it.

Deliberately not done, pending a decision: direct `console.error` calls bypass the
sink — `lib/mailer.ts:24,50` (Resend responses), `routes/waitlist.ts:72`,
`routes/client_error.ts:31`, `config.ts:38,93,104,107` (boot warnings, where
storage is not configured yet). They will not appear in the panel until they move
to `log()`.

Also not done: retention. The prefix grows without bound.

### Original phase 6 plan

**6.1** Choose the source (a decision is needed before implementation):
- (a) `lib/log.ts` additionally writes `warn`/`error` to Bunny Storage
  (`server-logs/<env>/`) — simple, but loses `info` and adds a write per error;
- (b) an endpoint reading `docker logs`/journald on the node — the full stream, but
  requires socket/systemd access from the relay container;
- (c) an external collector (Loki) with the panel linking out to it — outside current scope.

**6.2** Implement the chosen source and add retention (otherwise the prefix grows forever).

**6.3** `GET /admin/logs/server` behind `logs.server.read` — admin only, with level and
time-window filters.

**6.4** Page `pages/logs/server/list.tsx`: monospace, level filter, optional
auto-refresh (off by default — needless requests).

**6.5** Verify no secrets leak into the response: `config.session.secret`, Bunny keys,
SMTP credentials. Use an explicit field allow-list, not a blacklist.

---

## Phase 7. Wrap-up

**7.1** `scripts/typecheck-panel.sh` and `scripts/run-panel-tests.sh` — green.
**7.2** Relay unit tests — green.
**7.3** `docs/panel_RU.md` / `docs/panel_EN.md` — document roles, the permission table,
and the log pages.
**7.4** README synchronization per the project rule: `xor.ad`, `sosed.place`,
`neighbro.place` — EN/RU pairs consistent, shared facts aligned.
**7.5** Sweep the code to confirm no `guard(req, admin)` call sites remain — one
permission model, not two in parallel.

---

## Deliberately out of scope

- Per-user grant/deny on top of a role — deferred; the core extends by adding a field to
  `AccessSubject` without changing the `can()` contract for callers.
- A separate repository or npm package for `access/` — porting is a directory copy.
- Role hierarchy (inheritance) — a flat map reads more clearly and reviews well in git.
