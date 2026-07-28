// Panel control-plane routes: passwordless auth + admin resources over Bunny
// Storage. Registered on import (side effect) via the pattern router. Adding a
// new panel resource = one more `route(...)` block over a stored collection,
// named by the permission it requires.

import { route } from "../lib/router.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { type LogPage, type LogScope, type LogWindow, readLogPage } from "../lib/log_reader.ts";
import { auditDir, recordAuditEvent } from "../lib/audit.ts";
import { authed, getUser, type PanelUser, requestMagicLink, redeem, usersDir } from "../lib/auth.ts";
import { isRole, permissionsOf } from "../access/index.ts";
// No route reaches storage directly: everything goes through a scope. The
// platform scope is an empty prefix, so its paths are byte-identical to the
// pre-tenancy ones.
import { scoped, type ScopedStorage, scopedForBrand } from "../lib/scoped_storage.ts";
import {
  allBrands,
  type BrandInput,
  brandByKey,
  brandProblem,
  isStoredBrand,
  saveBrand,
} from "../lib/brand_registry.ts";
import {
  createPublishableKey,
  isOrigin,
  listPublishableKeys,
  revokePublishableKey,
} from "../lib/api_key.ts";
import { sha256hex } from "../lib/hash.ts";
import { config } from "../config.ts";

// Load every object under a prefix (small collections; leads are in the low
// hundreds). Returns parsed records, dropping any that failed to read.
async function collection<T>(store: ScopedStorage, dir: string): Promise<T[]> {
  const files = await store.list(dir);
  const rows = await Promise.all(files.map((file) => store.get<T>(`${dir}/${file}`)));
  return rows.filter((row) => row !== null) as T[];
}

const platform = scopedForBrand(null);

// Which storage scopes may this reader see? A tenant sees exactly one. The
// platform sees every tenant plus the pre-migration root, so nothing written
// before the migration disappears from the panel while it is pending.
async function scopesFor(user: PanelUser): Promise<ScopedStorage[]> {
  if (user.brand) return [scoped(user)];
  return [platform, ...(await allBrands()).map((brand) => scopedForBrand(brand.key))];
}

// A tenant sees only its own operators; the platform sees everyone. Invisible is
// treated as non-existent (404, not 403): whether an email is registered under
// another tenant is not a tenant's business.
function visible(reader: PanelUser, target: PanelUser): boolean {
  return reader.brand === null || reader.brand === (target.brand ?? null);
}

// Refuse to leave a scope without an administrator: its last one can neither be
// demoted nor deleted, or nobody could sign in to fix it. The platform's
// administrator is "admin", a tenant's is "tenant_admin".
//
// The guard exists to keep a scope reachable, so it only binds someone who could
// otherwise lock themselves out. A tenant cannot remove its own last operator —
// there would be nobody left inside to undo it. The platform can remove a
// tenant's, because the platform is the way back in: it creates that operator in
// the first place. Without this, a typo in the address at onboarding produced an
// account nobody could delete or fix from the panel at all.
async function isLastAdmin(actor: PanelUser, target: PanelUser): Promise<boolean> {
  const brand = target.brand ?? null;
  if (brand !== null && actor.brand === null) return false; // the platform can undo its own doing
  const adminRole = brand === null ? "admin" : "tenant_admin";
  if (target.role !== adminRole) return false;
  const admins = (await collection<PanelUser>(platform, usersDir()))
    .filter((panelUser) => (panelUser.brand ?? null) === brand && panelUser.role === adminRole);
  return admins.length <= 1 && admins.some((panelUser) => panelUser.email === target.email);
}

// Not a tenant: the collection of records that arrived without a usable key, so
// nobody could be named as their owner. It lives in the platform's own space and
// only the platform reads it — for a tenant it is not a scope but a 403.
const UNATTRIBUTED = "unattributed";
// The pre-tenancy root. After a migration it is empty, which is exactly why it
// must be asked for by name rather than being what a reader gets by default:
// showing an empty archive to someone whose data sits under a tenant is how the
// panel came to look broken.
const PLATFORM_ARCHIVE = "platform";

// Merging listings is cheap per scope and linear in their number, so the platform
// reads every tenant at once — until there are enough tenants for that to be a
// fan-out. Past this many, a reader picks one, and the response says so instead
// of quietly showing part of the picture.
const MAX_MERGED_SCOPES = 10;

interface LogScopes {
  scopes: LogScope[];
  // What the reader is actually looking at, echoed back so the panel can label
  // the switcher and admit when the merge was capped.
  mode: "all" | "one";
  merged: number;
  available: number;
}

// `?brand=` picks one collection; without it a tenant gets their own and the
// platform gets every tenant merged. The merge is honest: ordering and paging are
// time-based, so several listings interleave without renumbering anything.
async function logScopes(user: PanelUser, url: URL): Promise<LogScopes | Response> {
  const asked = url.searchParams.get("brand");
  const brands = await allBrands();

  if (asked === UNATTRIBUTED) {
    if (user.brand !== null) return json({ error: "forbidden" }, 403);
    return { scopes: [{ label: UNATTRIBUTED, source: platform }], mode: "one", merged: 1, available: 1 };
  }
  if (asked === PLATFORM_ARCHIVE) {
    if (user.brand !== null) return json({ error: "forbidden" }, 403);
    return { scopes: [{ label: PLATFORM_ARCHIVE, source: platform }], mode: "one", merged: 1, available: 1 };
  }
  if (asked) {
    if (user.brand && asked !== user.brand) return json({ error: "forbidden" }, 403);
    if (!brands.some((brand) => brand.key === asked)) return json({ error: "unknown brand" }, 404);
    return { scopes: [{ label: asked, source: scopedForBrand(asked) }], mode: "one", merged: 1, available: 1 };
  }

  // A tenant has exactly one collection, so "all" and "their own" are the same
  // page — no reason to make them choose.
  if (user.brand) {
    return {
      scopes: [{ label: user.brand, source: scoped(user) }],
      mode: "one",
      merged: 1,
      available: 1,
    };
  }

  const merged = brands.slice(0, MAX_MERGED_SCOPES);
  return {
    scopes: merged.map((brand) => ({ label: brand.key, source: scopedForBrand(brand.key) })),
    mode: "all",
    merged: merged.length,
    available: brands.length,
  };
}

// The envelope the log routes answer with: the page plus what it was read from.
function logResponse(page: LogPage<Record<string, unknown>>, scopes: LogScopes): Response {
  return json({
    ...page,
    scope: {
      mode: scopes.mode,
      of: scopes.scopes.map((scope) => scope.label),
      // Set when there are more tenants than one page may merge — the panel says
      // so rather than presenting a partial view as the whole.
      capped: scopes.available > scopes.merged ? scopes.available : undefined,
    },
  });
}

// A log read is always capped: the collections grow without bound and every
// object costs a request. The client may ask for less, never for more.
const LOG_LIMIT_DEFAULT = 200;
const LOG_LIMIT_MAX = 500;
const HISTOGRAM_BUCKETS = 32;

// Parse the window from the query string. Returns null on a malformed timestamp
// so the caller answers 422 — a silently ignored bound would show the wrong data
// under the right-looking controls.
function readWindow(url: URL): LogWindow | null {
  const requested = Number(url.searchParams.get("limit") ?? LOG_LIMIT_DEFAULT);
  const window: LogWindow = {
    limit: Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), LOG_LIMIT_MAX)
      : LOG_LIMIT_DEFAULT,
  };
  for (const name of ["from", "to", "before"] as const) {
    const raw = url.searchParams.get(name);
    if (raw === null) continue;
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return null;
    window[name] = new Date(parsed).toISOString();
  }
  return window;
}

// --- auth ---------------------------------------------------------------------

route("POST", "/auth/request-link", async ({ req }) => {
  const body = await readJson<{ email?: string }>(req);
  if (body?.email) await requestMagicLink(body.email);
  return new Response(null, { status: 204 }); // always 204, no body — never reveal membership
});

route("GET", "/auth/callback", async ({ url }) => {
  const jwt = await redeem(url.searchParams.get("token") || "");
  return jwt ? json({ token: jwt }) : json({ error: "invalid or expired link" }, 401);
});

// Returns the role and its expanded permissions, so the panel never carries a
// copy of the role map — it just checks membership in this list.
route("GET", "/auth/me", async ({ req }) => {
  const user = await authed(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({
    id: user.email,
    email: user.email,
    role: user.role,
    // The panel needs to know whose operator this is: to label the header and to
    // hide the platform-only pages.
    brand: user.brand,
    permissions: permissionsOf(user.role),
  });
});

// --- waitlist -----------------------------------------------------------------

route("GET", "/admin/waitlist", async ({ req }) => {
  const access = await requirePermission(req, "waitlist.read");
  if (isDenied(access)) return access.response;
  const dir = `waitlist/${config.envName}`;
  const perScope = await Promise.all(
    (await scopesFor(access.user)).map(async (store) =>
      (await collection<Record<string, unknown>>(store, dir))
        // Annotated: spreading over a literal drops the index signature, and the
        // rows are free-form records by design.
        .map((row): Record<string, unknown> => ({ ...row, brand: row.brand ?? store.brand }))
    ),
  );
  // One email may now exist in several tenants, so the row id carries the brand
  // too; without it the panel would collapse two different leads into one.
  const data = perScope.flat()
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((row) => ({ id: `${String(row.brand ?? "-")}:${String(row.email)}`, ...row }));
  return json(data, 200, { "x-total-count": String(data.length) });
});

// --- logs ---------------------------------------------------------------------

// Not a plain collection: the response is an envelope with the window's totals
// and histogram, so the panel's log page talks to this route directly instead of
// through the Refine data provider (whose contract is list + total).
route("GET", "/admin/logs-client-errors", async ({ req, url }) => {
  const access = await requirePermission(req, "logs.client_errors.read");
  if (isDenied(access)) return access.response;
  const window = readWindow(url);
  if (!window) return json({ error: "invalid from/to/before — expected a timestamp" }, 422);
  const scopes = await logScopes(access.user, url);
  if (scopes instanceof Response) return scopes;
  // Same shape, different collection: the unattributed records sit beside the
  // owned ones rather than inside them (routes/client_error.ts).
  const collectionName = url.searchParams.get("brand") === UNATTRIBUTED
    ? "client-errors-unattributed"
    : "client-errors";
  const page = await readLogPage<Record<string, unknown>>(
    scopes.scopes,
    `${collectionName}/${config.envName}`,
    window,
    HISTOGRAM_BUCKETS,
  );
  return logResponse(page, scopes);
});

// The landing's own page counter (routes/pageview.ts). A tenant's traffic is
// theirs, so this reads through the caller's scope like the client errors do.
route("GET", "/admin/logs-pageviews", async ({ req, url }) => {
  const access = await requirePermission(req, "logs.pageviews.read");
  if (isDenied(access)) return access.response;
  const window = readWindow(url);
  if (!window) return json({ error: "invalid from/to/before — expected a timestamp" }, 422);
  const scopes = await logScopes(access.user, url);
  if (scopes instanceof Response) return scopes;
  const page = await readLogPage<Record<string, unknown>>(
    scopes.scopes,
    `pageviews/${config.envName}`,
    window,
    HISTOGRAM_BUCKETS,
  );
  return logResponse(page, scopes);
});

// The node's own warn/error lines, copied here by lib/log.ts. Admin-only: they
// carry internal detail (routes, upstream errors) the other roles do not need.
route("GET", "/admin/logs-server", async ({ req, url }) => {
  const access = await requirePermission(req, "logs.server.read");
  if (isDenied(access)) return access.response;
  // Belt and braces: the permission says "may read node logs", this says "and
  // only the platform has node logs at all".
  if (access.user.brand !== null) return json({ error: "forbidden" }, 403);
  const window = readWindow(url);
  if (!window) return json({ error: "invalid from/to/before — expected a timestamp" }, 422);
  // node-wide logs are the platform's, never a tenant's, so there is nothing to
  // merge and nothing to choose.
  const scopes: LogScopes = {
    scopes: [{ label: "platform", source: platform }],
    mode: "one",
    merged: 1,
    available: 1,
  };
  const page = await readLogPage<Record<string, unknown>>(
    scopes.scopes,
    `server-logs/${config.envName}`,
    window,
    HISTOGRAM_BUCKETS,
  );
  return logResponse(page, scopes);
});

route("GET", "/admin/logs-audit", async ({ req, url }) => {
  const access = await requirePermission(req, "logs.audit.read");
  if (isDenied(access)) return access.response;
  const window = readWindow(url);
  if (!window) return json({ error: "invalid from/to/before — expected a timestamp" }, 422);
  // One platform-wide trail, filtered per reader — a single collection, so the
  // scope switcher has nothing to offer here either.
  const scopes: LogScopes = {
    scopes: [{ label: access.user.brand ?? "platform", source: platform }],
    mode: "one",
    merged: 1,
    available: 1,
  };
  const page = await readLogPage<Record<string, unknown>>(
    scopes.scopes,
    auditDir(),
    window,
    HISTOGRAM_BUCKETS,
    // Which is this: a tenant reads its own slice of the shared trail, the
    // platform reads all of it. Entries written before tenancy carry no
    // actor_brand and belong to the platform, so a tenant does not see them.
    access.user.brand === null
      ? undefined
      : (record) => record.actor_brand === access.user.brand,
  );
  return logResponse(page, scopes);
});

// --- brands -------------------------------------------------------------------

// The tenant registry, for the platform's brand switcher. A tenant has no
// brands.read permission and no second brand to switch to, so this is
// platform-only by permission alone.
route("GET", "/admin/brands", async ({ req }) => {
  const access = await requirePermission(req, "brands.read");
  if (isDenied(access)) return access.response;
  const stored = await Promise.all(
    (await allBrands()).map(async (brand) => ({
      id: brand.key,
      key: brand.key,
      name: brand.name,
      domain: brand.domain,
      from: brand.from,
      // A seeded brand comes from the environment and cannot be edited here; the
      // panel needs to know so it can say why rather than fail on save.
      source: (await isStoredBrand(brand.key)) ? "registry" : "environment",
    })),
  );
  return json(stored, 200, { "x-total-count": String(stored.length) });
});

// Onboarding a tenant is a write, not a redeploy. Platform only: a tenant has no
// brands.write, and nothing here is scoped to one brand anyway.
route("POST", "/admin/brands", async ({ req }) => {
  const access = await requirePermission(req, "brands.write");
  if (isDenied(access)) return access.response;
  if (access.user.brand !== null) return json({ error: "forbidden" }, 403);

  const body = await readJson<Partial<BrandInput>>(req);
  if (!body) return json({ error: "invalid body" }, 422);
  const problem = brandProblem(body);
  if (problem) return json({ error: problem }, 422);

  const existing = await brandByKey(body.key!);
  if (existing && !(await isStoredBrand(body.key!))) {
    // Writing one would shadow the seed with a copy that drifts from it.
    return json({ error: `"${body.key}" is seeded from the environment and cannot be edited here` }, 409);
  }

  const brand = await saveBrand(body as BrandInput);
  recordAuditEvent({
    actor: access.user,
    action: existing ? "brands.update" : "brands.create",
    target: brand.key,
  });
  return json({ id: brand.key, ...brand }, existing ? 200 : 201);
});

// --- publishable keys ---------------------------------------------------------

// A tenant sees and mints only its own; the platform sees every key. The key
// itself is public by design, so it is returned in full — there is nothing here
// that a landing page does not already ship.
route("GET", "/admin/api-keys", async ({ req }) => {
  const access = await requirePermission(req, "api_keys.read");
  if (isDenied(access)) return access.response;
  // The key's own id is the row id: Refine wants one, and inventing a second
  // identifier for something that already has a public one would be noise.
  const keys = (await listPublishableKeys())
    .filter((key) => access.user.brand === null || key.brand === access.user.brand);
  return json(keys, 200, { "x-total-count": String(keys.length) });
});

route("POST", "/admin/api-keys", async ({ req }) => {
  const access = await requirePermission(req, "api_keys.write");
  if (isDenied(access)) return access.response;

  const body = await readJson<{ brand?: unknown; origins?: unknown }>(req);
  if (!body) return json({ error: "invalid body" }, 422);

  // A tenant may only mint for itself, whatever the body says — the same rule
  // the public routes follow, for the same reason.
  const brand = access.user.brand ?? (typeof body.brand === "string" ? body.brand : "");
  if (!brand) return json({ error: "brand is required" }, 422);
  if (access.user.brand !== null && brand !== access.user.brand) {
    return json({ error: "forbidden" }, 403);
  }
  if (!(await brandByKey(brand))) return json({ error: "unknown brand" }, 404);

  const origins = Array.isArray(body.origins) ? body.origins.map(String).filter(Boolean) : [];
  const bad = origins.filter((origin) => !isOrigin(origin));
  if (bad.length) {
    return json({ error: `not an origin: ${bad.join(", ")} — expected https://example.com` }, 422);
  }
  // An empty allowlist accepts any site. Fine on a stand, not on an environment
  // whose landings are public, so it is refused where it would matter.
  if (origins.length === 0 && config.requireApiKey) {
    return json({ error: "at least one origin is required in this environment" }, 422);
  }

  const key = await createPublishableKey(brand, origins);
  recordAuditEvent({ actor: access.user, action: "api_keys.create", target: key.id });
  return json(key, 201);
});

route("POST", "/admin/api-keys/:id/revoke", async ({ req, params }) => {
  const access = await requirePermission(req, "api_keys.write");
  if (isDenied(access)) return access.response;

  const existing = (await listPublishableKeys()).find((key) => key.id === params.id);
  // Invisible is treated as absent: whether a key exists under another tenant is
  // not this tenant's business.
  if (!existing || (access.user.brand !== null && existing.brand !== access.user.brand)) {
    return json({ error: "not found" }, 404);
  }

  const revoked = await revokePublishableKey(params.id);
  recordAuditEvent({ actor: access.user, action: "api_keys.revoke", target: params.id });
  // The landing using this key starts failing within the lookup TTL, not
  // instantly — worth saying out loud rather than implying immediacy.
  return json({ ...revoked, takes_effect_within_seconds: 60 });
});

// --- panel_users CRUD ---------------------------------------------------------

route("GET", "/admin/panel-users", async ({ req }) => {
  const access = await requirePermission(req, "panel_users.read");
  if (isDenied(access)) return access.response;
  const rows = (await collection<PanelUser>(platform, usersDir()))
    .filter((panelUser) => visible(access.user, panelUser));
  const data = rows.map((panelUser) => ({ id: panelUser.email, ...panelUser }));
  return json(data, 200, { "x-total-count": String(data.length) });
});

route("POST", "/admin/panel-users", async ({ req }) => {
  const access = await requirePermission(req, "panel_users.write");
  if (isDenied(access)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.create",
      outcome: "denied",
      reason: "permission denied",
    });
    return access.response;
  }
  const body = await readJson<{ email?: unknown; role?: unknown; brand?: unknown }>(req);
  if (!body || !isEmail(body.email) || !isRole(body.role)) {
    return json({ error: "invalid email or role" }, 422);
  }
  // A tenant may only hand out tenant roles. "admin" carries the wildcard, and
  // the wildcard includes platform-wide permissions — a tenant must not be able
  // to mint one, even inside its own brand.
  if (access.user.brand !== null && body.role === "admin") {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.create",
      target: body.email.trim().toLowerCase(),
      outcome: "denied",
      reason: "a tenant cannot grant the platform administrator role",
    });
    return json({ error: "role not available to a tenant" }, 403);
  }
  const email = body.email.trim().toLowerCase();

  // Whose operator is this? A tenant may only create its own, so the body is
  // ignored for them. The platform may name a tenant — and has to be able to,
  // or a tenant's first administrator could never be created and onboarding
  // would end at the brand.
  let brand = access.user.brand;
  if (access.user.brand === null && typeof body.brand === "string" && body.brand !== "") {
    if (!(await brandByKey(body.brand))) return json({ error: "unknown brand" }, 404);
    // "admin" carries the wildcard, which is platform-wide by definition; inside
    // a tenant it would mean everything, everywhere.
    if (body.role === "admin") {
      return json({ error: "a tenant's operator cannot hold the platform role" }, 422);
    }
    brand = body.brand;
  }

  const user: PanelUser = {
    email,
    role: body.role,
    brand,
    created_at: new Date().toISOString(),
  };
  await platform.put(`${usersDir()}/${await sha256hex(email)}.json`, user);
  recordAuditEvent({
    actor: access.user,
    action: "panel_users.create",
    target: email,
    after: user,
  });
  return json({ id: email, ...user });
});

route("PATCH", "/admin/panel-users/:email", async ({ req, params }) => {
  const access = await requirePermission(req, "panel_users.write");
  const email = params.email.trim().toLowerCase();
  if (isDenied(access)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.role_change",
      target: email,
      outcome: "denied",
      reason: "permission denied",
    });
    return access.response;
  }
  const existing = await getUser(email);
  if (!existing) return json({ error: "not found" }, 404);
  if (!visible(access.user, existing)) return json({ error: "not found" }, 404);
  const body = await readJson<{ role?: unknown }>(req);
  if (body?.role !== undefined && !isRole(body.role)) {
    return json({ error: "invalid role" }, 422);
  }
  const nextRole = (body?.role as PanelUser["role"]) ?? existing.role;
  if (nextRole !== existing.role && await isLastAdmin(access.user, existing)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.role_change",
      target: email,
      outcome: "denied",
      reason: "the last administrator cannot be demoted",
      before: existing,
    });
    return json({ error: "the last administrator cannot be demoted" }, 409);
  }
  const user: PanelUser = { ...existing, role: nextRole };
  await platform.put(`${usersDir()}/${await sha256hex(email)}.json`, user);
  // A no-op PATCH is still an event: someone opened the role and pressed save.
  recordAuditEvent({
    actor: access.user,
    action: "panel_users.role_change",
    target: email,
    before: existing,
    after: user,
  });
  return json({ id: email, ...user });
});

route("DELETE", "/admin/panel-users/:email", async ({ req, params }) => {
  const access = await requirePermission(req, "panel_users.write");
  const email = params.email.trim().toLowerCase();
  if (isDenied(access)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.delete",
      target: email,
      outcome: "denied",
      reason: "permission denied",
    });
    return access.response;
  }
  // Checked before deleting so the audit trail cannot claim a deletion that
  // removed nothing (the store treats a missing object as already gone).
  const existing = await getUser(email);
  if (!existing) return json({ error: "not found" }, 404);
  if (!visible(access.user, existing)) return json({ error: "not found" }, 404);
  if (await isLastAdmin(access.user, existing)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.delete",
      target: email,
      outcome: "denied",
      reason: "the last administrator cannot be deleted",
    });
    return json({ error: "the last administrator cannot be deleted" }, 409);
  }
  await platform.del(`${usersDir()}/${await sha256hex(email)}.json`);
  recordAuditEvent({
    actor: access.user,
    action: "panel_users.delete",
    target: email,
    before: existing,
  });
  return json({ id: email });
});
