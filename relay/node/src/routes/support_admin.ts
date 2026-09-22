// Support, the team's side (protocol §4.10a; described and decided 2026-09-22,
// after the DSA queue). Until today the team could not read a request at all.
//
// The list is one's own brand — the platform sees all, those without a brand
// too — waiting ones first, and never the author's identity: the team answers a
// request, not a person it can look up. An answer lights the person's dot again
// (answer_seen = false), a repeated answer too (chat spec §13). Up to 4000
// characters (support.answer.length, the owner's decision of 2026-09-22).
//
// Not here: turning a request into an Article 16 notice. The team cannot give
// the notifier's good-faith statement (dsa_notices.bona_fide); it answers with a
// link to the report form instead, and that answer's text is the owner's.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { inc } from "../lib/metrics.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
const ANSWER_MAX = 4000; // support.answer.length, graphemes
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

route("GET", "/admin/support", async ({ req }) => {
  const access = await requirePermission(req, "support.read");
  if (isDenied(access)) return access.response;
  const rows = await query<{
    id: string; public_no: string; brand: string | null; created_at: Date; body: string;
    email: string | null; from_frozen: boolean; answer: string | null; answered_at: Date | null; total: string;
  }>(
    `SELECT id, public_no, brand, created_at, body, email, from_frozen, answer, answered_at,
            count(*) OVER ()::text AS total
       FROM support_requests
      WHERE ($1::text IS NULL OR brand = $1)
      ORDER BY (answer IS NULL) DESC, from_frozen DESC, created_at
      LIMIT 200`,
    [access.user.brand],
  );
  if (rows === null) return json({ error: "unavailable" }, 503);
  const items = rows.map((r) => ({
    id: r.id, public_no: r.public_no, brand: r.brand,
    created_at: Math.floor(r.created_at.getTime() / 1000), body: r.body, email: r.email,
    from_frozen: r.from_frozen, answer: r.answer,
    answered_at: r.answered_at ? Math.floor(r.answered_at.getTime() / 1000) : null,
  }));
  return json(items, 200, { "x-total-count": rows[0]?.total ?? "0" });
});

route("POST", "/admin/support/:id/answer", async ({ req, params }) => {
  const access = await requirePermission(req, "support.answer");
  if (isDenied(access)) return access.response;
  if (!UUID.test(params.id)) return json({ error: "not found" }, 404);
  const body = await readJson<{ answer?: unknown }>(req);
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer || [...graphemes.segment(answer)].length > ANSWER_MAX) {
    return json({ error: `the answer is empty or longer than ${ANSWER_MAX} characters` }, 400);
  }
  const done = await query<{ id: string }>(
    `UPDATE support_requests SET answer = $2, answered_at = now(), answer_seen = false
      WHERE id = $1 AND ($3::text IS NULL OR brand = $3) RETURNING id`,
    [params.id, answer, access.user.brand],
  );
  if (done === null) return json({ error: "unavailable" }, 503);
  if (done.length === 0) return json({ error: "not found" }, 404);
  // Who answered and when; the text stays in the table, not in a second store.
  recordAuditEvent({ actor: access.user, action: "support.answer", target: params.id, outcome: "applied" });
  inc("relay_support_answer_total", {});
  return json({ answered: true });
});
