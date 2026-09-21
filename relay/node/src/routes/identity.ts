// Step 1 of the build order: an identity and the session that speaks for it.
//
// Two of the routes live here so far. POST /identities is the only one of the
// pair that has no signature to check — it is where the signature comes from —
// and GET /identities/me is the plainest signed route there is, which makes the
// two of them the smallest pair that exercises the whole chain end to end.
//
// What this file does NOT do, on purpose: it never reads the PIN, never sees the
// paper code, and never stores the node's share in the clear. The first two never
// reach the node at all (chat spec §8.2); the third is sealed by lib/vault_share.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll } from "../lib/rate_limit.ts";
import { findPublishableKey } from "../lib/api_key.ts";
import {
  base64urlToBytes,
  bytesToBase64url,
  importSignPublicKey,
  sha256hex,
  sunsetHeader,
} from "../lib/identity_auth.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { configured, openShare, sealShare } from "../lib/vault_share.ts";
import { burnShare, freezeSession } from "../lib/sessions.ts";
import { checkPin } from "../lib/pin_attempts.ts";
import { countMiss, pausedFor, SHARED_MISS_MAX } from "../lib/recovery_misses.ts";
import { log } from "../lib/log.ts";
import { PROTOCOL_MAJOR, protocolVersion, versionSupported } from "../lib/identity_auth.ts";
import { IDENTITY_CREATE_LIMITS, RECOVERY_CLAIM_LIMITS } from "../lib/rate_limit.ts";
import { inc, setGauge } from "../lib/metrics.ts";

// §8.2 and docs/facts/limits.tsv (`name.length`, enforced by: the node): the
// limit is **24 graphemes**, and the node is named as what holds it.
//
// It used to count bytes only, with the comment "that is the thing it can
// enforce" — which was not true: Intl.Segmenter counts graphemes, and without
// it a name of a hundred visible characters passed, because a hundred of them
// fit in 400 bytes. The registry promised a limit nobody applied (review panel
// 2026-09-20, consistency lens).
//
// Both ceilings stay. The byte one is the DDL's (`octet_length(name) <= 400`)
// and stops a name that is short in graphemes and enormous in bytes; the
// grapheme one is the product's, and it is what a person is shown.
const NAME_MAX_BYTES = 400;
const NAME_MAX_GRAPHEMES = 24;

// A grapheme is what a person calls a character: a family emoji, a letter with
// a combining accent, a flag. `Intl.Segmenter` is the only thing in the runtime
// that counts them, and counting code points instead would refuse names that
// look short and pass names that look long.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const countGraphemes = (text: string): number => [...graphemes.segment(text)].length;
const MIN_AGE = 13;
// No product ceiling on age — decided 2026-08-28, and the DDL says the same.
// This is the *type's* ceiling: the column is an `integer`, and a number past
// its range made the whole registration transaction fail with `22003`, which
// the catch below turned into 503 "the node cannot write right now". So a
// number anybody can type reported the node as broken and grew the metric for
// storage failures (review panel 2026-09-20, data lens). 200 is far past any
// person and far short of the type.
const MAX_AGE = 200;
// How long the one-time right to set a first PIN stays good: `vault.first_pin.ttl`
// in docs/facts/limits.tsv, an hour, decided by the owner on 2026-09-21.
//
// Without a term "one-time" meant "for ever, until spent", and the security lens
// of the review panel showed what that buys: somebody recovers in January, does
// not reach POST /vault/init — on the same-device path that is the ordinary
// outcome, the old PIN still works — and six months later whoever steals the
// signing key from that session calls /vault/init, sets a PIN of their own
// without knowing the old one, and overwrites the owner's share. The route's
// own comment promises that cannot happen.
//
// The price of an hour is named and accepted: somebody who recovers and is
// interrupted for longer copies the sixteen characters of the paper code again.
const FIRST_PIN_TTL_HOURS = 1;
// The share is 32 random bytes (§8.2). Anything else is not a share.
const SHARE_BYTES = 32;

interface CreateBody {
  sign_pub?: unknown;
  wrap_pub?: unknown;
  name?: unknown;
  age?: unknown;
  auth_hash?: unknown;
  share?: unknown;
  label?: unknown;
  recovery_lookup_id?: unknown;
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

// POST /identities — everything registration sends at once (screen 2).
//
// Three rows in one transaction, and it has to be one: a share is only ever
// handed out once it is written (§8.2), so an identity without its session or a
// session without its share are both states the rest of the protocol cannot read.
async function createIdentity(req: Request): Promise<Response> {
  const version = protocolVersion(req);
  if (!versionSupported(version)) {
    return refuse(
      "protocol_version_unsupported",
      `this node serves protocol ${PROTOCOL_MAJOR}; update the client`,
      400,
    );
  }

  // Per address, before anything is read: 10 an hour and 30 a day (2026-09-15).
  // An identity costs nothing to ask for and three rows to hold, so the ceiling
  // is charged to whoever is asking rather than to whoever is stored.
  const verdict = checkAll(IDENTITY_CREATE_LIMITS, clientAddress(req).ip);
  if (!verdict.allowed) {
    inc("relay_identities_total", { result: "address_limited" });
    return refuse("rate_limited", "too many identities from this address", 429, {}, {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  // The face this key speaks for. A publishable key answers "which storefront"
  // and nothing else — it is public by design and proves nothing about who is
  // calling, which is exactly why nothing here is authorized by it.
  const key = await findPublishableKey(req.headers.get("x-api-key") ?? "");
  if (!key || key.revoked_at) return refuse("unauthorized", "no usable storefront key", 401);

  // Storing a share in the clear is the one thing §8.2 forbids by name, so a node
  // without its sealing key refuses the registration rather than completing it
  // badly. Said before the body is read: nothing about the request changes it.
  if (!configured()) {
    inc("relay_identities_total", { result: "no_vault_key" });
    return refuse("unavailable", "this node cannot store a vault share right now", 503);
  }

  const body = await readJson<CreateBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);

  if (typeof body.age !== "number" || !Number.isInteger(body.age)) {
    return refuse("invalid_body", "age must be a whole number", 400);
  }
  // Its own code, not invalid_body: screen 2 has a line for this and only this,
  // and a client cannot tell them apart from a shared code.
  if (body.age > MAX_AGE) {
    return refuse("invalid_body", "age is not a number a person has", 400);
  }
  if (body.age < MIN_AGE) {
    inc("relay_identities_total", { result: "too_young" });
    return refuse("too_young", "this place is for 13 and over", 422);
  }

  const name = body.name;
  if (typeof name !== "string" || name.length < 1) {
    return refuse("invalid_body", "the name is missing", 400);
  }
  // Two ceilings, and the refusal says which one was hit. They are not the same
  // limit in different units: 24 graphemes of a four-person family emoji are
  // 600 bytes (measured 2026-09-21), so the byte ceiling refuses before the
  // grapheme one is reached. The registry states both for the same reason — a
  // promise of "24 graphemes" that the schema cannot hold is a promise that
  // fails on somebody's name, and they deserve to be told which rule they met.
  if (countGraphemes(name) > NAME_MAX_GRAPHEMES) {
    return refuse("invalid_body", `the name is longer than ${NAME_MAX_GRAPHEMES} characters`, 400);
  }
  if (new TextEncoder().encode(name).length > NAME_MAX_BYTES) {
    return refuse(
      "invalid_body",
      `the name fits in ${NAME_MAX_GRAPHEMES} characters but not in ${NAME_MAX_BYTES} bytes`,
      400,
    );
  }

  for (const field of ["auth_hash", "recovery_lookup_id"] as const) {
    if (!isText(body[field], 512)) return refuse("invalid_body", `${field} is missing`, 400);
  }

  // Both keys are checked by importing them, not by looking at their length: a
  // key the node cannot import is a key it can never verify a signature with,
  // and finding that out on the first signed request would strand the device
  // with an identity it cannot use.
  if (!isText(body.sign_pub, 1024) || !await importSignPublicKey(body.sign_pub)) {
    return refuse("invalid_body", "sign_pub is not a base64url SPKI P-256 key", 400);
  }
  if (!isText(body.wrap_pub, 1024) || !base64urlToBytes(body.wrap_pub)) {
    return refuse("invalid_body", "wrap_pub is not base64url", 400);
  }

  const share = isText(body.share, 512) ? base64urlToBytes(body.share) : null;
  if (!share || share.length !== SHARE_BYTES) {
    return refuse("invalid_body", `share must be ${SHARE_BYTES} bytes, base64url`, 400);
  }

  const label = typeof body.label === "string" ? body.label.slice(0, 200) : null;
  const identityId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sealed = await sealShare(share);

  const done = await transaction(async (run) => {
    await run(
      `INSERT INTO identities (id, name, age, identity_public_key, recovery_auth_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [identityId, name, body.age, body.sign_pub, await recoveryHash(body.recovery_lookup_id as string)],
    );
    await run(
      `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, identityId, body.sign_pub, body.wrap_pub, label],
    );
    await run(
      `INSERT INTO vault_shares (session, auth_hash, share_enc) VALUES ($1, $2, $3)`,
      [sessionId, body.auth_hash, sealed],
    );
    // The counters row is born here and not at the first like (§8.3): every
    // publication limit is a conditional UPDATE against it, and a conditional
    // UPDATE against a row that does not exist refuses silently — for ever, and
    // without an error anywhere (experiment in postgres:16, 2026-09-14).
    await run(`INSERT INTO identity_stats (identity) VALUES ($1)`, [identityId]);
    return true;
  }).catch((error) => {
    // Logged, not swallowed. The three transaction catches on this file used to
    // answer 503 and say nothing anywhere — so a failure that repeats on every
    // call (a constraint changed by a migration, say) left the metric
    // `storage_failed` growing and no way at all to learn what failed (review
    // panel 2026-09-20, operations lens).
    log("error", "registration failed to write", { error: String(error) });
    return false;
  });

  if (!done) {
    inc("relay_identities_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  }

  inc("relay_identities_total", { result: "created" });
  // signup_completed_at stays NULL: the registration is not over until the paper
  // code comes back through POST /recovery/confirm, and until then this identity
  // passes no membership check and is swept within the hour (§8.2).
  return json({ identity_id: identityId, session_id: sessionId }, 200, sunsetHeader());
}

interface ProfileRow {
  name: string;
  name_pending: string | null;
  age: number;
  filter_age_min: number | null;
  filter_age_max: number | null;
  languages: string[];
  stepped_away_until: Date | null;
}

// GET /identities/me — one of the three routes §6 keeps answering while somebody
// is away, because it is how the client learns they are away and until when.
async function readProfile(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowSteppedAway: true });
  if (caller instanceof Response) return caller;

  const rows = await query<ProfileRow>(
    `SELECT name, name_pending, age, filter_age_min, filter_age_max, languages,
            stepped_away_until
       FROM identities WHERE id = $1`,
    [caller.identityId],
  );
  if (rows === null) {
    // Counted, because a route that goes quiet during a database failure looks
    // on a graph exactly like a route nobody is calling (review panel
    // 2026-09-20, operations lens).
    inc("relay_profile_total", { result: "unavailable" });
    return refuse("unavailable", "the node cannot answer right now", 503);
  }
  const row = rows[0];
  if (!row) return refuse("unauthorized", "the request is not signed by a live session", 401);

  inc("relay_profile_total", { result: "served" });
  // Only what step 1 can honestly answer. quota, phrases and table belong to the
  // feed and the tables, and neither exists yet — a zero there would be a number
  // the node made up, which is worse than a field the client knows is missing.
  return json({
    name: row.name,
    ...(row.name_pending ? { name_pending: row.name_pending } : {}),
    age: row.age,
    ...(row.filter_age_min === null ? {} : { filter_age_min: row.filter_age_min }),
    ...(row.filter_age_max === null ? {} : { filter_age_max: row.filter_age_max }),
    languages: row.languages ?? [],
    ...(row.stepped_away_until
      ? { stepped_away_until: Math.floor(row.stepped_away_until.getTime() / 1000) }
      : {}),
  }, 200, sunsetHeader());
}


interface ConfirmBody {
  recovery_wrapped_key?: unknown;
}

// POST /recovery/confirm — the paper code is written down; the registration ends.
//
// Until this arrives the identity passes no membership check (§8.2), so the
// guard is told to allow an unfinished signup here and nowhere else: this is the
// one route whose whole job is to finish one.
async function confirmRecovery(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowUnfinishedSignup: true, allowSteppedAway: true });
  if (caller instanceof Response) return caller;

  const body = await readJson<ConfirmBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const wrapped = isText(body.recovery_wrapped_key, 4096)
    ? base64urlToBytes(body.recovery_wrapped_key)
    : null;
  if (!wrapped || wrapped.length === 0) {
    return refuse("invalid_body", "recovery_wrapped_key must be base64url", 400);
  }

  // One statement, and the WHERE is the whole point: it makes the call
  // idempotent-by-refusal and stops a row the sweeper already took from being
  // revived without a word. Same shape as spending the first-PIN grant.
  const spent = await query<{ id: string }>(
    `UPDATE identities
        SET recovery_wrapped_key = $2, signup_completed_at = now()
      WHERE id = $1 AND signup_completed_at IS NULL AND closed_at IS NULL
      RETURNING id`,
    [caller.identityId, wrapped],
  );
  if (spent === null) {
    inc("relay_identities_total", { result: "unavailable" });
    return refuse("unavailable", "the node cannot write right now", 503);
  }
  if (spent.length === 0) {
    inc("relay_identities_total", { result: "already_confirmed" });
    return refuse("refused", "this registration is already finished", 409);
  }

  inc("relay_identities_total", { result: "confirmed" });
  return new Response(null, { status: 204, headers: sunsetHeader() });
}


interface ClaimBody {
  lookup_id?: unknown;
  sign_pub?: unknown;
  wrap_pub?: unknown;
  label?: unknown;
}

// POST /recovery/claim — the paper code raises the identity again (§8.2, §13).
//
// It is the only way back. There is no password and no mailbox, the node never
// saw the code, and the one live session is gone with the device — so this route
// is the whole of "I lost my phone" and the whole of "the tenth PIN mistake
// closed me out".
//
// Two devices ask for it and they need different things, and the canon tells
// them apart rather than the body doing it:
//
//   a clean device  — unsigned, carries its fresh keys. A new session is born,
//                     the old one is frozen (one live session per identity), and
//                     the device gets the wrapped long key to unwrap with the
//                     other half of the code.
//   the same device — signed by its own session, **even a frozen one**: §8.2
//                     names recovery as the one exception to "a frozen session
//                     is refused everywhere", because otherwise the tenth PIN
//                     mistake would have no way out at all. The session is
//                     unfrozen and the PIN counter goes back to ten, so the old
//                     PIN opens this device's history again.
//
// Both leave a first-PIN grant: on a clean device there is no old PIN to prove,
// and on the old one the PIN may be exactly what was forgotten (§8.2 —
// "забыт ПИН — задаётся новый с новой долей").
//
// What it does NOT do: kill the old paper code. §8.2 moved that to the moment
// the **new** code is confirmed (2026-09-10), because the gap between unwrapping
// the key and writing sixteen characters down is a gap in which a person would
// otherwise hold an identity no code can raise. Rotation is POST
// /recovery/reissue, and the device proves the code it has just used.
async function claimRecovery(req: Request): Promise<Response> {
  const version = protocolVersion(req);
  if (!versionSupported(version)) {
    return refuse(
      "protocol_version_unsupported",
      `this node serves protocol ${PROTOCOL_MAJOR}; update the client`,
      400,
    );
  }

  // The node-wide brake first, then the address, then the body: a paused route
  // does no lookup, which is the point of it (lib/recovery_misses.ts).
  const paused = pausedFor();
  setGauge("relay_recovery_pause_seconds_left", paused);
  if (paused > 0) {
    inc("relay_recovery_claim_total", { result: "paused" });
    return refuse("rate_limited", "codes are not being accepted right now", 429, {}, {
      "retry-after": String(paused),
    });
  }
  const verdict = checkAll(RECOVERY_CLAIM_LIMITS, clientAddress(req).ip);
  if (!verdict.allowed) {
    inc("relay_recovery_claim_total", { result: "address_limited" });
    return refuse("rate_limited", "too many attempts from this address", 429, {}, {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  // The signature is read before the body, and the order is not cosmetic: the
  // guard verifies over a clone of the body, and a body already consumed here
  // leaves it with nothing to check — "Body is unusable", which is how this was
  // found. lib/identity_guard.ts states the same rule at the top of the file.
  //
  // A signature only decides *which* device is asking. The paper code is what
  // authorizes the call, on both paths — which is why an unusable signature is
  // not a refusal here, it simply means "not this device".
  const signed = req.headers.get("x-identity-session")
    ? await callerOf(req, {
      allowFrozen: true,
      allowSteppedAway: true,
      allowUnfinishedSignup: true,
    })
    : null;
  const caller = signed instanceof Response ? null : signed;

  const body = await readJson<ClaimBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  if (!isText(body.lookup_id, 512)) return refuse("invalid_body", "lookup_id is missing", 400);

  // The clean device's keys are checked **before** the lookup, and the order is
  // the security property rather than tidiness. With the check below the
  // search, a caller could send a bare `lookup_id` and read the answer off the
  // refusal: a miss came back 404 from the search, a hit came back 400 about
  // the missing sign_pub — and the hit cost nothing at all, because the freeze,
  // the burn and the shared miss counter all live past the point where it
  // stopped. Confirming a code you have photographed was therefore cheaper than
  // using it, and invisible to its owner. Found by the security lens of the
  // review panel, 2026-09-20.
  //
  // A request signed by its own session needs no keys: that device already has
  // them, and `caller` is how the node knows.
  //
  // `caller` is not enough on its own, and that was the hole this exemption
  // opened on 2026-09-20: it exempts *any* signed caller, not the owner. A
  // caller with a live session of their own could send somebody else's
  // `lookup_id` and no keys at all, skip this block, and read the answer off
  // what came back — 404 for a miss, 503 for a hit, because the hit walked
  // into the new-device branch and died on `sign_public_key NOT NULL` with the
  // miss counter untouched. One bit, free, invisible to the code's owner: the
  // same oracle as before, entered through the fix for it. Found by the
  // security lens of the review panel, 2026-09-21.
  //
  // So keys are validated whenever they are offered, by anyone, and a signed
  // request that offers none is a claim about one identity only — the caller's
  // own. Whether that claim is true cannot be known before the lookup, so the
  // answer for "not yours" is made identical to the answer for "no such code",
  // miss counter included (below, at `sameDevice`).
  const label = typeof body.label === "string" ? body.label.slice(0, 200) : null;
  const sessionId = crypto.randomUUID();
  const offersKeys = body.sign_pub !== undefined || body.wrap_pub !== undefined;
  if (!caller || offersKeys) {
    if (!isText(body.sign_pub, 1024) || !await importSignPublicKey(body.sign_pub)) {
      return refuse("invalid_body", "sign_pub is not a base64url SPKI P-256 key", 400);
    }
    if (!isText(body.wrap_pub, 1024) || !base64urlToBytes(body.wrap_pub)) {
      return refuse("invalid_body", "wrap_pub is not base64url", 400);
    }
  }

  const found = await query<{ id: string; recovery_wrapped_key: Uint8Array | null }>(
    `SELECT id, recovery_wrapped_key FROM identities
      WHERE recovery_auth_hash = $1 AND closed_at IS NULL
        AND signup_completed_at IS NOT NULL`,
    [await recoveryHash(body.lookup_id)],
  );
  if (found === null) {
    inc("relay_recovery_claim_total", { result: "unavailable" });
    return refuse("unavailable", "the node cannot answer right now", 503);
  }
  const identity = found[0];
  if (!identity || !identity.recovery_wrapped_key) {
    // One wording for "no such code", "the identity is closed" and "that
    // registration never finished". Telling them apart would answer questions
    // about other people's identities to anyone typing codes.
    if (countMiss()) {
      log("warn", "recovery codes paused: the shared miss threshold was reached", {
        threshold: SHARED_MISS_MAX,
      });
      // The moment the brake came on, as a number. Without it an attack that
      // ends before morning leaves one log line and nothing on any graph —
      // `result: "paused"` below only grows while somebody keeps knocking.
      inc("relay_recovery_claim_total", { result: "pause_started" });
    }
    inc("relay_recovery_claim_total", { result: "no_match" });
    return refuse("not_found", "that code does not match", 404);
  }

  const sameDevice = caller !== null && caller.identityId === identity.id;

  // The signed caller who brought no keys and hit somebody else's code. The
  // code is right, and the answer says nothing about that: the same 404 and
  // the same spent miss as a code that matches nothing. Anything else here —
  // a 400 about the absent keys, a 503 from the insert that would follow — is
  // the confirmation the attacker came for.
  if (!sameDevice && !offersKeys) {
    if (countMiss()) {
      log("warn", "recovery codes paused: the shared miss threshold was reached", {
        threshold: SHARED_MISS_MAX,
      });
      inc("relay_recovery_claim_total", { result: "pause_started" });
    }
    inc("relay_recovery_claim_total", { result: "no_match" });
    return refuse("not_found", "that code does not match", 404);
  }

  const wrapped = bytesToBase64url(identity.recovery_wrapped_key);

  if (sameDevice) {
    const answer = await transaction<Response>(async (run) => {
      // Unfreezing can collide with the partial unique index if a live session
      // has appeared in the meantime — one live session per identity is held by
      // the index, not by this code, and that is on purpose.
      await run(
        `UPDATE sessions SET frozen_at = NULL, frozen_reason = NULL
          WHERE id = $1 AND identity = $2`,
        [caller!.sessionId, identity.id],
      );
      // Back to ten, and the lock lifted: §8.2 says the old PIN opens this
      // device's history again, and a counter left at zero would refuse it.
      await run(
        `UPDATE vault_shares
            SET attempts_left = 10, next_attempt_at = NULL, locked_at = NULL
          WHERE session = $1`,
        [caller!.sessionId],
      );
      await run(
        `UPDATE identities SET first_pin_grant_at = now() WHERE id = $1`,
        [identity.id],
      );
      inc("relay_recovery_claim_total", { result: "same_device" });
      return json({
        identity_id: identity.id,
        session_id: caller!.sessionId,
        recovery_wrapped_key: wrapped,
      }, 200, sunsetHeader());
    }).catch((error) => {
      log("error", "recovery claim failed on the same device", { error: String(error) });
      return refuse("refused", "this device cannot be raised right now", 409);
    });
    return answer;
  }

  const answer = await transaction<Response>(async (run) => {
    // Every live session of this identity goes quiet before the new one is
    // written, or the partial unique index refuses the insert. `transfer` rather
    // than a reason of its own: §8.2 gives the support exception to `pin_limit`
    // alone, and the device this freezes is the lost one.
    const live = await run<{ id: string }>(
      `SELECT id FROM sessions WHERE identity = $1 AND frozen_at IS NULL`,
      [identity.id],
    );
    // Frozen *and* burned: §8.2 (2026-09-11) makes any move of an identity burn
    // the old device's share, recovery and voluntary transfer alike. Freezing
    // alone left the lost phone decrypting its own history with its own PIN,
    // which is the opposite of what the person typing sixteen characters
    // believes they are doing.
    for (const session of live) {
      await freezeSession(run, session.id, "transfer");
      await burnShare(run, session.id);
    }

    await run(
      `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, identity.id, body.sign_pub as string, body.wrap_pub as string, label],
    );
    // No share is written here: the device has no PIN yet, and POST /vault/init
    // is the route that takes one — against the grant left below.
    await run(
      `UPDATE identities SET first_pin_grant_at = now() WHERE id = $1`,
      [identity.id],
    );
    inc("relay_recovery_claim_total", { result: "new_device" });
    return json({
      identity_id: identity.id,
      session_id: sessionId,
      recovery_wrapped_key: wrapped,
    }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "recovery claim failed on a new device", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

interface ShareBody {
  auth?: unknown;
}

// The stored half of the paper code is a hash of what the device presents, not
// the thing itself — the column is called `recovery_auth_hash` and db/022 says
// "hash of half the paper code", and until 2026-09-20 the node stored the
// presented value verbatim and compared it verbatim.
//
// What that cost, and why it is the same rule as the PIN one line below: a
// read-only copy of `identities` — a backup, an injection, a contractor, a
// seizure, the class the canon names — carried the bearer for every identity on
// the node. Anyone holding it could call POST /recovery/claim, take a live
// session, freeze the owner's device and burn their share, and the owner's way
// back is a piece of paper they may not have. The long key stays wrapped under
// the other half, so the old conversations do not open; everything else does.
// The PIN never had this hole: the device sends `auth` and the node stores
// sha256 of it (below), which is exactly why a dump is useless against a PIN.
//
// Found by the security lens of the review panel, 2026-09-20. The device sends
// the same `lookup_id` as before — this is not a protocol change, and the
// canon's own wording is what the code now does.
async function recoveryHash(lookupId: string): Promise<string> {
  return await sha256hex(new TextEncoder().encode(lookupId));
}

// POST /vault/share — the node's half of the vault key, against a proof of the PIN.
//
// This is the place §8.2 warns about by name: hand the share out without the
// proof and one theft turns into a million offline guesses. So the proof comes
// first, the counter is the node's, and the whole attempt is one transaction
// under SELECT … FOR UPDATE — without the lock two parallel tries walked past
// the counter together.
//
// It runs on an unfinished registration on purpose. The exchange happens at step
// 2, before the paper code is shown (storefront repository sosed.place,
// docs/02-name-screen_RU.md:55,78), so refusing it until the signup is finished
// would make finishing it impossible.
async function vaultShare(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowUnfinishedSignup: true });
  if (caller instanceof Response) return caller;

  const body = await readJson<ShareBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const auth = isText(body.auth, 512) ? base64urlToBytes(body.auth) : null;
  if (!auth || auth.length === 0) return refuse("invalid_body", "auth must be base64url", 400);
  // The stored value is a hash of this, never this: a dump that carried the proof
  // itself would be a dump that can open every vault it describes (SEC-1).
  const presented = await sha256hex(auth);

  const answer = await transaction<Response>(async (run) => {
    // The attempt itself — the row, the lock, the delay, the spent attempt and
    // the freeze on the tenth — lives in lib/pin_attempts.ts, shared with
    // POST /sessions/invite. It used to live here alone, which is how that
    // route came to ask for the same proof without any of the counting.
    const row = await checkPin(run, caller.sessionId, presented, (result) =>
      inc("relay_vault_share_total", { result: result === "wrong_pin" ? "wrong" : result }));
    if (row instanceof Response) return row;

    if (!row.share_enc) {
      // Burned: the device was transferred away. The share is gone by design and
      // there is nothing here to hand back.
      return refuse("not_found", "this session has no share", 404);
    }
    const share = await openShare(row.share_enc);
    if (!share) {
      // The row is there and the node cannot open it — a wrong or rotated
      // sealing key. Never "your PIN was wrong": the PIN was right.
      inc("relay_vault_share_total", { result: "unsealable" });
      return refuse("unavailable", "the node cannot open this share right now", 503);
    }

    await run(
      `UPDATE vault_shares
          SET attempts_left = 10, next_attempt_at = NULL, last_used_at = now()
        WHERE session = $1`,
      [caller.sessionId],
    );
    inc("relay_vault_share_total", { result: "given" });
    return json({ share: bytesToBase64url(share) }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "vault share failed", { error: String(error) });
    inc("relay_vault_share_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot answer right now", 503);
  });

  return answer;
}


interface VaultInitBody {
  auth_hash?: unknown;
  share?: unknown;
}

// POST /vault/init — the first PIN on a device that did not choose the old one.
//
// A transfer or a recovery leaves a one-time grant on the identity, and this
// route spends it. Without the grant the answer is 409 unauthorized, and that
// refusal is the whole reason the column exists: a signing key alone must never
// replace a PIN, because the canon's other rule — a PIN change needs the old one
// — would otherwise be worth nothing to anybody holding a stolen key.
//
// Runs on an unfinished registration for the same reason /vault/share does: the
// device that just arrived by transfer has no paper code of its own yet.
async function vaultInit(req: Request): Promise<Response> {
  const caller = await callerOf(req, { allowUnfinishedSignup: true });
  if (caller instanceof Response) return caller;

  const body = await readJson<VaultInitBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  if (!isText(body.auth_hash, 512)) return refuse("invalid_body", "auth_hash is missing", 400);
  const share = isText(body.share, 512) ? base64urlToBytes(body.share) : null;
  if (!share || share.length !== SHARE_BYTES) {
    return refuse("invalid_body", `share must be ${SHARE_BYTES} bytes, base64url`, 400);
  }
  if (!configured()) {
    return refuse("unavailable", "this node cannot store a vault share right now", 503);
  }
  const sealed = await sealShare(share);

  const answer = await transaction<Response>(async (run) => {
    // Spent in the same statement that reads it, so two calls racing cannot both
    // find a grant. An empty result is the refusal, not an error to recover from.
    const spent = await run<{ id: string }>(
      `UPDATE identities SET first_pin_grant_at = NULL
        WHERE id = $1 AND closed_at IS NULL
          AND first_pin_grant_at > now() - interval '${FIRST_PIN_TTL_HOURS} hours'
        RETURNING id`,
      [caller.identityId],
    );
    if (spent.length === 0) {
      // One wording for "never had one", "already spent" and "expired": all
      // three mean the same to an honest client, and telling them apart tells
      // a stolen signing key which door it is standing at.
      inc("relay_vault_init_total", { result: "no_grant" });
      return refuse("unauthorized", "no first-PIN grant on this identity", 409);
    }

    // The row is the device's, so it is written rather than inserted: the session
    // already has a share from whatever it was before, and the counter goes back
    // to ten because this is a PIN nobody has got wrong yet.
    await run(
      `INSERT INTO vault_shares (session, auth_hash, share_enc)
       VALUES ($1, $2, $3)
       ON CONFLICT (session) DO UPDATE
          SET auth_hash = EXCLUDED.auth_hash, share_enc = EXCLUDED.share_enc,
              attempts_left = 10, next_attempt_at = NULL, locked_at = NULL,
              burned_at = NULL, last_used_at = now()`,
      [caller.sessionId, body.auth_hash, sealed],
    );
    inc("relay_vault_init_total", { result: "set" });
    return new Response(null, { status: 204, headers: sunsetHeader() });
  }).catch((error) => {
    log("error", "first PIN failed to write", { error: String(error) });
    inc("relay_vault_init_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  });

  return answer;
}

route("POST", "/identities", (c) => createIdentity(c.req));
route("GET", "/identities/me", (c) => readProfile(c.req));
route("POST", "/recovery/claim", (c) => claimRecovery(c.req));
route("POST", "/recovery/confirm", (c) => confirmRecovery(c.req));
route("POST", "/vault/share", (c) => vaultShare(c.req));
route("POST", "/vault/init", (c) => vaultInit(c.req));
