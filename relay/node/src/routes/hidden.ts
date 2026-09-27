// Step 7: hiding a phrase for oneself (chat spec §8.9, protocol §4.8).
//
// From the "…" menu of a card: the phrase leaves the caller's own feed and
// nobody else's, and its author never learns. POST answers 200 {id} — the
// opaque handle for taking it back, not the phrase's id. GET lists what is
// hidden for screen 10; the list is short-lived by construction, a phrase lives
// until its own end. DELETE answers 204 for someone else's id too (SEC-14).
//
// A table's line {line} is hidden the same way — the outcome of a complaint
// without "illegal", not a menu item (screen 19; step 8, lib/tables.ts).

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { checkAll, HIDDEN_LIMITS } from "../lib/rate_limit.ts";
import { livePhraseOf } from "../lib/feed_limits.ts";
import { HIDEABLE_LINE } from "../lib/tables.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;

// Only what the caller may see (step 7 panel, 2026-09-21): published and alive,
// inside each other's age band, and with no block either way. Without this the
// route confirmed a remembered id and GET returned its text — a way round §8.9.
// Needs `f` (feed_messages), `author` and `me` (identities) in scope; $1 is me.
const MAY_SEE = `${livePhraseOf("f")}
  AND author.closed_at IS NULL
  AND author.age BETWEEN (CASE WHEN me.age <= 20 THEN greatest(13, me.age - 2) ELSE least(21, me.age - 2) END)
                     AND (CASE WHEN me.age <= 20 THEN me.age + 2 ELSE 1000 END)
  AND me.age BETWEEN (CASE WHEN author.age <= 20 THEN greatest(13, author.age - 2) ELSE least(21, author.age - 2) END)
                 AND (CASE WHEN author.age <= 20 THEN author.age + 2 ELSE 1000 END)
  AND NOT EXISTS (SELECT 1 FROM blocks b
                   WHERE (b.blocker_identity = $1 AND b.blocked_identity = author.id)
                      OR (b.blocker_identity = author.id AND b.blocked_identity = $1))`;

async function hide(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const body = await readJson<{ feed?: unknown; line?: unknown }>(req);
  if (typeof body?.line === "string" && UUID.test(body.line) && body.feed === undefined) {
    return await hideLine(caller.identityId, body.line);
  }
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
     SELECT $1, f.id FROM feed_messages f
       JOIN identities author ON author.id = f.author_identity
       JOIN identities me ON me.id = $1
      WHERE f.id = $2 AND ${MAY_SEE}
     ON CONFLICT (identity, feed_message_id) DO UPDATE SET identity = EXCLUDED.identity
     RETURNING id`,
    [caller.identityId, feed],
  );
  if (rows === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (rows.length === 0) return refuse("not_found", "no such phrase", 404);
  return json({ id: rows[0].id }, 200, sunsetHeader());
}

// Step 8: a line at the caller's table. Only one they may see (lib/tables.ts);
// anything else is the 404 of a line that does not exist.
async function hideLine(me: string, line: string): Promise<Response> {
  const allowed = checkAll(HIDDEN_LIMITS, me);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many hidden this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  const rows = await query<{ id: string }>(
    `INSERT INTO hidden_messages (identity, table_line_id) ${HIDEABLE_LINE.replace("SELECT l.id", "SELECT $1::uuid, l.id")}
     ON CONFLICT (identity, table_line_id) DO UPDATE SET identity = EXCLUDED.identity
     RETURNING id`,
    [me, line],
  );
  if (rows === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (rows.length === 0) return refuse("not_found", "no such line", 404);
  return json({ id: rows[0].id }, 200, sunsetHeader());
}

async function list(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const rows = await query<{ id: string; text: string }>(
    `SELECT h.id, f.text FROM hidden_messages h
       JOIN feed_messages f ON f.id = h.feed_message_id
       JOIN identities author ON author.id = f.author_identity
       JOIN identities me ON me.id = $1
      WHERE h.identity = $1 AND ${MAY_SEE} ORDER BY h.created_at DESC`,
    [caller.identityId],
  );
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  // Hidden lines live until the table is swept (DATA-8); the cascade takes them.
  const lines = await query<{ id: string; text: string }>(
    `SELECT h.id, l.text FROM hidden_messages h JOIN table_lines l ON l.id = h.table_line_id
      WHERE h.identity = $1 ORDER BY h.created_at DESC`,
    [caller.identityId],
  );
  if (lines === null) return refuse("unavailable", "the node cannot answer right now", 503);
  return json([
    ...rows.map((r) => ({ id: r.id, kind: "feed", text: r.text })),
    ...lines.map((r) => ({ id: r.id, kind: "line", text: r.text })),
  ], 200, sunsetHeader());
}

async function unhide(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (UUID.test(id)) {
    // A failed write is not "done" (step 7 panel): 503, so the person tries again.
    const gone = await query(`DELETE FROM hidden_messages WHERE id = $1 AND identity = $2`, [id, caller.identityId]);
    if (gone === null) return refuse("unavailable", "the node cannot write right now", 503);
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

route("POST", "/hidden", (c) => hide(c.req));
route("GET", "/hidden", (c) => list(c.req));
route("DELETE", "/hidden/:id", (c) => unhide(c.req, c.params.id));
