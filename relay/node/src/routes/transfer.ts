// Moving an identity to another device, which the canon calls a transfer and
// screen 13 shows as four steps on two screens at once.
//
// The node's part is small and deliberately so (chat spec §8.2). The old device
// makes nine characters, stretches them with Argon2id, keeps half and sends the
// other half as `lookup_id`. The new device is told the nine characters out
// loud, derives the same two halves, and seals its public keys to the half the
// node never sees. The node holds the rendezvous, a two-minute clock, and the
// rule that this happens once. It cannot open either envelope.
//
// The route that did not exist until 2026-09-21 is `GET /sessions/:lookup_id`,
// and without it none of the others could finish. Both devices need to learn
// what happened — the old one that a claim arrived, so it can show the four
// check characters and ask; the new one that the person said yes, so it can
// collect the reply. A socket was assumed (§8.1) and there are none yet, and
// polling `POST /sessions/claim` is not available for it: a second claim
// cancels the transfer, by the decision of 2026-09-15 that stops somebody who
// read the code over a shoulder from silently winning. So the state is a route
// of its own — the fifty-eighth name in the contract, added by the owner's
// decision after the review panel of 2026-09-20 wrote the fork up as G15.
//
// What the node never does here: decide. The person at the old device decides,
// and `approve` is the only thing that moves an identity.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll, TRANSFER_CLAIM_LIMITS, TRANSFER_INVITE_LIMITS } from "../lib/rate_limit.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { checkPin } from "../lib/pin_attempts.ts";
import { base64urlToBytes, bytesToBase64url, importSignPublicKey, sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { PROTOCOL_MAJOR, protocolVersion, versionSupported } from "../lib/identity_auth.ts";
import { TRANSFER } from "../lib/recovery_misses.ts";
import { burnShare, freezeSession } from "../lib/sessions.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

// `invite.lifetime` in docs/facts/limits.tsv: 120 seconds. Short because the
// code is read out loud, and a code that is read out loud is a code somebody
// else may hear.
const INVITE_TTL_SECONDS = 120;
const ENVELOPE_MAX = 8192;

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

interface InviteRow {
  lookup_id: string;
  identity: string;
  session: string;
  expires_at: Date;
  claimed_at: Date | null;
  claim_envelope: Uint8Array | null;
  decided_at: Date | null;
  decision: string | null;
  reply_envelope: Uint8Array | null;
  new_session: string | null;
}

// What both devices are told, and nothing beyond it. The state is a word rather
// than a set of timestamps: a client acts on "what do I do next", and every
// timestamp here would be a fact about somebody else's device.
function stateOf(invite: InviteRow, now = Date.now()): string {
  if (invite.decision) return invite.decision;
  if (invite.expires_at.getTime() <= now) return "expired";
  return invite.claimed_at ? "claimed" : "waiting";
}

// POST /sessions/invite — the old device opens a window.
//
// Signed, and **with a proof of the PIN** (§8.2, 2026-09-11): the three
// irreversible actions all ask for it, and handing the identity to another
// device is the most irreversible of them. A stolen signing key alone must not
// be able to start a transfer.
async function createInvite(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  // After the signature, before the PIN: an unsigned flood is refused by
  // callerOf without spending this address's allowance, and a signed one stops
  // here without spending anybody's attempt.
  const verdict = checkAll(TRANSFER_INVITE_LIMITS, clientAddress(req).ip);
  if (!verdict.allowed) {
    inc("relay_transfer_total", { result: "address_limited" });
    return refuse("rate_limited", "too many transfer windows from this address", 429, {}, {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  const body = await readJson<{ lookup_id?: unknown; auth?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  if (!isText(body.lookup_id, 512) || body.lookup_id.length < 16) {
    return refuse("invalid_body", "lookup_id is missing or too short", 400);
  }
  const auth = isText(body.auth, 512) ? base64urlToBytes(body.auth) : null;
  if (!auth || auth.length === 0) return refuse("invalid_body", "auth must be base64url", 400);
  const presented = await sha256hex(auth);

  const answer = await transaction<Response>(async (run) => {
    // The PIN, against this device's own row, through the same counter as
    // POST /vault/share. Not the share: nothing is handed out here, so there
    // is nothing to seal or open — only the proof to check.
    //
    // This route used to check the proof by hand: `auth_hash, locked_at`, a
    // `!==`, and a metric. No attempt spent, no delay honoured, no freeze on
    // the tenth, and no per-address limit either — so a stolen signing key
    // bought an unlimited, untimed, unrecorded PIN search, against the one
    // action the proof exists to protect. Found by the security lens of the
    // review panel, 2026-09-21.
    const vault = await checkPin(run, caller.sessionId, presented, (result) =>
      inc("relay_transfer_total", { result }));
    if (vault instanceof Response) return vault;

    // One invitation in flight per identity, held by the index rather than by
    // this code. A second one would mean two devices racing for the single live
    // session, so the earlier invitation is closed first — cancelled, not
    // silently replaced, because the device holding it is showing a code.
    await run(
      `UPDATE session_invites SET decided_at = now(), decision = 'cancelled'
        WHERE identity = $1 AND decided_at IS NULL`,
      [caller.identityId],
    );
    await run(
      `INSERT INTO session_invites (lookup_id, identity, session, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [body.lookup_id, caller.identityId, caller.sessionId, INVITE_TTL_SECONDS],
    );
    inc("relay_transfer_total", { result: "invited" });
    return json({ expires_in: INVITE_TTL_SECONDS }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "transfer invite failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

// POST /sessions/claim — the new device types the code.
//
// Unsigned: this device has no session yet, and the code is what authorises it.
// A second claim on the same invitation cancels the transfer on both sides
// (§8.2, 2026-09-15, SEC-5): somebody who read the code over a shoulder and
// typed it first would otherwise win silently, and the owner would see a
// confirmation screen for a device that is not theirs.
async function claimInvite(req: Request): Promise<Response> {
  const version = protocolVersion(req);
  if (!versionSupported(version)) {
    return refuse("protocol_version_unsupported", `this node serves protocol ${PROTOCOL_MAJOR}; update the client`, 400);
  }
  const paused = TRANSFER.pausedFor();
  if (paused > 0) {
    inc("relay_transfer_total", { result: "paused" });
    return refuse("rate_limited", "transfer codes are not being accepted right now", 429, {}, {
      "retry-after": String(paused),
    });
  }
  const verdict = checkAll(TRANSFER_CLAIM_LIMITS, clientAddress(req).ip);
  if (!verdict.allowed) {
    inc("relay_transfer_total", { result: "address_limited" });
    return refuse("rate_limited", "too many attempts from this address", 429, {}, {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  const body = await readJson<{ lookup_id?: unknown; envelope?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  if (!isText(body.lookup_id, 512)) return refuse("invalid_body", "lookup_id is missing", 400);
  const envelope = isText(body.envelope, ENVELOPE_MAX) ? base64urlToBytes(body.envelope) : null;
  if (!envelope || envelope.length === 0) {
    return refuse("invalid_body", "envelope must be base64url", 400);
  }

  const answer = await transaction<Response>(async (run) => {
    const [invite] = await run<InviteRow>(
      `SELECT * FROM session_invites WHERE lookup_id = $1 FOR UPDATE`,
      [body.lookup_id as string],
    );
    // One wording for "no such code", "already decided" and "expired": a typo
    // and a code somebody is guessing at must not be told apart.
    if (!invite || invite.decided_at || invite.expires_at.getTime() <= Date.now()) {
      if (TRANSFER.countMiss()) {
        log("warn", "transfer codes paused: the shared miss threshold was reached", {
          threshold: TRANSFER.max,
        });
        inc("relay_transfer_total", { result: "pause_started" });
      }
      inc("relay_transfer_total", { result: "no_match" });
      return refuse("not_found", "that code does not match or has expired", 404);
    }

    if (invite.claimed_at) {
      // The second claim. Both sides are told, and the invitation is over.
      await run(
        `UPDATE session_invites SET decided_at = now(), decision = 'cancelled' WHERE lookup_id = $1`,
        [invite.lookup_id],
      );
      inc("relay_transfer_total", { result: "cancelled_by_second_claim" });
      return refuse("refused", "this code was used twice; the transfer is cancelled", 409);
    }

    await run(
      `UPDATE session_invites SET claimed_at = now(), claim_envelope = $2 WHERE lookup_id = $1`,
      [invite.lookup_id, envelope],
    );
    inc("relay_transfer_total", { result: "claimed" });
    // No session yet, and no promise of one: what comes back is only that the
    // old device now has something to show a person.
    return json({ state: "claimed" }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "transfer claim failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}



// GET /sessions/:lookup_id — the route without which none of the others finish.
//
// Unsigned, and authorised by the `lookup_id` itself: the new device has no
// session until the transfer completes, and the old device could sign but must
// not have to — both sides need the same answer, and the code is what both of
// them hold.
//
// It carries the envelope for whoever it belongs to and never both: the claim
// envelope is for the old device (it is what makes the check characters
// showable), the reply is for the new one. The node cannot open either, so this
// is not a judgement about contents — it is about not handing a claimant the
// copy of somebody else's envelope to keep.
async function inviteState(req: Request, lookupId: string): Promise<Response> {
  const version = protocolVersion(req);
  if (!versionSupported(version)) {
    return refuse("protocol_version_unsupported", `this node serves protocol ${PROTOCOL_MAJOR}; update the client`, 400);
  }
  // The same per-address ceiling as the claim: this is a route somebody polls,
  // and a route somebody polls is a route somebody can hammer.
  const verdict = checkAll(TRANSFER_CLAIM_LIMITS, clientAddress(req).ip);
  if (!verdict.allowed) {
    return refuse("rate_limited", "too many attempts from this address", 429, {}, {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  const rows = await query<InviteRow>(`SELECT * FROM session_invites WHERE lookup_id = $1`, [lookupId]);
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  const invite = rows[0];
  // A code that never existed and one that has been decided and swept read the
  // same, for the reason every other refusal on this pair of routes does.
  if (!invite) return refuse("not_found", "that code does not match or has expired", 404);

  const state = stateOf(invite);
  const body: Record<string, unknown> = { state };
  if (state === "claimed" && invite.claim_envelope) {
    body.claim_envelope = bytesToBase64url(invite.claim_envelope);
  }
  if (state === "approved" && invite.reply_envelope) {
    body.reply_envelope = bytesToBase64url(invite.reply_envelope);
    body.session_id = invite.new_session;
  }
  return json(body, 200, sunsetHeader());
}

// POST /sessions/:lookup_id/approve — "it is me", and the only thing that moves
// an identity.
//
// Signed by the session that issued the invitation and by no other: §8.2 and
// screen 13. What the body carries is the reply envelope — the long key sealed
// to the code's other half — because the node has never held that key and must
// not start now.
//
// What this does in one transaction: writes the new session from the claim, and
// takes the old one down the way §8.2 says every move does — frozen, its share
// burned, the notification sent. The device left behind keeps its disk and
// opens nothing.
async function approveInvite(req: Request, lookupId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  const body = await readJson<{ reply?: unknown; sign_pub?: unknown; wrap_pub?: unknown; label?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const reply = isText(body.reply, ENVELOPE_MAX) ? base64urlToBytes(body.reply) : null;
  if (!reply || reply.length === 0) return refuse("invalid_body", "reply must be base64url", 400);
  // The old device opened the claim envelope and therefore knows the new
  // device's keys; it passes them on, because the node cannot read them out of
  // an envelope it has no key for.
  if (!isText(body.sign_pub, 1024) || !await importSignPublicKey(body.sign_pub)) {
    return refuse("invalid_body", "sign_pub is not a base64url SPKI P-256 key", 400);
  }
  if (!isText(body.wrap_pub, 1024) || !base64urlToBytes(body.wrap_pub)) {
    return refuse("invalid_body", "wrap_pub is not base64url", 400);
  }
  const label = typeof body.label === "string" ? body.label.slice(0, 200) : null;
  const sessionId = crypto.randomUUID();

  const answer = await transaction<Response>(async (run) => {
    const [invite] = await run<InviteRow>(
      `SELECT * FROM session_invites WHERE lookup_id = $1 FOR UPDATE`,
      [lookupId],
    );
    if (!invite) return refuse("not_found", "no such invitation", 404);
    // Only the session that issued it, and only within its two minutes. Both
    // are refused with the same wording as a stranger's attempt: a caller who
    // is not the issuer learns nothing about whether the code was real.
    if (invite.session !== caller.sessionId || invite.identity !== caller.identityId) {
      return refuse("not_found", "no such invitation", 404);
    }
    if (invite.decided_at) return refuse("refused", "this invitation is already decided", 409);
    if (invite.expires_at.getTime() <= Date.now()) {
      return refuse("refused", "this invitation has expired", 409);
    }
    if (!invite.claimed_at) {
      // Nothing to approve: the person is looking at a screen that has not been
      // claimed yet, which is a different thing from a refusal.
      return refuse("refused", "nobody has typed this code yet", 409);
    }

    // A close committed while this waited must stop it here: the guard read
    // the identity before the transaction, and a session seated now would be
    // a live one in a closed identity (review panel 2026-09-24, security
    // lens). The vault row first — the lock a close takes first — so the two
    // queue up instead of meeting the other way round; then the identity,
    // read after it.
    await run(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [caller.sessionId]);
    const [open] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM identities WHERE id = $1 AND closed_at IS NULL`, [invite.identity]);
    if (open.n === 0) return refuse("unauthorized", "the request is not signed by a live session", 401);
    // And this session itself, read after the same lock: a claim by the paper
    // code that committed while this waited froze it and seated the owner's new
    // device. Let through, the approval froze the owner and seated the invited
    // device — the lost phone taking the identity back past the paper code
    // (verifier, 2026-09-25, reproduced).
    const [mine] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM sessions WHERE id = $1 AND frozen_at IS NULL`, [caller.sessionId]);
    if (mine.n === 0) return refuse("unauthorized", "the request is not signed by a live session", 401);

    // The move itself, and the order is not a matter of taste: the leaving
    // device goes quiet **before** the arriving one is written. One live
    // session per identity is held by a partial unique index (db/022), so the
    // insert is refused outright while the old session is still live — which is
    // exactly what happened the first time this ran, and the route answered a
    // 503 about a database it had not been able to write to.
    const live = await run<{ id: string }>(
      `SELECT id FROM sessions WHERE identity = $1 AND frozen_at IS NULL`,
      [invite.identity],
    );
    for (const session of live) {
      await freezeSession(run, session.id, "transfer");
      await burnShare(run, session.id);
    }
    await run(
      `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, invite.identity, body.sign_pub as string, body.wrap_pub as string, label],
    );
    // The arriving device has no PIN of its own yet, and the one it is about to
    // set is a first PIN by the canon's own definition (§8.2, screen 13).
    await run(`UPDATE identities SET first_pin_grant_at = now() WHERE id = $1`, [invite.identity]);
    await run(
      `UPDATE session_invites
          SET decided_at = now(), decision = 'approved', reply_envelope = $2, new_session = $3
        WHERE lookup_id = $1`,
      [lookupId, reply, sessionId],
    );
    inc("relay_transfer_total", { result: "approved" });
    return json({ state: "approved", session_id: sessionId }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "transfer approve failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

// POST /sessions/:lookup_id/reject — "that is not me".
//
// The code dies and the identity does not move. Nothing else happens: no
// freeze, no burn, no session. The device that typed the code learns it through
// the state route, which is the point of that route existing.
async function rejectInvite(req: Request, lookupId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  const answer = await transaction<Response>(async (run) => {
    const rows = await run<{ lookup_id: string }>(
      `UPDATE session_invites SET decided_at = now(), decision = 'rejected'
        WHERE lookup_id = $1 AND session = $2 AND identity = $3 AND decided_at IS NULL
        RETURNING lookup_id`,
      [lookupId, caller.sessionId, caller.identityId],
    );
    if (rows.length === 0) {
      // One statement, so "not yours", "already decided" and "no such code" are
      // the same empty result — and the same answer, for the same reason.
      return refuse("not_found", "no such invitation", 404);
    }
    inc("relay_transfer_total", { result: "rejected" });
    return new Response(null, { status: 204, headers: sunsetHeader() });
  }).catch((error) => {
    log("error", "transfer reject failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

route("POST", "/sessions/invite", (c) => createInvite(c.req));
route("POST", "/sessions/claim", (c) => claimInvite(c.req));
route("GET", "/sessions/:lookup_id", (c) => inviteState(c.req, c.params.lookup_id));
route("POST", "/sessions/:lookup_id/approve", (c) => approveInvite(c.req, c.params.lookup_id));
route("POST", "/sessions/:lookup_id/reject", (c) => rejectInvite(c.req, c.params.lookup_id));

export { approveInvite, claimInvite, createInvite, inviteState, INVITE_TTL_SECONDS, rejectInvite, stateOf };
