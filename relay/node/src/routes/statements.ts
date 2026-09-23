// GET /statements — what the author is told, when there is nowhere to write to.
//
// Article 17 says a restriction is explained to the person it happened to. The
// usual way is an email, and this product does not have one: identity is a key
// pair, and we never ask for an address (§8.2). So without this route the first
// restriction anybody meets is a silent deletion — the phrase is gone, nothing
// says why, and the article is discharged on paper only.
//
// §13 of the build order puts it **with** the feed and not after it, for that
// reason exactly: the feed is the first place where something of somebody's can
// be taken down.
//
// What it does not carry: anything about who complained. The notifier's
// identity is never shown to the author — stricter than the article requires,
// and decided long before this route (db/005).

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";

interface StatementRow {
  id: string;
  created_at_cursor: string;
  restriction: string;
  until: Date | null;
  facts: string;
  ground_kind: string;
  ground_text: string;
  automated_used: boolean;
  created_at: Date;
}

// Where a person can take it further (README §7, and the spec's own list): us
// first, then the Digital Services Coordinator, then a court. It is the same
// three for every statement, so it is written once here rather than stored on
// every row — a copy per row would be a copy to keep in step.
//
// **The internal appeal system of Article 20 does not exist yet**, and this says
// so rather than implying it: the first path is an answer from us by the route
// the support screen already offers, not a button on this screen.
const APPEAL = {
  ours: "support",
  coordinator: true,
  court: true,
} as const;

// A page, not a ceiling. The route used to stop at a hundred with no way past
// it, so the hundred-and-first statement could never be read by any call — and
// Article 17(1) is owed for every one (open-work P3, closed 2026-09-21).
const PAGE = 100;

async function myStatements(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowSteppedAway: true });
  if (caller instanceof Response) return caller;

  // The same cursor as the feed's, for the same two reasons (routes/feed.ts):
  // a pair, because statements written by one decision share created_at; and
  // microseconds as digits, because a Date has none and postgres.js turns a
  // string that looks like a timestamp into a Date on the way out.
  const after = new URL(req.url).searchParams.get("after");
  let cursorAt: string | null = null;
  let cursorId: string | null = null;
  if (after) {
    const cut = after.lastIndexOf("_");
    const at = cut < 0 ? "" : after.slice(0, cut);
    const id = cut < 0 ? "" : after.slice(cut + 1);
    // Sixteen digits of microseconds reach the year 2286; nineteen passed the
    // test and overflowed bigint in the database, which answered 503 and wrote
    // a "query failed" line for a caller's typo (review panel 23.09.2026).
    if (!/^[0-9]{1,16}$/.test(at) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return refuse("invalid_body", "after is not a cursor from this route", 400);
    }
    cursorAt = at;
    cursorId = id;
  }

  const rows = await query<StatementRow>(
    `SELECT id, restriction, until, facts, ground_kind, ground_text, automated_used, created_at,
            (extract(epoch from created_at) * 1000000)::bigint::text AS created_at_cursor
       FROM dsa_statements
      WHERE recipient_identity = $1
        AND ($2::bigint IS NULL OR (created_at, id) <
              (timestamptz 'epoch' + $2::bigint * interval '1 microsecond', $3::uuid))
      ORDER BY created_at DESC, id DESC
      LIMIT ${PAGE}`,
    [caller.identityId, cursorAt, cursorId],
  );
  if (rows === null) {
    inc("relay_statements_total", { result: "unavailable" });
    return refuse("unavailable", "the node cannot answer right now", 503);
  }

  // The first delivery is what `delivered_at` records, and it is written here
  // rather than by whoever wrote the statement: a statement written and never
  // shown discharges nothing (db/005 says the same from the other side). Only
  // the rows that had never been delivered are touched, so the column keeps
  // meaning "the first time the author could have read it".
  // Only the rows this answer carried. The UPDATE used to be bounded by the
  // recipient alone, so an author with more than a hundred statements had the
  // hundred-and-first marked delivered without it ever being in a response —
  // and, there being no cursor on this route then, without any call that could
  // ever show it. Under Art. 17 that is a record of delivery for something
  // undelivered. Found by the protocols lens of the review panel, 2026-09-21.
  if (rows.length > 0) {
    await query(
      `UPDATE dsa_statements SET delivered_at = now()
        WHERE id = ANY($1::uuid[]) AND delivered_at IS NULL`,
      [rows.map((row) => row.id)],
    );
  }

  inc("relay_statements_total", { result: "served" });
  // Offered only on a full page: a short one is the last, and a cursor past it
  // would send a client round for nothing.
  const last = rows[rows.length - 1];
  return json({
    ...(rows.length === PAGE ? { next: `${last.created_at_cursor}_${last.id}` } : {}),
    items: rows.map((row) => ({
      id: row.id,
      restriction: row.restriction,
      // Absent, not null: no `until` means indefinitely, and a field carrying
      // an explicit null invites a client to print "until: none".
      ...(row.until ? { until: Math.floor(row.until.getTime() / 1000) } : {}),
      facts: row.facts,
      ground_kind: row.ground_kind,
      ground_text: row.ground_text,
      automated_used: row.automated_used,
      created_at: Math.floor(row.created_at.getTime() / 1000),
      appeal: APPEAL,
    })),
  }, 200, sunsetHeader());
}

route("GET", "/statements", (c) => myStatements(c.req));

export { APPEAL, myStatements };
