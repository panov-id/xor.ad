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
  // A person who stepped away may still ask for help — the owner's decision of
  // 2026-09-22: the away may have been set by whoever took the identity, and
  // the channel to a person is not cut (DSA Art. 12(1)). Writing only; the
  // list stays behind the step-away like every other route.
  const caller = await callerOf(req, { allowFrozen: true, allowSteppedAway: true });
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
    // Everything under the identity's row lock: the count, so two at once do
    // not both pass, and the nonce, so two with the same nonce do not both get
    // past its check and the second end in a 503 instead of the stored 201
    // (support panel, 2026-09-22).
    await run(`INSERT INTO identity_stats (identity) VALUES ($1) ON CONFLICT DO NOTHING`, [caller.identityId]);
    await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [caller.identityId]);
    // A repeat of the nonce is the same request: its stored answer.
    const [kept] = await run<{ route: string; response: { public_no: string } | null }>(
      `SELECT route, response FROM nonces WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, nonce]);
    if (kept) {
      if (kept.route !== "POST /support" || !kept.response) {
        return refuse("invalid_body", "this nonce was used on another route", 409);
      }
      inc("relay_nonce_replay_total", { route: "POST /support" });
      return json(kept.response, 201, sunsetHeader());
    }
    if (frozen) {
      // Screen 14 (chat spec §8.2): a session frozen by the PIN limit may ask
      // for help, and only while the identity has no other live session — that
      // one writes instead. A device frozen by a transfer or a closure is not
      // let in at all: support is not the way back into an identity it left.
      const [state] = await run<{ reason: string | null; live: number }>(
        `SELECT (SELECT frozen_reason FROM sessions WHERE id = $1) AS reason,
                (SELECT count(*)::int FROM sessions WHERE identity = $2 AND frozen_at IS NULL) AS live`,
        [caller.sessionId, caller.identityId],
      );
      if (state.reason !== "pin_limit" || state.live > 0) {
        return refuse("unauthorized", "the request is not signed by a live session", 401);
      }
    }
    const [today] = await run<{ all: number; frozen: number; free_all: string | null; free_frozen: string | null }>(
      `SELECT count(*)::int AS all, count(*) FILTER (WHERE from_frozen)::int AS frozen,
              ceil(extract(epoch from min(created_at) + interval '1 day' - now()))::text AS free_all,
              ceil(extract(epoch from min(created_at) FILTER (WHERE from_frozen) + interval '1 day' - now()))::text AS free_frozen
         FROM support_requests WHERE identity = $1 AND created_at > now() - interval '1 day'`,
      [caller.identityId],
    );
    const overAll = today.all >= PER_DAY;
    const overFrozen = frozen && today.frozen >= FROZEN_PER_DAY;
    if (overAll || overFrozen) {
      const [face] = caller.brand
        ? await run<{ domain: string }>(`SELECT domain FROM brands WHERE key = $1`, [caller.brand])
        : [];
      // When the oldest request that counts leaves the day: protocol §6 wants
      // Retry-After on every 429, and screen 14 names the time to the person.
      const wait = Math.max(1, Number((overAll ? today.free_all : today.free_frozen) ?? 1));
      inc("relay_support_total", { result: "limited" });
      return refuse(
        "rate_limited",
        face ? `too many requests today; write to support@${face.domain}` : "too many requests today",
        429,
        { until: Math.floor(Date.now() / 1000) + wait },
        { "retry-after": String(wait) },
      );
    }
    let no = "";
    for (let attempt = 0; attempt < 5 && !no; attempt++) {
      const [made] = await run<{ public_no: string }>(
        `INSERT INTO support_requests (public_no, identity, body, email, from_frozen, brand)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (public_no) DO NOTHING RETURNING public_no`,
        [publicNo(), caller.identityId, text, email, frozen, caller.brand],
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
    // A failed write is a 503, not a 204: the client would take the dot for
    // out. 204 is for someone else's number or none — never for our failure.
    const ok = await transaction(async (run) => {
      await run(
        `UPDATE support_requests SET answer_seen = true
          WHERE public_no = $1 AND identity = $2 AND answer IS NOT NULL`,
        [no, caller.identityId],
      );
      return true;
    }).catch((error) => {
      log("error", "support seen failed", { error: String(error) });
      return false;
    });
    if (!ok) return refuse("unavailable", "the node cannot write right now", 503);
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

route("POST", "/support", (c) => write(c.req));
route("GET", "/support", (c) => list(c.req));
route("POST", "/support/:no/seen", (c) => seen(c.req, c.params.no));
