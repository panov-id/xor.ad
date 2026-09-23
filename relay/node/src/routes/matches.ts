// Step 4 of the build order: consent to a match, and "not now" (§8.5,
// screens 6 and 7).
//
// A match is not a chat but an offer to talk that both must accept. Consent
// writes accepted_at; "not now" writes declined_at at once and is seen only by
// its own side — nothing tells the other person (screen 6). The undo has no
// timer (owner's decision, 2026-09-18): while the match lives, the decline can
// be taken back.
//
// Not here yet, and said so:
// - the chat's transport: agreement opens the chat and answers its chat_id
//   (step 5, db/031), but the room it is spoken in comes next;
// The ephemeral half of §8.13 rides on consent since 2026-09-22: a P-256 ECDH
// public key (SPKI, base64url) with a detached signature by the caller's long
// key, checked here so the peer never receives a half the node could have
// minted. The inbox hands each side the other's half.
//
// A match that is not the caller's, or is over, answers 404 alike: the caller
// learns nothing about other people's matches either way.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sunsetHeader, verifyByLongKey } from "../lib/identity_auth.ts";

// What the long key signs for a half (§8.13, bound 2026-09-22). The same
// bytes on the peer's side, in depth/core/seal.ts.
export const HALF_DOMAIN = "xor.ephemeral.v1\n";
export function halfToSign(matchId: string, spki: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(HALF_DOMAIN + matchId + "\n");
  const out = new Uint8Array(prefix.length + spki.length);
  out.set(prefix);
  out.set(spki, prefix.length);
  return out;
}
import { checkAll, LIKE_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
type Action = "consent" | "decline" | "undo";

// The same budget as a like: consent and decline are the other half of the
// same act, and a loop over them is the same kind of script (limits.tsv
// like.hour).
async function act(req: Request, matchId: string, action: Action): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const allowed = checkAll(LIKE_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many actions this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  if (!UUID.test(matchId)) return refuse("not_found", "no such match", 404);
  const me = caller.identityId;

  // Consent carries the ephemeral half — always: the spec knows no chat in
  // the clear (§8.13), so a consent without one is not a consent. The
  // signature is over "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI, not the bare
  // SPKI: bound to this match, a half cannot be carried by the node into
  // another match of the same identity, and the long key's two uses — request
  // lines and halves — cannot collide (security lens, 2026-09-22).
  let half: { key: string; signature: string } | null = null;
  if (action === "consent") {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const key = body?.ephemeral_public_key;
    const signature = body?.ephemeral_signature;
    if (typeof key !== "string" || typeof signature !== "string" || key.length > 256 || signature.length > 256) {
      return refuse("invalid_body", "consent carries ephemeral_public_key and ephemeral_signature, base64url", 400);
    }
    const bytes = base64urlToBytes(key);
    const [mine] = await query<{ identity_public_key: string }>(
      `SELECT identity_public_key FROM identities WHERE id = $1`, [me]) ?? [];
    if (!bytes || !mine || !(await verifyByLongKey(mine.identity_public_key, halfToSign(matchId, bytes), signature))) {
      return refuse("invalid_body", "the ephemeral half is not signed by your long key for this match", 400);
    }
    half = { key, signature };
  }

  const answer = await transaction<Response>(async (run) => {
    await run(`SET LOCAL lock_timeout = '2s'`);
    // The pair's counters first, in order, as the like, the step away and the
    // profile take them — the match row used to come first, and a step away
    // of either person at the same moment deadlocked with it (review panel of
    // the step away, 23.09.2026, data lens). Only if the caller is in it, and
    // only for a consent: "not now" and its undo write no counters, and
    // queueing them behind a stream of likes turned them into 503s (panel).
    if (action === "consent") {
      await run(
        `SELECT 1 FROM identity_stats
          WHERE identity IN (SELECT identity FROM match_participants WHERE match_id = $1)
            AND EXISTS (SELECT 1 FROM match_participants WHERE match_id = $1 AND identity = $2)
          ORDER BY identity FOR UPDATE`,
        [matchId, me],
      );
    }
    // Then the match row, locked, so two consents at once see each other.
    const [live] = await run<{ id: string }>(
      `SELECT m.id FROM matches m
         JOIN match_participants p ON p.match_id = m.id AND p.identity = $2
        WHERE m.id = $1 AND m.expires_at > now()
          -- §8.9: nothing between two people a block stands between (step 7
          -- panel, 2026-09-21: consent used to open a chat over a block).
          AND NOT EXISTS (
            SELECT 1 FROM match_participants o
              JOIN blocks b ON (b.blocker_identity = p.identity AND b.blocked_identity = o.identity)
                            OR (b.blocker_identity = o.identity AND b.blocked_identity = p.identity)
             WHERE o.match_id = m.id AND o.identity <> p.identity)
        FOR UPDATE OF m`,
      [matchId, me],
    );
    if (!live) return refuse("not_found", "no such match", 404);

    if (action === "decline") {
      await run(
        `UPDATE match_participants SET declined_at = now(), accepted_at = NULL
          WHERE match_id = $1 AND identity = $2`,
        [matchId, me],
      );
      inc("relay_match_total", { action: "decline" });
      return new Response(null, { status: 204, headers: sunsetHeader() });
    }
    if (action === "undo") {
      await run(
        `UPDATE match_participants SET declined_at = NULL WHERE match_id = $1 AND identity = $2`,
        [matchId, me],
      );
      inc("relay_match_total", { action: "undo" });
      return new Response(null, { status: 204, headers: sunsetHeader() });
    }

    // The first half stands: the peer may already have derived with it. A
    // retry with the same half is fine; a different one is refused, so a
    // restarted client learns it has no pair for this chat rather than
    // talking past the peer with keys nobody shares (both lenses, 2026-09-22).
    const [stood] = await run<{ ephemeral_public_key: string | null }>(
      `SELECT ephemeral_public_key FROM match_participants WHERE match_id = $1 AND identity = $2`,
      [matchId, me],
    );
    if (stood?.ephemeral_public_key && stood.ephemeral_public_key !== half!.key) {
      return refuse("half_published", "a different ephemeral half already stands for this match", 409);
    }
    await run(
      `UPDATE match_participants
          SET accepted_at = coalesce(accepted_at, now()), declined_at = NULL,
              ephemeral_public_key = coalesce(ephemeral_public_key, $3),
              ephemeral_signature = coalesce(ephemeral_signature, $4)
        WHERE match_id = $1 AND identity = $2`,
      [matchId, me, half!.key, half!.signature],
    );
    const [both] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM match_participants
        WHERE match_id = $1 AND accepted_at IS NOT NULL`,
      [matchId],
    );
    if (both.n < 2) {
      inc("relay_match_total", { action: "consent" });
      return json({ state: "waiting" }, 200, sunsetHeader());
    }

    // Both agreed: the chat opens here, in the same transaction (§8.5, §8.6).
    // One chat per pair — the unique pair_key says so; a second agreement on a
    // match that already has its chat answers with that chat.
    const [existing] = await run<{ chat_id: string | null; pair_key: string }>(
      `SELECT chat_id, pair_key FROM matches WHERE id = $1`, [matchId],
    );
    if (existing.chat_id) {
      return json({ state: "agreed", chat_id: existing.chat_id }, 200, sunsetHeader());
    }
    // The two identity_stats rows are already held, taken in order at the top
    // of this transaction (step 5 panel, 2026-09-21; step away panel, 2026-09-23).
    // A chat of the pair that is over for both and not yet swept is not a
    // chat to join: it goes first, and the pair gets a new one. Joining it put
    // two people back into a conversation that had ended for both, with the
    // rooms already closed (rekey panel, 2026-09-22 — found reading the kept
    // branch below).
    await run(
      `DELETE FROM chats c
        WHERE c.pair_key = $1
          AND NOT EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)`,
      [existing.pair_key],
    );
    // One chat per pair: an existing one (a chat that outlived an older match of
    // the pair) is joined rather than duplicated, never a unique-key failure.
    // After the delete above it is a live chat, which the like forbids a new
    // match beside (likes.ts, chatLives) — so this branch is a guard, not a path.
    const [created] = await run<{ id: string }>(
      `INSERT INTO chats (id, pair_key) VALUES ($1, $2)
       ON CONFLICT (pair_key) DO NOTHING RETURNING id`,
      [crypto.randomUUID(), existing.pair_key],
    );
    if (!created) {
      const [kept] = await run<{ id: string }>(`SELECT id FROM chats WHERE pair_key = $1`, [existing.pair_key]);
      await run(`UPDATE matches SET chat_id = $1 WHERE id = $2`, [kept.id, matchId]);
      inc("relay_match_total", { action: "agreed" });
      return json({ state: "agreed", chat_id: kept.id }, 200, sunsetHeader());
    }
    const chatId = created.id;
    await run(
      `INSERT INTO chat_participants (chat_id, identity, match_id, ephemeral_public_key, ephemeral_signature)
       SELECT $1, identity, match_id, ephemeral_public_key, ephemeral_signature
         FROM match_participants WHERE match_id = $2`,
      [chatId, matchId],
    );
    // The header: each side's phrase, copied, with who liked it — the other one.
    await run(
      `INSERT INTO chat_starters (chat_id, position, text_snapshot, mode, liked_by)
       SELECT $1, row_number() OVER (ORDER BY p.identity), coalesce(p.text_snapshot, ''), p.mode,
              (SELECT o.identity FROM match_participants o WHERE o.match_id = p.match_id AND o.identity <> p.identity)
         FROM match_participants p WHERE p.match_id = $2`,
      [chatId, matchId],
    );
    await run(`UPDATE matches SET chat_id = $1 WHERE id = $2`, [chatId, matchId]);
    await run(
      `UPDATE identity_stats SET chats_opened = chats_opened + 1, updated_at = now()
        WHERE identity IN (SELECT identity FROM match_participants WHERE match_id = $1)`,
      [matchId],
    );
    inc("relay_match_total", { action: "agreed" });
    return json({ state: "agreed", chat_id: chatId }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "match action failed", { error: String(error) });
    inc("relay_match_total", { action: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

route("POST", "/matches/:id/consent", (c) => act(c.req, c.params.id, "consent"));
route("POST", "/matches/:id/decline", (c) => act(c.req, c.params.id, "decline"));
route("DELETE", "/matches/:id/decline", (c) => act(c.req, c.params.id, "undo"));
