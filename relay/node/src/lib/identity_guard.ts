// What every identity-signed route does before it does anything of its own.
//
// Protocol §2 gives the signature, §3 the version, §6 the shape of a refusal and
// the list of three routes that keep answering while somebody is stepped away.
// Each of those is one question, and each has exactly one right answer, so they
// live here rather than at the top of nineteen handlers.
//
// The order is deliberate and is the security property, and it is written here
// exactly because a comment that describes an order becomes the specification
// somebody codes against.
//
// Version, then the shape of the headers, then the row of the session, then the
// signature, then the state of the identity. The row has to come before the
// signature and cannot be moved: the public key to verify against is *in* that
// row, so there is nothing to check without reading it first. What the order
// does promise is the part that matters — **nothing is written and no counter
// is spent before the signature verifies**, and a body is read only to hash it
// for that verification. The nonce table says the same in its own comment, for
// the same reason: an unsigned request must not be able to move anything,
// including a counter.
//
// [retired] This used to read "the window, then the signature, and only then
// the state of the identity", which the code has never done — a frozen or
// closed session is refused before the signature is checked, because that is
// the same read. Found by the protocols lens of the review panel, 2026-09-20:
// the code was right and the comment was wrong, which is the more dangerous
// way round.

import { query } from "./db.ts";
import { findPublishableKey } from "./api_key.ts";

const A_DAY_MS = 24 * 60 * 60 * 1000;
import { json } from "./http.ts";
import {
  PROTOCOL_MAJOR,
  protocolVersion,
  sunsetHeader,
  verifySignedRequest,
  versionSupported,
} from "./identity_auth.ts";

export interface Caller {
  sessionId: string;
  identityId: string;
  brand: string | null;
  steppedAwayUntil: Date | null;
  signupCompletedAt: Date | null;
  // Only ever set for a route that asked for `allowFrozen`; everywhere else a
  // frozen session never becomes a Caller at all.
  frozenAt: Date | null;
}

interface SessionRow {
  session_id: string;
  identity_id: string;
  sign_public_key: string;
  frozen_at: Date | null;
  last_seen_at: Date;
  stepped_away_until: Date | null;
  signup_completed_at: Date | null;
  closed_at: Date | null;
}

// The common refusal of protocol §6. `reason` only ever carries a moderation
// wording; everything else says what happened in `code` and nothing more.
export function refuse(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message, ...extra } }, status, {
    ...sunsetHeader(),
    ...headers,
  });
}

export const unauthorized = (): Response =>
  // One wording for a missing signature, a malformed one, a stale one and one
  // made by another key. Telling them apart tells a guesser which part they got
  // right, and none of the four is a state the honest client can be in.
  refuse("unauthorized", "the request is not signed by a live session", 401);

// The three routes protocol §6 keeps answering during a time away, by name. A
// route that wants the exemption says so; it is not derived from the method.
export interface GuardOptions {
  allowSteppedAway?: boolean;
  allowUnfinishedSignup?: boolean;
  // §8.2 gives one exception to "a frozen session is refused everywhere", and
  // it is the way out: recovery by paper code on the very device the tenth PIN
  // mistake closed. Nothing else may pass this, because everything else is what
  // freezing exists to stop.
  allowFrozen?: boolean;
}

export async function callerOf(
  req: Request,
  options: GuardOptions = {},
): Promise<Caller | Response> {
  const version = protocolVersion(req);
  if (!versionSupported(version)) {
    return refuse(
      "protocol_version_unsupported",
      `this node serves protocol ${PROTOCOL_MAJOR}; update the client`,
      400,
    );
  }

  const sessionId = req.headers.get("x-identity-session");
  if (!sessionId || !/^[0-9a-fA-F-]{36}$/.test(sessionId)) return unauthorized();

  const rows = await query<SessionRow>(
    `SELECT s.id AS session_id, s.identity, s.sign_public_key, s.frozen_at, s.last_seen_at,
            i.id AS identity_id, i.stepped_away_until, i.signup_completed_at, i.closed_at
       FROM sessions s JOIN identities i ON i.id = s.identity
      WHERE s.id = $1`,
    [sessionId],
  );
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  const row = rows[0];
  // A frozen session, a closed identity and an unknown session are one answer:
  // whichever it is, this signature is not a live session's, and saying which
  // would report on somebody else's account to whoever holds a stolen key. The
  // exception is the route that undoes a freeze — and it is one line lower, not
  // folded in here, so that a reader sees the rule before the exception.
  if (!row || row.closed_at) return unauthorized();
  if (row.frozen_at && !options.allowFrozen) return unauthorized();

  const verdict = await verifySignedRequest(req, {
    method: req.method,
    url: req.url,
    body: new Uint8Array(await req.clone().arrayBuffer()),
    signPublicKey: row.sign_public_key,
  });
  if (typeof verdict === "string") return unauthorized();

  if (!options.allowUnfinishedSignup && !row.signup_completed_at) {
    // Chat spec §8.2: until the paper code is confirmed the identity "passes no
    // membership check at all". Same wording as an unknown session, for the same
    // reason — screen 2 promises there is no identity yet.
    return unauthorized();
  }

  // The only writer of `last_seen_at`, and the identity sweeper is why it has to
  // exist: the year of disuse is counted from this column
  // (lib/identity_sweeper.ts), so with nobody writing it the year ran from the
  // session's creation instead. A person using the product daily would have
  // been closed on the anniversary of their registration — recovery columns
  // emptied, share burned, paper code useless. Found by the data lens of the
  // review panel on 2026-09-20, in a sweeper written the same night: the column
  // had been dormant and harmless until something started reading it.
  //
  // Written at most once a day, which the DDL promises in its own comment, and
  // decided here rather than in SQL: the row is already in hand, so the common
  // case costs no statement at all rather than an UPDATE that matches nothing.
  //
  // Awaited, though it is bookkeeping. Letting it run loose would mean a write
  // outliving the request that started it, which is a connection nobody is
  // waiting on and an error nobody reads — and once a day per session is not a
  // cost worth that. `query` swallows its own failure, so a database that
  // cannot take the write refuses nothing here.
  //
  // Not for a frozen session. The routes that let one in (a support request, the
  // same device raising itself by paper code) are a way back, not use: §8.2
  // closes an identity after a year without a live session (LAW-7), and a live
  // session is one with frozen_at IS NULL. Bumped here, a lost phone writing to
  // support once a day kept the identity for ever — even on the requests the
  // support route then refused (support.frozen.bump; decided by quorum,
  // 2026-09-25). The mark stops at the freeze, and the year runs from there; a
  // device raised again is live and bumps on its next request.
  if (!row.frozen_at && row.last_seen_at.getTime() < Date.now() - A_DAY_MS) {
    await query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id]);
  }

  const away = row.stepped_away_until;
  if (!options.allowSteppedAway && away && away.getTime() > Date.now()) {
    return refuse("stepped_away", "you are away until the time you chose", 409, {
      until: Math.floor(away.getTime() / 1000),
    });
  }

  // The face, from the storefront's key beside the signature and from nowhere
  // else (chat spec §8: the key says which face, the signature which person).
  // No key is not a refusal — a terminal has no face, and the phrase lands
  // unattributed — but a key nobody issued is: a face cannot be claimed by
  // guessing. Until 2026-09-22 this was always null, and every phrase sent
  // through a storefront sat in the platform's queue, out of its moderator's sight.
  let brand: string | null = null;
  const keyId = req.headers.get("x-api-key");
  if (keyId) {
    const key = await findPublishableKey(keyId);
    if (!key || key.revoked_at) return refuse("unauthorized", "no usable storefront key", 401);
    brand = key.brand;
  }

  return {
    sessionId: row.session_id,
    identityId: row.identity_id,
    brand,
    steppedAwayUntil: away,
    signupCompletedAt: row.signup_completed_at,
    frozenAt: row.frozen_at,
  };
}
