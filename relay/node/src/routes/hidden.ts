// Step 7: hiding a phrase for oneself (chat spec §8.9, protocol §4.8).
//
// From the "…" menu of a card: the phrase leaves the caller's own feed and
// nobody else's, and its author never learns. POST answers 200 {id} — the
// opaque handle for taking it back, not the phrase's id. GET lists what is
// hidden for screen 10; the list is short-lived by construction, a phrase lives
// until its own end. DELETE answers 204 for someone else's id too (SEC-14).
//
// Not here yet: hiding a table's line, which is the outcome of a complaint
// rather than a menu item (screen 19) — there are no tables.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { checkAll, HIDDEN_LIMITS } from "../lib/rate_limit.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;

async function hide(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const body = await readJson<{ feed?: unknown }>(req);
  const feed = typeof body?.feed === "string" && UUID.test(body.feed) ? body.feed : null;
  if (!feed) return refuse("invalid_body", "feed must be a phrase id", 400);
  const allowed = checkAll(HIDDEN_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many hidden this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  // A repeat answers the same handle; a phrase that is gone is a 404 — it is
  // the caller's own screen that named it, there is nothing to guess here.
  const rows = await query<{ id: string }>(
    `INSERT INTO hidden_messages (identity, feed_message_id)
     SELECT $1, f.id FROM feed_messages f WHERE f.id = $2 AND f.visible_at IS NOT NULL
     ON CONFLICT (identity, feed_message_id) DO UPDATE SET identity = EXCLUDED.identity
     RETURNING id`,
    [caller.identityId, feed],
  );
  if (rows === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (rows.length === 0) return refuse("not_found", "no such phrase", 404);
  return json({ id: rows[0].id }, 200, sunsetHeader());
}

async function list(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const rows = await query<{ id: string; text: string }>(
    `SELECT h.id, f.text FROM hidden_messages h JOIN feed_messages f ON f.id = h.feed_message_id
      WHERE h.identity = $1 AND f.expires_at > now() ORDER BY h.created_at DESC`,
    [caller.identityId],
  );
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  return json(rows.map((r) => ({ id: r.id, kind: "feed", text: r.text })), 200, sunsetHeader());
}

async function unhide(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (UUID.test(id)) {
    await query(`DELETE FROM hidden_messages WHERE id = $1 AND identity = $2`, [id, caller.identityId]);
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

route("POST", "/hidden", (c) => hide(c.req));
route("GET", "/hidden", (c) => list(c.req));
route("DELETE", "/hidden/:id", (c) => unhide(c.req, c.params.id));
