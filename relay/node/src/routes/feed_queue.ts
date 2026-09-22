// The moderator's queue of the feed, in the panel (chat spec §8.3: moderation
// happens before publication, and not in the path of the request).
//
// No model is wired (§8.14 — that is the owner's money to decide), so until one
// is, a person gives the verdict: lib/feed_verdict.ts has publishPhrase() and
// refusePhrase(), and nothing called them. A phrase nobody decides within
// moderation.queue.wait is swept, so this queue is only ever ten minutes deep.
//
// What the moderator sees is what will go out: the text, its mode, and the name
// published with it — and never the author's identity, which nobody outside the
// node ever sees. A tenant's moderator sees their own brand's phrases only, as
// with the DSA queue.
//
// A verdict applies once: the second answers 409, whoever gave the first.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { publishPhrase, refuseName, refusePhrase } from "../lib/feed_verdict.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { inc } from "../lib/metrics.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;

route("GET", "/admin/feed-queue", async ({ req }) => {
  const access = await requirePermission(req, "feed_queue.read");
  if (isDenied(access)) return access.response;
  const rows = await query<{
    id: string; brand: string; text: string; mode: string; name: string; name_state: string; waiting: string;
  }>(
    `SELECT f.id, f.brand, f.text, f.mode, coalesce(a.name_pending, a.name) AS name, a.name_state,
            floor(extract(epoch from now() - f.created_at))::bigint::text AS waiting
       FROM feed_messages f
       LEFT JOIN identities a ON a.id = f.author_identity
      WHERE f.visible_at IS NULL AND ($1::text IS NULL OR f.brand = $1)
      ORDER BY f.created_at
      LIMIT 200`,
    [access.user.brand],
  );
  if (rows === null) return json({ error: "unavailable" }, 503);
  // A plain array with x-total-count, the shape the panel's data provider
  // reads for every resource.
  const items = rows.map((r) => ({
    id: r.id, brand: r.brand, text: r.text, mode: r.mode,
    // An author who closed their identity leaves the phrase with no name;
    // it is still decidable, and says so.
    name: r.name ?? "", name_state: r.name_state ?? "gone", waiting_seconds: Number(r.waiting),
  }));
  return json(items, 200, { "x-total-count": String(items.length) });
});

async function decide(req: Request, id: string, verdict: "publish" | "refuse" | "refuse-name"): Promise<Response> {
  const access = await requirePermission(req, "feed_queue.decide");
  if (isDenied(access)) return access.response;
  if (!UUID.test(id)) return json({ error: "not found" }, 404);
  // A tenant's moderator decides their own brand's phrases only. The answer
  // for another brand's id is the same as for one that never existed, and the
  // fence itself is applied again inside the verdict's transaction.
  if (access.user.brand) {
    const own = await query<{ id: string }>(
      `SELECT id FROM feed_messages WHERE id = $1 AND brand = $2`, [id, access.user.brand]);
    if (own === null) return json({ error: "unavailable" }, 503);
    if (own.length === 0) return json({ error: "not found" }, 404);
  }
  // Publish carries the name the moderator saw; the verdict holds only if it
  // is still that name.
  let nameSeen: string | undefined;
  if (verdict !== "refuse") {
    const body = await req.json().catch(() => null) as { name?: unknown } | null;
    if (typeof body?.name === "string") nameSeen = body.name;
  }
  const scope = { brand: access.user.brand, nameSeen };
  let result: { applied: boolean; nameChanged?: boolean; nameRejected?: boolean };
  try {
    result = verdict === "publish"
      ? await publishPhrase(id, scope)
      : verdict === "refuse"
      ? await refusePhrase(id, scope)
      : await refuseName(id, scope);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  if (result.nameChanged) return json({ error: "the name changed since it was read" }, 409);
  if (result.nameRejected) return json({ error: "the name is rejected; the phrase waits for a new one" }, 409);
  if (!result.applied) return json({ error: "already decided, swept, or never existed" }, 409);
  // Who and when; the phrase's text does not go into a second store.
  recordAuditEvent({
    actor: access.user,
    action: `feed_queue.${verdict.replace("-", "_")}`,
    target: id,
    outcome: "applied",
  });
  inc("relay_feed_queue_total", { verdict });
  return json({ verdict });
}

route("POST", "/admin/feed-queue/:id/publish", ({ req, params }) => decide(req, params.id, "publish"));
route("POST", "/admin/feed-queue/:id/refuse", ({ req, params }) => decide(req, params.id, "refuse"));
// The name, not the phrase: the phrase stays and waits for a new name (§8.2).
route("POST", "/admin/feed-queue/:id/refuse-name", ({ req, params }) => decide(req, params.id, "refuse-name"));
