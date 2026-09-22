// Support requests (protocol §4.10; chat spec §13, table support_requests;
// screen 14). A person writes to the storefront's support from inside the
// product, and reads the answer there.
//
// The number is random, not a sequence: ten Crockford base32 characters from
// the node's CSPRNG (50 bits), so nobody counts the day's requests or guesses a
// neighbour's (decided 2026-09-14). A clash is 23505 and the node draws again.
// The number is never a key: the list and the answer go only to a request
// signed by the session of the identity that wrote it, and by number alone the
// node answers nothing.
//
// Three a day per identity (support.requests.day), and one a day from a
// session frozen by the PIN limit (support.frozen.day) — a frozen person must
// still be able to ask for help, which is why this route lets a frozen session
// in, and why its list is not shown to one. The fourth answers 429 with the
// storefront's support address, so the person has somewhere to write anyway.
// The text is at most 2000 characters (support.body.length, the owner's
// decision of 2026-09-22).
//
// Not built: the year's cleaning (open item support.sweeper), and turning a
// request into a notice under Article 16 (it deletes the request row in the
// same transaction, chat spec §13).

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sunsetHeader } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { isEmail } from "../lib/http.ts";

const PER_DAY = 3; // support.requests.day
const FROZEN_PER_DAY = 1; // support.frozen.day
const BODY_MAX = 2000; // support.body.length, graphemes
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const NUMBER = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function publicNo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => CROCKFORD[b & 31]).join("");
}

async function write(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowFrozen: true });
  if (caller instanceof Response) return caller;
  const body = await readJson<{ body?: unknown; email?: unknown; nonce?: unknown }>(req);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length === 0) return refuse("invalid_body", "the request has no text", 400);
  if ([...graphemes.segment(text)].length > BODY_MAX) {
    return refuse("invalid_body", `the request is longer than ${BODY_MAX} characters`, 400);
  }
  const email = body?.email === undefined || body?.email === null ? null : body.email;
  if (email !== null && !isEmail(email)) return refuse("invalid_body", "email is not an address", 400);
  const nonce = typeof body?.nonce === "string" ? base64urlToBytes(body.nonce) : null;
  if (!nonce || nonce.length !== 16) return refuse("invalid_body", "nonce must be 16 bytes, base64url", 400);
  const frozen = caller.frozenAt !== null;

  return await transaction<Response>(async (run) => {
    // A repeat of the nonce is the same request: its stored answer.
    const [kept] = await run<{ route: string; response: { public_no: string } | null }>(
      `SELECT route, response FROM nonces WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, nonce]);
    if (kept) {
      if (kept.route !== "POST /support") return refuse("invalid_body", "this nonce was used on another route", 409);
      return json(kept.response, 201, sunsetHeader());
    }
    // The count under the identity's row lock, so two at once do not both pass.
    await run(`INSERT INTO identity_stats (identity) VALUES ($1) ON CONFLICT DO NOTHING`, [caller.identityId]);
    await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [caller.identityId]);
    const [today] = await run<{ all: number; frozen: number }>(
      `SELECT count(*)::int AS all, count(*) FILTER (WHERE from_frozen)::int AS frozen
         FROM support_requests WHERE identity = $1 AND created_at > now() - interval '1 day'`,
      [caller.identityId],
    );
    if (today.all >= PER_DAY || (frozen && today.frozen >= FROZEN_PER_DAY)) {
      const [face] = caller.brand
        ? await run<{ domain: string }>(`SELECT domain FROM brands WHERE key = $1`, [caller.brand])
        : [];
      inc("relay_support_total", { result: "limited" });
      return refuse(
        "rate_limited",
        face ? `too many requests today; write to support@${face.domain}` : "too many requests today",
        429,
      );
    }
    let no = "";
    for (let attempt = 0; attempt < 5 && !no; attempt++) {
      const [made] = await run<{ public_no: string }>(
        `INSERT INTO support_requests (public_no, identity, body, email, from_frozen)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (public_no) DO NOTHING RETURNING public_no`,
        [publicNo(), caller.identityId, text, email, frozen],
      );
      if (made) no = made.public_no;
    }
    if (!no) return refuse("unavailable", "the node could not draw a number", 503);
    await run(
      `INSERT INTO nonces (session_id, nonce, route, status, response)
       VALUES ($1, $2, 'POST /support', 201, $3::text::jsonb)`,
      [caller.sessionId, nonce, JSON.stringify({ public_no: no })],
    );
    inc("relay_support_total", { result: frozen ? "written_frozen" : "written" });
    return json({ public_no: no }, 201, sunsetHeader());
  }).catch((error) => {
    log("error", "support write failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
}

async function list(req: Request): Promise<Response> {
  // Not allowFrozen: a frozen session is not shown the list (protocol §4.10).
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  return await transaction<Response>(async (run) => {
    const rows = await run<{ public_no: string; created_at: Date; body: string; answer: string | null; answered_at: Date | null; answer_seen: boolean }>(
      `SELECT public_no, created_at, body, answer, answered_at, answer_seen FROM support_requests
        WHERE identity = $1 ORDER BY created_at DESC`,
      [caller.identityId],
    );
    // A plain array, as the contract names it (SupportRequest[]).
    return json(rows.map((r) => ({
      public_no: r.public_no,
      created_at: Math.floor(r.created_at.getTime() / 1000),
      body: r.body, // what the person wrote: the list shows it (screen 14 A)
      answer: r.answer,
      answered_at: r.answered_at ? Math.floor(r.answered_at.getTime() / 1000) : null,
      answer_seen: r.answer_seen,
    })), 200, sunsetHeader());
  }).catch(() => refuse("unavailable", "the node cannot answer right now", 503));
}

// 204 on someone else's number or none at all (SEC-23): the answer says
// nothing about whether a number exists.
async function seen(req: Request, no: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (NUMBER.test(no)) {
    await transaction(async (run) => {
      await run(
        `UPDATE support_requests SET answer_seen = true
          WHERE public_no = $1 AND identity = $2 AND answer IS NOT NULL`,
        [no, caller.identityId],
      );
    }).catch((error) => log("error", "support seen failed", { error: String(error) }));
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

route("POST", "/support", (c) => write(c.req));
route("GET", "/support", (c) => list(c.req));
route("POST", "/support/:no/seen", (c) => seen(c.req, c.params.no));
