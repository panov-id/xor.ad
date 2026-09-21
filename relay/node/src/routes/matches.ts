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
// - the ephemeral public key that consent carries in §8.5 — that is the
//   encryption of step 6, and nothing reads it before then.
//
// A match that is not the caller's, or is over, answers 404 alike: the caller
// learns nothing about other people's matches either way.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
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

  const answer = await transaction<Response>(async (run) => {
    await run(`SET LOCAL lock_timeout = '2s'`);
    // The match row first, locked, so two consents at once see each other.
    const [live] = await run<{ id: string }>(
      `SELECT m.id FROM matches m
         JOIN match_participants p ON p.match_id = m.id AND p.identity = $2
        WHERE m.id = $1 AND m.expires_at > now()
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

    await run(
      `UPDATE match_participants SET accepted_at = coalesce(accepted_at, now()), declined_at = NULL
        WHERE match_id = $1 AND identity = $2`,
      [matchId, me],
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
    const chatId = crypto.randomUUID();
    await run(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [chatId, existing.pair_key]);
    await run(
      `INSERT INTO chat_participants (chat_id, identity)
       SELECT $1, identity FROM match_participants WHERE match_id = $2`,
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
