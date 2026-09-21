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
// - the chat. When both have consented the answer is {state: 'agreed'} and no
//   chat_id: `chats` is step 5, and this route will open one there;
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
    const agreed = both.n === 2;
    inc("relay_match_total", { action: agreed ? "agreed" : "consent" });
    return json({ state: agreed ? "agreed" : "waiting" }, 200, sunsetHeader());
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
