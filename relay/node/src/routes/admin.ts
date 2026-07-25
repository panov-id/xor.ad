// Panel control-plane routes: passwordless auth + admin resources over Bunny
// Storage. Registered on import (side effect) via the pattern router. Adding a
// new panel resource = one more `route(...)` block over a stored collection,
// named by the permission it requires.

import { route } from "../lib/router.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { type LogWindow, readLogPage } from "../lib/log_reader.ts";
import { auditDir, recordAuditEvent } from "../lib/audit.ts";
import { authed, getUser, type PanelUser, requestMagicLink, redeem, usersDir } from "../lib/auth.ts";
import { isRole, permissionsOf } from "../access/index.ts";
import { del, get, list, put } from "../lib/storage.ts";
import { sha256hex } from "../lib/hash.ts";
import { config } from "../config.ts";

// Load every object under a prefix (small collections; leads are in the low
// hundreds). Returns parsed records, dropping any that failed to read.
async function collection<T>(dir: string): Promise<T[]> {
  const files = await list(dir);
  const rows = await Promise.all(files.map((f) => get<T>(`${dir}/${f}`)));
  return rows.filter((r) => r !== null) as T[];
}

// Refuse to leave the panel without an administrator: the last admin can neither
// be demoted nor deleted, or nobody could sign in to fix it.
async function isLastAdmin(email: string): Promise<boolean> {
  const admins = (await collection<PanelUser>(usersDir()))
    .filter((panelUser) => panelUser.role === "admin");
  return admins.length <= 1 && admins.some((panelUser) => panelUser.email === email);
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
    permissions: permissionsOf(user.role),
  });
});

// --- waitlist -----------------------------------------------------------------

route("GET", "/admin/waitlist", async ({ req }) => {
  const access = await requirePermission(req, "waitlist.read");
  if (isDenied(access)) return access.response;
  const dir = `waitlist/${config.envName}`;
  const rows = await collection<Record<string, unknown>>(dir);
  const data = rows
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((r) => ({ id: r.email, ...r }));
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
  const page = await readLogPage<Record<string, unknown>>(
    `client-errors/${config.envName}`,
    window,
    HISTOGRAM_BUCKETS,
  );
  return json(page);
});

route("GET", "/admin/logs-audit", async ({ req, url }) => {
  const access = await requirePermission(req, "logs.audit.read");
  if (isDenied(access)) return access.response;
  const window = readWindow(url);
  if (!window) return json({ error: "invalid from/to/before — expected a timestamp" }, 422);
  const page = await readLogPage<Record<string, unknown>>(auditDir(), window, HISTOGRAM_BUCKETS);
  return json(page);
});

// --- panel_users CRUD ---------------------------------------------------------

route("GET", "/admin/panel-users", async ({ req }) => {
  const access = await requirePermission(req, "panel_users.read");
  if (isDenied(access)) return access.response;
  const rows = await collection<PanelUser>(usersDir());
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
  const body = await readJson<{ email?: unknown; role?: unknown }>(req);
  if (!body || !isEmail(body.email) || !isRole(body.role)) {
    return json({ error: "invalid email or role" }, 422);
  }
  const email = body.email.trim().toLowerCase();
  const user: PanelUser = { email, role: body.role, created_at: new Date().toISOString() };
  await put(`${usersDir()}/${await sha256hex(email)}.json`, user);
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
  const body = await readJson<{ role?: unknown }>(req);
  if (body?.role !== undefined && !isRole(body.role)) {
    return json({ error: "invalid role" }, 422);
  }
  const nextRole = (body?.role as PanelUser["role"]) ?? existing.role;
  if (existing.role === "admin" && nextRole !== "admin" && await isLastAdmin(email)) {
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
  await put(`${usersDir()}/${await sha256hex(email)}.json`, user);
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
  if (await isLastAdmin(email)) {
    recordAuditEvent({
      actor: access.user,
      action: "panel_users.delete",
      target: email,
      outcome: "denied",
      reason: "the last administrator cannot be deleted",
    });
    return json({ error: "the last administrator cannot be deleted" }, 409);
  }
  await del(`${usersDir()}/${await sha256hex(email)}.json`);
  recordAuditEvent({
    actor: access.user,
    action: "panel_users.delete",
    target: email,
    before: existing,
  });
  return json({ id: email });
});
