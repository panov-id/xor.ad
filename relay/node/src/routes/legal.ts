// GET /legal/manifest and POST /legal/accept (protocol §4.1; chat spec §8.2).
//
// The manifest is the current revision of each of the three documents for the
// face named by the storefront key (lib/legal.ts). An acceptance is one row of
// legal_acceptances (db/022) per document, and only of the revision the node
// serves now: a client holding an older text learns so, and shows the new one
// — the record has to answer "which text did they accept", and a sha256 of a
// text nobody serves any more would not.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { findPublishableKey } from "../lib/api_key.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { revisionsOf } from "../lib/legal.ts";
import { inc } from "../lib/metrics.ts";

async function manifest(req: Request): Promise<Response> {
  const key = await findPublishableKey(req.headers.get("x-api-key") ?? "");
  if (!key) return refuse("unauthorized", "a storefront key is required", 401);
  const documents = await revisionsOf(key.brand);
  if (!documents) return refuse("unavailable", "this face has no legal revisions on this node", 503);
  return json({ documents }, 200, sunsetHeader());
}

async function accept(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!caller.brand) return refuse("no_face", "a storefront key names the face whose documents are accepted", 409);
  const body = await readJson<{ document?: unknown; revision_sha256?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const current = (await revisionsOf(caller.brand))?.find((r) => r.document === body.document);
  if (!current) return refuse("invalid_body", "document is terms, privacy or guidelines", 400);
  if (body.revision_sha256 !== current.revision_sha256) {
    inc("relay_legal_accept_total", { result: "stale" });
    return refuse("invalid_body", "that is not the revision this node serves; read the manifest again", 400);
  }
  const written = await query(
    `INSERT INTO legal_acceptances (identity, document, revision_date, revision_sha256)
     VALUES ($1, $2, $3, $4)`,
    [caller.identityId, current.document, current.revision_date, current.revision_sha256],
  );
  if (written === null) return refuse("unavailable", "the node cannot write right now", 503);
  inc("relay_legal_accept_total", { result: "recorded" });
  return new Response(null, { status: 200, headers: sunsetHeader() });
}

route("GET", "/legal/manifest", (c) => manifest(c.req));
route("POST", "/legal/accept", (c) => accept(c.req));

export { accept, manifest };
