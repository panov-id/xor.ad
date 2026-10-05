// The platform prints venue envelopes (W17-EN, owner's decision 2026-10-05;
// panel/design/venue-envelopes-mockup.svg): the venue's address and its code
// straight on a DL envelope, in English, by platform staff only. The panel
// reads the envelopes that wait here and marks one sent; once sent, the code
// is not handed to the panel again (db/085) — it stays in the database until
// used or burnt (db/068) for the one case of a lost letter.
//
// Platform only: a tenant's reader is refused even holding the permission, as
// the DSA recipients are (routes/dsa.ts) — an envelope's code proves a venue's
// address to the platform, and no storefront prints for the platform.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { query } from "../lib/db.ts";
import { log } from "../lib/log.ts";
import { ENVELOPE_ATTEMPTS } from "./adv.ts";

const PLATFORM_ONLY = { error: "the platform prints envelopes, not a tenant" };

interface EnvelopeRow {
  id: string;
  venue: string;
  address: string;
  code: string | null;
  attempts: number;
  ordered_at: Date;
  expires_at: Date;
  sent_at: Date | null;
  reordered: boolean;
}

// The envelopes still in play — not used, not burnt — oldest first: the one
// that waits longest is printed first. A sent one stays on the list without
// its code, so the page can say when it went and how many tries are left.
route("GET", "/admin/envelopes", async ({ req }) => {
  const access = await requirePermission(req, "envelopes.print");
  if (isDenied(access)) return access.response;
  if (access.user.brand) return json(PLATFORM_ONLY, 403);
  const rows = await query<EnvelopeRow>(
    `SELECT e.id, v.name AS venue, v.address, e.code, e.attempts, e.created_at AS ordered_at,
            e.expires_at, e.sent_at,
            EXISTS (SELECT 1 FROM venue_envelopes p
                     WHERE p.venue_id = e.venue_id AND p.id <> e.id AND p.burned_at IS NOT NULL) AS reordered
       FROM venue_envelopes e
       JOIN venues v ON v.id = e.venue_id
      WHERE e.used_at IS NULL AND e.burned_at IS NULL AND e.expires_at > now()
      ORDER BY e.created_at
      LIMIT 200`,
  );
  if (rows === null) return json({ error: "the node cannot read right now" }, 503);
  return json({
    envelopes: rows.map((r) => ({
      id: r.id,
      venue: r.venue,
      address: r.address,
      // Once sent, the code leaves the panel (owner, W17-EN).
      code: r.sent_at ? null : r.code,
      ordered_at: Math.floor(new Date(r.ordered_at).getTime() / 1000),
      expires_at: Math.floor(new Date(r.expires_at).getTime() / 1000),
      sent_at: r.sent_at ? Math.floor(new Date(r.sent_at).getTime() / 1000) : null,
      attempts_left: Math.max(0, ENVELOPE_ATTEMPTS - r.attempts),
      reordered: r.reordered,
    })),
  });
});

// Marked sent: once, by the platform. A second mark answers what the first
// wrote; an envelope used, burnt or unknown is 404.
route("POST", "/admin/envelopes/:id/sent", async ({ req, params }) => {
  const access = await requirePermission(req, "envelopes.print");
  if (isDenied(access)) return access.response;
  if (access.user.brand) return json(PLATFORM_ONLY, 403);
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "no such envelope" }, 404);
  const rows = await query<{ sent_at: Date; fresh: boolean }>(
    `WITH marked AS (
       UPDATE venue_envelopes SET sent_at = now()
        WHERE id = $1 AND used_at IS NULL AND burned_at IS NULL AND sent_at IS NULL
        RETURNING sent_at
     )
     SELECT sent_at, true AS fresh FROM marked
     UNION ALL
     SELECT sent_at, false FROM venue_envelopes
      WHERE id = $1 AND used_at IS NULL AND burned_at IS NULL AND sent_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM marked)`,
    [id],
  );
  if (rows === null) return json({ error: "the node cannot write right now" }, 503);
  const [row] = rows;
  if (!row) return json({ error: "no such envelope" }, 404);
  if (row.fresh) {
    // Who and when, never the code.
    recordAuditEvent({ actor: access.user, action: "venue_envelope.sent", target: id, outcome: "applied" });
    log("info", "venue envelope marked sent", { id });
  }
  return json({ id, sent_at: Math.floor(new Date(row.sent_at).getTime() / 1000) });
});
