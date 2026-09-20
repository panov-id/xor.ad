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
import { freezeSession } from "../lib/sessions.ts";
import { PROTOCOL_MAJOR, protocolVersion, versionSupported } from "../lib/identity_auth.ts";
import { IDENTITY_CREATE_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";

// §8.2: 24 graphemes is what a person is shown; the node counts bytes, because
// that is the thing it can enforce, and 400 is the ceiling the DDL states.
const NAME_MAX_BYTES = 400;
const MIN_AGE = 13;
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
  if (body.age < MIN_AGE) {
    inc("relay_identities_total", { result: "too_young" });
    return refuse("too_young", "this place is for 13 and over", 422);
  }

  const name = body.name;
  if (
    typeof name !== "string" || name.length < 1 ||
    new TextEncoder().encode(name).length > NAME_MAX_BYTES
  ) {
    return refuse("invalid_body", "the name is missing or too long", 400);
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
      [identityId, name, body.age, body.sign_pub, body.recovery_lookup_id],
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
    return true;
  }).catch(() => false);

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
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  const row = rows[0];
  if (!row) return refuse("unauthorized", "the request is not signed by a live session", 401);

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
  if (spent === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (spent.length === 0) {
    inc("relay_identities_total", { result: "already_confirmed" });
    return refuse("refused", "this registration is already finished", 409);
  }

  inc("relay_identities_total", { result: "confirmed" });
  return new Response(null, { status: 204, headers: sunsetHeader() });
}


interface ShareBody {
  auth?: unknown;
}

interface VaultRow {
  auth_hash: string;
  share_enc: Uint8Array | null;
  attempts_left: number;
  next_attempt_at: Date | null;
  locked_at: Date | null;
}

// Constant time over the hex, because a comparison that returns early tells the
// caller how many leading characters were right, and a million PINs is few
// enough that the leak is worth something.
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
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
    const [row] = await run<VaultRow>(
      `SELECT auth_hash, share_enc, attempts_left, next_attempt_at, locked_at
         FROM vault_shares WHERE session = $1 FOR UPDATE`,
      [caller.sessionId],
    );
    if (!row) return refuse("not_found", "this session has no share", 404);

    // Locked and too-early are answered before the hash is looked at, and a
    // correct PIN is refused here too — otherwise waiting out the delay would
    // itself be a way to test one.
    if (row.locked_at) {
      return refuse("pin_locked", "entry is closed until the paper code", 409, {
        attempts_left: 0,
      });
    }
    const early = row.next_attempt_at && row.next_attempt_at.getTime() > Date.now();
    if (early) {
      const seconds = Math.ceil((row.next_attempt_at!.getTime() - Date.now()) / 1000);
      return refuse("rate_limited", "too soon after the last attempt", 429, {
        attempts_left: row.attempts_left,
      }, { "retry-after": String(seconds) });
    }

    if (!sameHash(presented, row.auth_hash)) {
      // The delays of §8.2, by their own numbers: the sixth attempt waits 30
      // seconds, the tenth four hours, and the tenth miss closes entry without
      // burning the share — a stolen signing key must not be able to erase
      // somebody's history from afar.
      await run(
        `UPDATE vault_shares
            SET attempts_left   = attempts_left - 1,
                next_attempt_at = now() + CASE attempts_left - 1
                    WHEN 5 THEN interval '30 seconds' WHEN 4 THEN interval '2 minutes'
                    WHEN 3 THEN interval '10 minutes' WHEN 2 THEN interval '1 hour'
                    WHEN 1 THEN interval '4 hours' ELSE interval '0' END,
                locked_at       = CASE WHEN attempts_left - 1 = 0 THEN now() END
          WHERE session = $1`,
        [caller.sessionId],
      );
      const left = row.attempts_left - 1;
      if (left === 0) {
        // The same transaction freezes the session, and §8.2 is explicit about
        // why (2026-09-14, SEC3/SEC-A): refusing the three irreversible actions
        // is not enough, because an unlocked tab holds the signing key in memory
        // — whoever holds the tab would go on publishing, writing in
        // conversations, complaining and asking support in this person's name,
        // all the way until the paper code. Closing the PIN alone leaves exactly
        // that open, so the two are one write or they are a hole.
        //
        // Freezing carries its own notification; lib/sessions.ts says why that
        // is not optional and why it is not written inline here.
        await freezeSession(run, caller.sessionId, "pin_limit");
      }
      inc("relay_vault_share_total", { result: left === 0 ? "locked" : "wrong" });
      return refuse(
        left === 0 ? "pin_locked" : "unauthorized",
        left === 0 ? "entry is closed until the paper code" : "that PIN does not match",
        409,
        { attempts_left: Math.max(left, 0) },
      );
    }

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
  }).catch(() => refuse("unavailable", "the node cannot answer right now", 503));

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
        WHERE id = $1 AND first_pin_grant_at IS NOT NULL AND closed_at IS NULL
        RETURNING id`,
      [caller.identityId],
    );
    if (spent.length === 0) {
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
  }).catch(() => refuse("unavailable", "the node cannot write right now", 503));

  return answer;
}

route("POST", "/identities", (c) => createIdentity(c.req));
route("GET", "/identities/me", (c) => readProfile(c.req));
route("POST", "/recovery/confirm", (c) => confirmRecovery(c.req));
route("POST", "/vault/share", (c) => vaultShare(c.req));
route("POST", "/vault/init", (c) => vaultInit(c.req));
