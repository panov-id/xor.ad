// What a verdict does, in one transaction, and why it is one.
//
// A phrase is read before it is published (§8.3). When the reading is done,
// two things have to happen together: the row becomes visible or stops
// existing, and the moment goes into the author's counters. Apart, they are a
// hole — a send arriving between them sees the queue already empty and the
// moment not yet written, and slips past "four an hour" (review panel
// 2026-09-14). So both verdicts start by taking the same `identity_stats` row
// `FOR UPDATE` that a send takes, and finish in the same transaction.
//
// **The first tier of §8.3 reads here, and a person reads the rest.** The
// tier is rules — links, contacts, a phrase the author already has up — and
// nothing else: no dictionary lives in this node, and none is made up here. A
// phrase the rules find nothing in goes out in the same transaction that
// wrote it (routes/feed.ts, `publishLocked`); one they flag waits for the
// queue, where a person decides as before. The model of §8.14 — translate,
// then classify — is chosen and not wired; when it is, it takes the flagged
// half, not the clean one. What runs unattended besides the rules is the
// sweeper below, which deletes a row that waited past `moderation.queue.wait`
// rather than letting it through unread: a flagged phrase nobody read does not
// become visible by default (§8.3, fail-closed).
//
// `FEED_VERDICT=queue` turns the rules off: every phrase waits for a person,
// which is the shape a tenant with a live moderator may want, and the shape
// this node had until P1 (2026-09-26).

import { queryOrThrow, transaction } from "./db.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";
import { frameSessions } from "./sessions.ts";
import { LIVE_PHRASE } from "./feed_limits.ts";
import { settleOfferLikes } from "./offer_match.ts";

// Exists at zero from the start: an alert reads it, and a series born at 1
// hides its first event from rate() (B42, 2026-09-26; alerts.yml).
for (const verdict of ["published", "expired_unread"]) inc("relay_feed_verdict_total", { verdict }, 0);
for (const result of ["published", "queued"]) inc("relay_feed_rules_total", { result }, 0);

// ---- the first tier: rules (§8.3) -------------------------------------------
//
// What a rule can see, and only that: a link, a way to be contacted outside the
// node, and a phrase the author already has up. There is no word list here
// because the node has none, and a list written for this file would be a
// guess dressed as moderation. A phrase the rules flag is not refused — it
// waits for a person, as every phrase did before — so a rule may err towards
// the queue: the cost of a false flag is minutes of waiting, the cost of a
// false refusal is a moment in rejected_at_recent and, after five, a pause
// (§8.3, "the threshold must slow down the search for a wording, not punish";
// quorum of three, 2026-09-26).
//
// The regexes are linear on purpose: no nested quantifiers, no backtracking
// across the whole text (B106, a raw Origin of 60 KB stalled the node). The
// text is 128 graphemes anyway (routes/feed.ts), and a name is 24.

export type RuleReason = "link" | "contact" | "repeat" | "offer" | "name";

// How a rule reads the text: NFKC so that fullwidth and mathematical letters
// become the letters they look like, format characters gone so that a
// zero-width space does not split "t.me", lower case, one space between words.
// The stored phrase is not touched — this is the reader's copy.
function readable(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

// Spelled-out punctuation of the kind people use to slip past a filter:
// "site точка ru", "name (at) mail (dot) com". English "at" and "dot" as bare
// words are not touched — "meet at the bridge" is a phrase, not an address.
// Measured 2026-09-27 (docs/measurements/feed-rules-2026-09-27): "[.]" and
// "(.)" passed as a bare dot in brackets; they are spelled-out punctuation too.
const SPELLED_DOT = /\s*(?:\(dot\)|\[dot\]|\(точка\)|\[точка\]|\[\.\]|\(\.\)| точка )\s*/gu;
const SPELLED_AT = /\s*(?:\(at\)|\[at\]|\(собака\)|\[собака\]| собака )\s*/gu;
function unspelled(text: string): string {
  return text.replace(SPELLED_DOT, ".").replace(SPELLED_AT, "@");
}

// A link: a scheme, a www., or a bare host with a Latin top-level label of two
// letters or more. The last one flags "Mr.Smith" too; that is a phrase for a
// person to read, not a refusal.
// The top-level label is Latin, or one of the Cyrillic ones a neighbour's
// site ends in — .рф, .ру, .укр, .бел, .срб — which passed the measurement of
// 2026-09-27 ("сайт пример.рф"). A closed list, not \p{L}: "конец.Начало" is a
// typo, not a host. One label character before the dot is enough to call it a
// host: the earlier form walked the whole label chain and backtracked over it
// — 7 s on 100 KB of "a.a.a." (measured 2026-09-27, the same shape as B106).
const LINK = /(?:https?:\/\/|www\.)\S|[\p{L}\p{N}-]\.(?:[a-z]{2,24}|рф|ру|укр|бел|срб)(?=$|[^\p{L}\p{N}])/u;
// A contact: an address, a handle, a messenger by name, or a telephone — seven
// digits or more with the separators people put between them. A date has
// eight digits and is flagged too; it waits for a person, which is the side
// the rules err to.
const EMAIL = /[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,24}/u;
const HANDLE = /(?:^|\s)@[\p{L}\p{N}_]{3,32}/u;
// "тг" in Cyrillic is the messenger as people write it ("пиши в тг"); it passed
// the measurement of 2026-09-27. Bounded like the Latin names, so "тгк" or a
// word carrying the two letters is not flagged.
const MESSENGER = /(?:^|[^\p{L}])(?:telegram|tg|whatsapp|viber|wechat|snapchat|тг)(?=$|[^\p{L}])|телег|вотсап|ватсап|вайбер|снапчат/u;
const PHONE = /(?:\+|\b)\d[\d\s().-]{5,24}\d/u;
const digitsIn = (s: string): number => (s.match(/\d/g) ?? []).length;

// The reasons the rules find in a phrase's text — empty means clean.
export function readText(text: string): RuleReason[] {
  const seen = unspelled(readable(text));
  const reasons: RuleReason[] = [];
  if (LINK.test(seen)) reasons.push("link");
  if (EMAIL.test(seen) || HANDLE.test(seen) || MESSENGER.test(seen)) reasons.push("contact");
  else {
    const phone = seen.match(PHONE);
    if (phone && digitsIn(phone[0]) >= 7) reasons.push("contact");
  }
  return reasons;
}

// The verdict mode of this node. `rules`, the default: the tier of §8.3 that
// costs nothing reads every phrase, and the queue takes what it flags — a feed
// with no moderator wired publishes nothing otherwise, which is the state the
// alert FeedPublishesNothing calls expected. `queue`: every phrase waits for a
// person — the shape this node had before, and the one a tenant with a live
// moderator may want. Any other value is `queue`: a misspelt variable closes,
// it does not open (§8.3). The default was the coordinator's call for P1
// (2026-09-26); the quorum of three had voted two to one for `queue`, so that
// a feed publishing on its own would be switched on per environment — noted
// in decisions, not followed.
export function verdictMode(): "rules" | "queue" {
  const raw = (Deno.env.get("FEED_VERDICT") ?? "rules").trim().toLowerCase();
  return raw === "rules" ? "rules" : "queue";
}

// Everything the rules can say about a phrase that has just been written, read
// under the caller's transaction: the text, the offer, the name that would go
// out with it, and whether the author already has this phrase up.
//
// - An offer — a phrase with a discount or conditions — waits for a person
//   whole: it may carry neither a link nor a promo code (§8.3, offers §2), and a
//   promo code is not a shape a rule can tell from a word.
// - The name goes out with the phrase under one verdict (§8.2, 2026-09-22), so
//   a waiting name is read by the same rules; a refused name is the queue's
//   business as before.
// - The same phrase again, while the first is still up, is a person's to read:
//   not a refusal, because a refusal costs a moment towards the pause of §8.3
//   and a neighbour who wrote the same line twice, changing a price, is not
//   who the pause is for (quorum, 2026-09-26).
export async function reasonsFor(
  run: Run,
  phrase: { id: string; identityId: string; text: string; offer: boolean },
): Promise<RuleReason[]> {
  const reasons = readText(phrase.text);
  if (phrase.offer) reasons.push("offer");
  const [who] = await run<{ name_pending: string | null; name_state: string }>(
    `SELECT name_pending, name_state FROM identities WHERE id = $1`,
    [phrase.identityId],
  );
  if (who?.name_state === "rejected" || (who?.name_pending && readText(who.name_pending).length > 0)) {
    reasons.push("name");
  }
  // Compared the way the rules read: NFC in the database (there is no NFKC
  // there), case folded, spaces collapsed — and the parameter folded the same.
  const same = await run<{ id: string }>(
    `SELECT id FROM feed_messages
      WHERE author_identity = $1 AND id <> $2 AND ${LIVE_PHRASE}
        AND lower(regexp_replace(normalize(text, NFC), '\s+', ' ', 'g')) = $3
      LIMIT 1`,
    [phrase.identityId, phrase.id, phrase.text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim()],
  );
  if (same.length > 0) reasons.push("repeat");
  return reasons;
}

// docs/facts/limits.tsv, by name.
export const PHRASE_SPAN = "4 hours 20 minutes"; // feed.phrase.span
export const QUEUE_WAIT_MINUTES = 10; // moderation.queue.wait
// The arrays are cut to their last moments on write; the lengths are §8.3's.
const KEEP_PUBLISHED = 4;
const KEEP_REFUSED = 6;

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// Appends `now()` to one of the moment arrays, dropping what has fallen out of
// the hour and keeping only the last few.
//
// The trimming lives in the expression rather than in a CHECK on purpose: a
// constraint would make the verdict write fail, and a verdict that cannot be
// written is worse than an array one element too long (§8.3).
async function rememberMoment(
  run: Run,
  identityId: string,
  column: "published_at_recent" | "rejected_at_recent",
  keep: number,
): Promise<void> {
  await run(
    `UPDATE identity_stats
        SET ${column} = (
              SELECT (x)[greatest(1, cardinality(x) - ${keep - 1}):]
                FROM (
                  SELECT ARRAY(
                    SELECT t FROM unnest(${column}) t
                     WHERE t > now() - interval '1 hour' ORDER BY t
                  ) || now() AS x
                ) s
            ),
            updated_at = now()
      WHERE identity = $1`,
    [identityId],
  );
}

export interface Verdict {
  applied: boolean;
  identityId: string | null;
  // The name is no longer the one the moderator saw; nothing was written.
  nameChanged?: boolean;
  // The name stands refused; the phrase waits for a new one.
  nameRejected?: boolean;
  // This verdict turned a waiting name into the name: the likes this identity
  // left on offers while it waited become their matches once the verdict is
  // committed (settleOfferLikes; §8.5 S7). publishPhrase() does it; a caller
  // that runs publishLocked() inside its own transaction does it after commit.
  nameAccepted?: boolean;
  // When applied: the term the phrase got, as the row now holds it.
  visibleAt?: Date;
  expiresAt?: Date;
}

// Passed. The row becomes visible and gets its term in the same UPDATE — they
// were a single NOT NULL column derived from each other once, which cannot both
// be true at insert time (§8.3, and db/025 for the experiment).
// `scope` is what the caller may decide: a brand for a tenant's moderator,
// null for the platform. It is checked inside the transaction, on the locked
// row, as the DSA verdict does — a fence checked before the lock is a fence
// checked against a row that may have changed (security lens, 2026-09-22).
//
// `nameSeen` is the name the moderator read beside the phrase. The verdict
// accepts the name only if it is still that string: a name changed between
// the read and the click would otherwise be accepted unread (same lens).
export interface VerdictScope {
  brand?: string | null;
  nameSeen?: string;
}

// The waiting phrase and its author's counters, locked in the order every
// other writer of those counters takes them — identity_stats first, then the
// rows (likes.ts, profile.ts, away.ts). The verdict used to take the phrase's
// row first, and a step away at the same moment then deadlocked with it: one
// side answered 503 (review panel of the step away, 23.09.2026, data lens).
// The author is read unlocked, then locked, then the row is taken and checked
// again: a verdict that raced another one finds nothing waiting any more.
async function lockWaiting(
  run: Run,
  id: string,
  scope: VerdictScope,
): Promise<{ author_identity: string | null } | undefined> {
  const [peek] = await run<{ author_identity: string | null }>(
    `SELECT author_identity FROM feed_messages
      WHERE id = $1 AND visible_at IS NULL AND ($2::text IS NULL OR brand = $2)`,
    [id, scope.brand ?? null],
  );
  if (!peek) return undefined;
  if (peek.author_identity) {
    await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [peek.author_identity]);
  }
  const [row] = await run<{ author_identity: string | null }>(
    `SELECT author_identity FROM feed_messages
      WHERE id = $1 AND visible_at IS NULL AND ($2::text IS NULL OR brand = $2)
      FOR UPDATE`,
    [id, scope.brand ?? null],
  );
  return row;
}

export async function publishPhrase(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  const verdict = await transaction<Verdict>((run) => publishLocked(run, id, scope));
  await settleAfterVerdict(verdict);
  return verdict;
}

// After the verdict's commit: a name that just passed makes the matches of the
// likes it left on offers while it waited (§8.5 S7, lib/offer_match.ts). Its
// own transactions under the like's locks, so it runs after the verdict's and
// never inside it — the identity row is held there, and the name is not yet
// visible to another transaction. A caller of publishLocked() calls this once
// its own transaction has committed.
export async function settleAfterVerdict(verdict: Verdict): Promise<void> {
  if (!verdict.nameAccepted || !verdict.identityId) return;
  try {
    const made = await settleOfferLikes(transaction, verdict.identityId);
    if (made.length > 0) inc("relay_like_total", { result: "matched" }, made.length);
  } catch (error) {
    // The name stands; the likes stay likes and a later verdict or like of
    // the pair makes the match. Named in the log, not hidden.
    log("error", "offer likes were not settled after a name verdict", { error: String(error) });
  }
}

// The passing verdict inside a caller's transaction. POST /feed calls it right
// after its INSERT when the rules found nothing (routes/feed.ts): the counters
// row it holds is the one lockWaiting takes again, in the same order, so the
// publication and the moment land in the transaction that wrote the phrase —
// a send arriving between them would otherwise see the queue empty and the
// moment unwritten (§8.3, review panel 2026-09-14).
// `by` names who read the phrase. The verdict counter stays the queue's: it
// feeds the alert that says "a queue with nobody deciding" (alerts.yml,
// FeedPublishesNothing), and a publication the rules made would silence it
// on the day the human queue stops (quorum, 2026-09-26).
export async function publishLocked(
  run: Run,
  id: string,
  scope: VerdictScope = {},
  by: "queue" | "rules" = "queue",
): Promise<Verdict> {
  {
    let nameAccepted = false;
    const row = await lockWaiting(run, id, scope);
    // Already decided, already swept, or never existed: a verdict arriving
    // twice must not publish twice or write a second moment.
    if (!row) return { applied: false, identityId: null };
    if (row.author_identity) {
      // The identity row too: the name is read and written under this lock.
      const [who] = await run<{ name: string; name_pending: string | null; name_state: string }>(
        `SELECT name, name_pending, name_state FROM identities WHERE id = $1 FOR UPDATE`,
        [row.author_identity],
      );
      const goesOut = who?.name_pending ?? who?.name;
      if (scope.nameSeen !== undefined && who && goesOut !== scope.nameSeen) {
        return { applied: false, identityId: row.author_identity, nameChanged: true };
      }
      // Both must be accepted (§8.2, 2026-08-26): a phrase whose name was
      // refused waits for a new name, and does not go out with the old one.
      if (who?.name_state === "rejected") {
        return { applied: false, identityId: row.author_identity, nameRejected: true };
      }
    }
    const [term] = await run<{ visible_at: Date; expires_at: Date }>(
      `UPDATE feed_messages
          SET visible_at = now(), expires_at = now() + interval '${PHRASE_SPAN}'
        WHERE id = $1 AND visible_at IS NULL
        RETURNING visible_at, expires_at`,
      [id],
    );
    if (row.author_identity) {
      // The name goes out with the phrase, so the same verdict covers both
      // (§8.2: the name passes the queue at first publication and at every
      // change; owner's decision of 2026-09-22 — one Publish, not two). A name
      // waiting in name_pending becomes the name; a rejected one is accepted
      // again, since the moderator has just read it beside the phrase.
      // Only a name that was waiting: a rejected one has no name_pending and
      // would come back as it was, which is not what "accepted" means.
      const named = await run<{ id: string }>(
        `UPDATE identities
            SET name = name_pending, name_pending = NULL, name_state = 'accepted'
          WHERE id = $1 AND name_state = 'pending' RETURNING id`,
        [row.author_identity],
      );
      if (named.length > 0) {
        nameAccepted = true;
        await frameSessions(run, row.author_identity, "name_verdict", { accepted: true });
      }
      await rememberMoment(run, row.author_identity, "published_at_recent", KEEP_PUBLISHED);
      // The first accepted publication, as a UTC date. It serves one rule only
      // — "the reporter has been publishing for a while" (offers spec §10.1) —
      // and is written once, which is what the IS NULL is for.
      await run(
        `UPDATE identity_stats
            SET first_published_at = (now() AT TIME ZONE 'UTC')::date
          WHERE identity = $1 AND first_published_at IS NULL`,
        [row.author_identity],
      );
    }
    if (by === "queue") inc("relay_feed_verdict_total", { verdict: "published" });
    return {
      applied: true, identityId: row.author_identity, visibleAt: term?.visible_at, expiresAt: term?.expires_at,
      ...(nameAccepted ? { nameAccepted: true } : {}),
    };
  }
}

// Refused. The row is deleted rather than marked: a refused phrase is not a
// phrase with a flag, and leaving it would hold the author's single waiting
// slot for ever. The moment is what the refusal leaves behind, and it is what
// the pause of §8.3 counts.
export async function refusePhrase(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  return await transaction<Verdict>(async (run) => {
    const row = await lockWaiting(run, id, scope);
    if (!row) return { applied: false, identityId: null };
    await run(`DELETE FROM feed_messages WHERE id = $1 AND visible_at IS NULL`, [id]);
    if (row.author_identity) {
      await rememberMoment(run, row.author_identity, "rejected_at_recent", KEEP_REFUSED);
    }
    inc("relay_feed_verdict_total", { verdict: "refused" });
    return { applied: true, identityId: row.author_identity };
  });
}

// The name is refused, not the phrase (§8.2): name_state becomes rejected, a
// pending name is dropped, and the phrase stays in the queue — it waits for a
// new name and goes out with it (2026-08-26). Nothing is deleted and no moment
// is written: the pause of §8.3 counts refused phrases, and this is not one.
// The queue shows the phrase with "name rejected" until the author sends
// another name, which makes it pending again. Applies once: a name already
// rejected, or not the one the moderator saw, answers as not applied.
export async function refuseName(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  return await transaction<Verdict>(async (run) => {
    const row = await lockWaiting(run, id, scope);
    if (!row || !row.author_identity) return { applied: false, identityId: null };
    const [who] = await run<{ name: string; name_pending: string | null; name_state: string }>(
      `SELECT name, name_pending, name_state FROM identities WHERE id = $1 FOR UPDATE`,
      [row.author_identity],
    );
    if (!who || who.name_state === "rejected") return { applied: false, identityId: row.author_identity };
    const goesOut = who.name_pending ?? who.name;
    if (scope.nameSeen !== undefined && goesOut !== scope.nameSeen) {
      return { applied: false, identityId: row.author_identity, nameChanged: true };
    }
    await run(
      `UPDATE identities SET name_state = 'rejected', name_pending = NULL WHERE id = $1`,
      [row.author_identity],
    );
    // No reason: the verdict carries none for a name today, and the frame
    // does not make one up.
    await frameSessions(run, row.author_identity, "name_verdict", { accepted: false });
    inc("relay_feed_verdict_total", { verdict: "name_refused" });
    return { applied: true, identityId: row.author_identity };
  });
}

// A phrase that waited past `moderation.queue.wait` is deleted, and **no moment
// is written** — neither a publication nor a refusal happened. §8.3 says it in
// one line: "a row whose checking wait expired is deleted and not counted as
// queued". Which means the author's slot frees and their pause does not grow
// because the node was slow.
//
// This is the only part of the verdict that runs unattended, and that is the
// honest shape while there is no moderator: a phrase nobody read does not
// become visible by default, it goes away, and the number below says how often
// that happens.
export async function sweepStaleQueue(): Promise<number> {
  const rows = await queryOrThrow<{ count: string }>(
    `WITH gone AS (
       DELETE FROM feed_messages f
        WHERE f.visible_at IS NULL
          AND f.created_at < now() - interval '${QUEUE_WAIT_MINUTES} minutes'
          -- A phrase whose name was refused is not waiting on the node; it is
          -- waiting on its author, and stays until a new name comes (§8.2).
          AND NOT EXISTS (SELECT 1 FROM identities a
                           WHERE a.id = f.author_identity AND a.name_state = 'rejected')
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );
  const swept = Number(rows[0]?.count ?? 0);
  if (swept > 0) {
    // Worth a line every time, not only when it is large: while no moderator is
    // wired this number is the whole rate of the feed, and somebody reading the
    // logs should see that phrases are being dropped rather than published.
    log("warn", "phrases dropped after waiting for a verdict", {
      swept,
      waited_minutes: QUEUE_WAIT_MINUTES,
    });
    inc("relay_feed_verdict_total", { verdict: "expired_unread" }, swept);
  }
  return swept;
}

// Phrases whose term ran out. They stop being delivered the moment
// `expires_at` passes — the feed's query says so — but the row has to go too,
// and §8.10 says what "gone" means: the text is deleted, the likes follow by
// cascade, and what survives is a copy in other tables rather than the phrase.
//
// A separate sweeper from the queue's: that one is about a verdict that never
// came, this one about a life that ended. They have different periods and
// different meanings, and one job doing both would report one number for two
// unrelated facts.
//
// In batches, as the other sweepers are (lib/identity_sweeper.ts, BATCH): the
// first pass after a stop meets the whole backlog, and one DELETE over it held
// a lock per row, and the likes' cascade behind each, until the last one went
// (open.tsv, loop plan A11, 2026-09-24). A pass ends at its ceiling; the rest
// waits a minute.
const EXPIRED_BATCH = 2000;
const EXPIRED_MAX_BATCHES = 50;

export async function sweepExpiredPhrases(
  options: { batch?: number; maxBatches?: number } = {},
): Promise<number> {
  // Interpolated into the statement, so made a positive whole number first,
  // whatever a caller hands in (panel 2026-09-24, security lens).
  const batch = Math.max(1, Math.floor(Number(options.batch ?? EXPIRED_BATCH)) || EXPIRED_BATCH);
  const maxBatches = Math.max(1, Math.floor(Number(options.maxBatches ?? EXPIRED_MAX_BATCHES)) || EXPIRED_MAX_BATCHES);
  let swept = 0;
  for (let round = 0; round < maxBatches; round++) {
    // SKIP LOCKED: a phrase that expired between a take-down's now() and this
    // one's is held by that take-down, which goes on to delete one's own
    // phrases — a phrase this batch may hold. Waited on, the two met the other
    // way round (review panel 3, D1); skipped, it waits for the next minute.
    const rows = await queryOrThrow<{ count: string }>(
      `WITH gone AS (
         DELETE FROM feed_messages
          WHERE id IN (SELECT id FROM feed_messages
                        WHERE visible_at IS NOT NULL AND expires_at <= now()
                        LIMIT ${batch}
                        FOR UPDATE SKIP LOCKED)
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM gone`,
    );
    const took = Number(rows[0]?.count ?? 0);
    swept += took;
    // Counted per batch: each batch commits on its own, and a later one that
    // throws must not take the count of those already gone with it (D4).
    if (took > 0) inc("relay_feed_verdict_total", { verdict: "expired" }, took);
    if (took < batch) break;
  }
  return swept;
}
