// Panel control-plane routes: passwordless auth + admin resources over Bunny
// Storage. Registered on import (side effect) via the pattern router. Adding a
// new panel resource = one more `route(...)` block over a stored collection.

import { route } from "../lib/router.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { authed, getUser, type PanelUser, requestMagicLink, redeem, usersDir } from "../lib/auth.ts";
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

// --- auth ---------------------------------------------------------------------

route("POST", "/auth/request-link", async ({ req }) => {
  const body = await readJson<{ email?: string }>(req);
  if (body?.email) await requestMagicLink(body.email);
  return json({ ok: true }, 204); // always 204 — never reveal membership
});

route("GET", "/auth/callback", async ({ url }) => {
  const jwt = await redeem(url.searchParams.get("token") || "");
  return jwt ? json({ token: jwt }) : json({ error: "invalid or expired link" }, 401);
});

route("GET", "/auth/me", async ({ req }) => {
  const u = await authed(req);
  return u ? json({ id: u.email, email: u.email, role: u.role }) : json({ error: "unauthorized" }, 401);
});

// --- waitlist (any authenticated panel member) --------------------------------

route("GET", "/admin/waitlist", async ({ req }) => {
  if (!await authed(req)) return json({ error: "unauthorized" }, 401);
  const dir = `waitlist/${config.envName}`;
  const rows = await collection<Record<string, unknown>>(dir);
  const data = rows
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((r) => ({ id: r.email, ...r }));
  return json(data, 200, { "x-total-count": String(data.length) });
});

// --- panel_users CRUD (admin only) -------------------------------------------

route("GET", "/admin/panel-users", async ({ req }) => {
  if (!await authed(req, "admin")) return json({ error: "forbidden" }, 403);
  const rows = await collection<PanelUser>(usersDir());
  const data = rows.map((u) => ({ id: u.email, ...u }));
  return json(data, 200, { "x-total-count": String(data.length) });
});

route("POST", "/admin/panel-users", async ({ req }) => {
  if (!await authed(req, "admin")) return json({ error: "forbidden" }, 403);
  const b = await readJson<{ email?: unknown; role?: unknown }>(req);
  if (!b || !isEmail(b.email) || (b.role !== "admin" && b.role !== "moderator")) {
    return json({ error: "invalid email or role" }, 422);
  }
  const email = b.email.trim().toLowerCase();
  const user: PanelUser = { email, role: b.role, created_at: new Date().toISOString() };
  await put(`${usersDir()}/${await sha256hex(email)}.json`, user);
  return json({ id: email, ...user });
});

route("PATCH", "/admin/panel-users/:email", async ({ req, params }) => {
  if (!await authed(req, "admin")) return json({ error: "forbidden" }, 403);
  const email = params.email.trim().toLowerCase();
  const existing = await getUser(email);
  if (!existing) return json({ error: "not found" }, 404);
  const b = await readJson<{ role?: unknown }>(req);
  if (b?.role !== undefined && b.role !== "admin" && b.role !== "moderator") {
    return json({ error: "invalid role" }, 422);
  }
  const user: PanelUser = { ...existing, role: (b?.role as PanelUser["role"]) ?? existing.role };
  await put(`${usersDir()}/${await sha256hex(email)}.json`, user);
  return json({ id: email, ...user });
});

route("DELETE", "/admin/panel-users/:email", async ({ req, params }) => {
  if (!await authed(req, "admin")) return json({ error: "forbidden" }, 403);
  const email = params.email.trim().toLowerCase();
  await del(`${usersDir()}/${await sha256hex(email)}.json`);
  return json({ id: email });
});
