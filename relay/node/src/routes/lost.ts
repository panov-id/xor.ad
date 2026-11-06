// A lost notice beyond the feed card (owner, 30.10.2026; db/089, db/090;
// docs/newdesign4/LOST_SPOTS §2, §4, §5): the marks "I saw it", the public
// page a flyer's QR opens, and the complaint that takes a lost down by count.
//
//   POST /feed/:id/seen      a signed-in neighbour: where (words) and when (a
//                            step) — no coordinates, the product never asks a
//                            device for its location. The line is judged as a
//                            phrase is (moderator kind seen_note).
//   GET  /feed/:id/seen      the lost's author reads every mark whole; anybody
//                            else sees only that marks exist, how old each is
//                            and whether it has dimmed — never where, never who.
//   GET  /l/:id              public, no key, rate limited as /o/:code: live,
//                            found ("Found, thank you") or gone. No author data.
//   POST /feed/:id/complaints a signed-in neighbour says "take it down"; three
//                            counting complaints from different people end
//                            the lost at once, as an offer's do (db/071).
//   POST /l/:id/seen         the same mark from somebody not signed in (owner,
//                            02.11.2026; §5 path 3; db/091): the public page's
//                            "I saw it". Judged as a signed mark is; told
//                            apart by a daily hash (anonKey below), never by
//                            an address kept anywhere.
//
// A stranger's probe must not tell a real id from an unknown one: every miss
// on the signed routes answers "no such phrase", as /extend and the take-down
// do (routes/feed.ts). The public page has no such refusal to hide behind —
// it is the page the flyer names — so it answers "gone" for an unknown id,
// an expired one and a phrase alike: one state, nothing to learn from it.
//
// The anonymous mark and the privacy policy (§6): the storefronts' policy says
// "We do not fingerprint your browser", and this path is its one named
// exception — the hash below is a daily, salted digest of the address (by /64
// for IPv6), the User-Agent and the Accept-Language, drawn to count marks and
// refusals for a day, and nothing of it is kept raw or past the day. Canvas,
// fonts, GPU: not taken. The policy's text names it (sosed.place and
// neighbro.place, landing/legal/privacy_EN.md §3).

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { check, checkAll, LOST_ANON_ADDRESS_LIMITS, LOST_ANON_REFUSALS, LOST_COMPLAINT_LIMITS, LOST_PAGE_LIMITS, LOST_SEEN_LIMITS } from "../lib/rate_limit.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { foldLines, hasInvisible } from "../lib/names.ts";
import { LIVE_LOST, LIVE_PHRASE, LOST_SLOT, TAKEDOWN_COMPLAINTS } from "../lib/feed_limits.ts";
import { judge } from "../lib/moderator.ts";
import { readText } from "../lib/feed_verdict.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";
import { sha256hex } from "../lib/hash.ts";
import { log } from "../lib/log.ts";

// When it was seen: four steps and nothing between them (LOST_SPOTS §5). A
// minute would be a measurement of a neighbour's day; a step is enough to look.
export const WHEN_STEPS = ["now", "15m", "1h", "earlier"] as const;
export type WhenStep = typeof WHEN_STEPS[number];
// Where, in words: 140 graphemes on the node, the DDL's 1024 bytes beneath.
export const WHERE_MAX_GRAPHEMES = 140;
export const WHERE_MAX_BYTES = 1024;
// A mark dims after three days (LOST_SPOTS §2): still there, no longer fresh.
export const DIM_AFTER_DAYS = 3;
// One person marks one lost a few times at most (saw it twice, in two places),
// not a page of times: the author's list is the thing being protected.
export const MARKS_PER_PERSON = 3;
// Three counting complaints from different people end a lost (owner, 30.10:
// "by count, as offers"; routes/offer_complaints.ts AUTOHIDE_COMPLAINTS).
export { TAKEDOWN_COMPLAINTS };
export const COMPLAINT_MONTHLY_LIMIT = 5;

const ID = /^[0-9a-fA-F-]{36}$/;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const countGraphemes = (text: string): number => [...graphemes.segment(text)].length;
const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const seconds = (at: Date) => Math.floor(at.getTime() / 1000);

// Dim is a function of age, computed here and nowhere else, so the read and
// its test agree on the day.
export function isDim(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > DIM_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

for (const result of ["seen_marked", "seen_refused", "seen_missed", "seen_read", "page", "complaint", "taken_down", "anon_marked", "anon_refused", "anon_missed", "anon_blocked"]) {
  inc("relay_lost_total", { result }, 0);
}

// The body of a mark, signed or not: where in words, when one of the steps.
// One reader for both paths, so the anonymous one cannot drift looser.
async function readMark(req: Request): Promise<Response | { where: string; when: WhenStep }> {
  const body = await readJson<{ where?: unknown; when?: unknown }>(req);
  if (!body || typeof body.where !== "string") return refuse("invalid_body", "where is needed, in words", 400);
  const where = foldLines(body.where).trim();
  if (where.length === 0) return refuse("invalid_body", "where is needed, in words", 400);
  if (countGraphemes(where) > WHERE_MAX_GRAPHEMES || new TextEncoder().encode(where).length > WHERE_MAX_BYTES) {
    return refuse("invalid_body", `where is ${WHERE_MAX_GRAPHEMES} characters at most`, 400);
  }
  if (hasInvisible(where)) return refuse("invalid_body", "where has characters nobody can see", 400);
  if (typeof body.when !== "string" || !WHEN_STEPS.includes(body.when as WhenStep)) {
    return refuse("invalid_body", `when must be one of ${WHEN_STEPS.join(", ")}`, 400);
  }
  return { where, when: body.when as WhenStep };
}

// ── POST /feed/:id/seen ──────────────────────────────────────────────────────

async function mark(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!ID.test(id)) return refuse("not_found", "no such phrase", 404);
  const limited = checkAll(LOST_SEEN_LIMITS, caller.identityId);
  if (!limited.allowed) {
    return refuse("rate_limited", "too many marks this hour", 429, {}, {
      "retry-after": String(limited.retryAfterSeconds),
    });
  }
  const read = await readMark(req);
  if (read instanceof Response) return read;
  const { where, when } = read;

  // The lost first, before the model is asked: a probe with random ids must
  // not spend the moderator's time, and the answer for a miss is the same one
  // the write below gives — a live lost of somebody else's, or nothing.
  const target = await query<{ mine: boolean; marks: number }>(
    `SELECT author_identity = $2 AS mine,
            (SELECT count(*)::int FROM lost_seen_marks WHERE lost_id = $1 AND author_identity = $2) AS marks
       FROM feed_messages WHERE id = $1 AND ${LIVE_LOST}
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_identity = $2 AND b.blocked_identity = author_identity) OR (b.blocker_identity = author_identity AND b.blocked_identity = $2))`,
    [id, caller.identityId],
  );
  if (target === null) return refuse("unavailable", "the node cannot read right now", 503);
  if (!target[0]) {
    inc("relay_lost_total", { result: "seen_missed" });
    return refuse("not_found", "no such phrase", 404);
  }
  // One's own: no probe to hide from, and nothing to say to oneself.
  if (target[0].mine) return refuse("refused", "this is your own notice", 409);
  if (target[0].marks >= MARKS_PER_PERSON) {
    return refuse("refused", `${MARKS_PER_PERSON} marks on one notice at most`, 409, { marks: target[0].marks });
  }

  // The verdict (lib/moderator.ts): the model's when it is on, the rules'
  // when not; a note that fails is refused with the reason, never kept. The
  // rules read the note as they read a phrase (a link, a phone, a handle):
  // without their flags a model-less node kept "call +357 99 123456" (seen
  // red in lost.test.ts, 02.11.2026).
  const judgement = await judge({ kind: "seen_note", text: where, flags: readText(where) });
  if (!judgement.publish) {
    inc("relay_lost_total", { result: "seen_refused" });
    return refuse("refused", judgement.reason, 422);
  }

  const markId = crypto.randomUUID();
  // Every condition in the INSERT itself: the lost may have been found, or
  // taken down, while the model was reading.
  const written = await query<{ created_at: Date }>(
    `INSERT INTO lost_seen_marks (id, lost_id, author_identity, where_text, when_step)
       SELECT $1, f.id, $3, $4, $5 FROM feed_messages f
        WHERE f.id = $2 AND f.author_identity <> $3 AND ${LIVE_LOST}
          AND (SELECT count(*) FROM lost_seen_marks WHERE lost_id = $2 AND author_identity = $3) < ${MARKS_PER_PERSON}
       RETURNING created_at`,
    [markId, id, caller.identityId, where, when],
  );
  if (written === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (!written[0]) {
    inc("relay_lost_total", { result: "seen_missed" });
    return refuse("not_found", "no such phrase", 404);
  }
  inc("relay_lost_total", { result: "seen_marked" });
  return json({ id: markId, lost_id: id, when, created_at: seconds(written[0].created_at) }, 200, sunsetHeader());
}

// ── GET /feed/:id/seen ───────────────────────────────────────────────────────

type MarkRow = { id: string; where_text: string; when_step: WhenStep; created_at: Date };

async function marks(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!ID.test(id)) return refuse("not_found", "no such phrase", 404);
  // A live lost, or the found it became: the author still reads the marks on
  // the day the found stays in the feed (LOST_SLOT).
  const heads = await query<{ mine: boolean; kind: string }>(
    `SELECT author_identity = $2 AS mine, kind FROM feed_messages WHERE id = $1 AND ${LOST_SLOT}`,
    [id, caller.identityId],
  );
  if (heads === null) return refuse("unavailable", "the node cannot read right now", 503);
  if (!heads[0]) {
    inc("relay_lost_total", { result: "seen_missed" });
    return refuse("not_found", "no such phrase", 404);
  }
  const { mine, kind } = heads[0];
  const rows = await query<MarkRow>(
    `SELECT id, where_text, when_step, created_at FROM lost_seen_marks WHERE lost_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  if (rows === null) return refuse("unavailable", "the node cannot read right now", 503);
  const now = new Date();
  inc("relay_lost_total", { result: "seen_read" });
  return json({
    id,
    kind,
    mine,
    // The author's list is the whole mark; a neighbour's is a dot with an age:
    // that somebody saw it, when, and whether that has gone stale. No where,
    // no who, on either side — the feed never names an author, nor does this.
    items: rows.map((row) =>
      mine
        ? { id: row.id, where: row.where_text, when: row.when_step, created_at: seconds(row.created_at), dim: isDim(row.created_at, now) }
        : { id: row.id, when: row.when_step, created_at: seconds(row.created_at), dim: isDim(row.created_at, now) }
    ),
  }, 200, sunsetHeader());
}

// ── GET /l/:id ───────────────────────────────────────────────────────────────

function pageLimited(req: Request): Response | null {
  // The address alone (routes/offer_links.ts): the route takes no key.
  const verdict = checkAll(LOST_PAGE_LIMITS, `${clientAddress(req).ip}|lost-page`);
  if (verdict.allowed) return null;
  return json({ error: "rate_limited", retry_after: verdict.retryAfterSeconds }, 429,
    { "retry-after": String(verdict.retryAfterSeconds), ...NO_STORE });
}

type PageRow = { kind: string; text: string; expires_at: Date; marks: number };

async function page(req: Request, id: string): Promise<Response> {
  const tooMany = pageLimited(req);
  if (tooMany) return tooMany;
  if (!ID.test(id)) return refuse("not_found", "no such page", 404, {}, NO_STORE);
  // Only a live lost or found has a page; a phrase, an expired row and an
  // unknown id are one answer below. The text is what the flyer prints and
  // the feed shows to every neighbour; nothing of the author goes out.
  const rows = await query<PageRow>(
    `SELECT kind, text, expires_at,
            (SELECT count(*)::int FROM lost_seen_marks m WHERE m.lost_id = f.id) AS marks
       FROM feed_messages f WHERE id = $1 AND ${LIVE_PHRASE} AND kind IN ('lost', 'found')`,
    [id],
  );
  if (rows === null) return refuse("unavailable", "the node cannot read right now", 503, {}, NO_STORE);
  inc("relay_lost_total", { result: "page" });
  const row = rows[0];
  if (!row) return json({ id, state: "gone" }, 200, NO_STORE);
  if (row.kind === "found") return json({ id, state: "found" }, 200, NO_STORE);
  return json({ id, state: "live", text: row.text, expires_at: seconds(row.expires_at), marks: row.marks }, 200, NO_STORE);
}

// ── POST /feed/:id/complaints ────────────────────────────────────────────────

// Counted as an offer's complaint is (routes/offer_complaints.ts): it counts
// when the complainant's first accepted phrase came out on a UTC day no later
// than the day before yesterday and before the lost's day, when this person
// has not complained about this lost before, and when the month's counting
// complaints are under the limit. The answer is 202 whatever happened — an
// unknown id, a phrase, one's own lost, the third complaint — so a complainant
// learns neither whether the id is real nor whether theirs was the one.
async function complain(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!ID.test(id)) return refuse("not_found", "no such phrase", 404);
  const limited = checkAll(LOST_COMPLAINT_LIMITS, caller.identityId);
  if (!limited.allowed) {
    return refuse("rate_limited", "too many complaints this hour", 429, {}, {
      "retry-after": String(limited.retryAfterSeconds),
    });
  }
  const outcome = await transaction<"none" | "kept" | "taken_down">(async (run) => {
    // The lock first: two complaints at once must not both miss the third.
    const [lost] = await run<{ id: string; visible_at: Date }>(
      `SELECT id, visible_at FROM feed_messages WHERE id = $1 AND author_identity <> $2 AND ${LIVE_LOST}
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_identity = $2 AND b.blocked_identity = author_identity) OR (b.blocker_identity = author_identity AND b.blocked_identity = $2)) FOR UPDATE`,
      [id, caller.identityId],
    );
    if (!lost) return "none";
    const [made] = await run<{ counts: boolean }>(
      `INSERT INTO lost_complaints (lost_id, user_id, counts)
         SELECT $1, $2, coalesce(
           (SELECT first_published_at <= (now() AT TIME ZONE 'UTC')::date - 2
                   AND first_published_at < ($3::timestamptz AT TIME ZONE 'UTC')::date
              FROM identity_stats WHERE identity = $2), false)
           AND (SELECT count(*) FROM lost_complaints
                 WHERE user_id = $2 AND counts
                   AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < $4
       ON CONFLICT DO NOTHING RETURNING counts`,
      [lost.id, caller.identityId, lost.visible_at, COMPLAINT_MONTHLY_LIMIT],
    );
    if (!made?.counts) return "kept";
    const [{ n }] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM lost_complaints WHERE lost_id = $1 AND counts`, [lost.id],
    );
    if (n < TAKEDOWN_COMPLAINTS) return "kept";
    // Ended, not deleted: the row and its complaints stay as the record of
    // why, and the feed, /extend, /found and /l/ all read expires_at.
    await run(`UPDATE feed_messages SET expires_at = now() WHERE id = $1 AND ${LIVE_LOST}`, [lost.id]);
    return "taken_down";
  }).catch((error) => {
    log("error", "a lost complaint failed", { error: String(error) });
    return null;
  });
  if (outcome === null) return refuse("unavailable", "the node cannot write right now", 503);
  inc("relay_lost_total", { result: outcome === "taken_down" ? "taken_down" : "complaint" });
  return json({ state: "received" }, 202, sunsetHeader());
}

// ── POST /l/:id/seen — the mark from somebody not signed in ─────────────────

// The daily key of an anonymous visitor (LOST_SPOTS §5 path 3; owner,
// 02.11.2026): sha256 of the UTC day, a salt drawn for that day, the address
// (an IPv6 folded to its /64 — one household, one key), the User-Agent and
// the Accept-Language. The salt lives in this process's memory for the day
// and is dropped at the first call of the next; nothing can turn a stored key
// back into an address once it is gone, and the raw values are not written
// anywhere — not to the table (db/091), not to the log. The address is what
// lib/client_ip.ts already believes, no more: a header is trusted only behind
// the edge's token.
const salts = new Map<string, string>();
export function dailySalt(day: string): string {
  const held = salts.get(day);
  if (held) return held;
  salts.clear(); // yesterday's salt is not kept past the day
  const fresh = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  salts.set(day, fresh);
  return fresh;
}
export const utcDay = (now = new Date()): string => now.toISOString().slice(0, 10);

// An IPv6 by its /64, written canonically; an IPv4 (or an IPv4 mapped into
// IPv6) as it is. Anything unparsable is used whole: a wrong fold would merge
// strangers, an unfolded junk address merges nobody.
export function addressKey(ip: string): string {
  let text = ip.trim().replace(/^\[|\]$/g, "");
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (!text.includes(":")) return text;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(text);
  if (mapped) return mapped[1];
  const halves = text.split("::");
  if (halves.length > 2) return text;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return text;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return text;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":") + "::/64";
}

export async function anonKey(req: Request, now = new Date()): Promise<string> {
  const day = utcDay(now);
  const parts = [
    day,
    dailySalt(day),
    addressKey(clientAddress(req).ip),
    req.headers.get("user-agent") ?? "",
    req.headers.get("accept-language") ?? "",
  ];
  return await sha256hex(parts.join("\n"));
}

// Anonymous marks one notice takes in a day: changed headers make a new key, so a key's own ceiling cannot hold this.
const ANON_MARKS_PER_NOTICE = 100;

async function markAnonymous(req: Request, id: string): Promise<Response> {
  if (!ID.test(id)) return refuse("not_found", "no such page", 404, {}, NO_STORE);
  const crowded = checkAll(LOST_ANON_ADDRESS_LIMITS, `${addressKey(clientAddress(req).ip)}|lost-anon`);
  if (!crowded.allowed) {
    return refuse("rate_limited", "too many marks from this address", 429, {}, {
      "retry-after": String(crowded.retryAfterSeconds), ...NO_STORE,
    });
  }
  const key = await anonKey(req);
  // Three refusals today: the marks are closed for the day, the page is not
  // (pageLimited above counts the page by address, not by this key). Asked
  // without charging — a refusal is charged where it happens, below.
  const blocked = check(LOST_ANON_REFUSALS, key, Date.now(), false);
  if (!blocked.allowed) {
    inc("relay_lost_total", { result: "anon_blocked" });
    return refuse("rate_limited", "marks are closed for a day after three refusals", 429, {}, {
      "retry-after": String(blocked.retryAfterSeconds), ...NO_STORE,
    });
  }
  const limited = checkAll(LOST_SEEN_LIMITS, `anon|${key}`);
  if (!limited.allowed) {
    return refuse("rate_limited", "too many marks this hour", 429, {}, {
      "retry-after": String(limited.retryAfterSeconds), ...NO_STORE,
    });
  }
  const read = await readMark(req);
  if (read instanceof Response) return read;
  const { where, when } = read;

  // The lost first, as the signed path does: a probe must not spend the
  // model's time, and the answer for a miss is the page's "gone" in 404 form.
  const target = await query<{ marks: number; anon: number }>(
    `SELECT (SELECT count(*)::int FROM lost_seen_marks
              WHERE lost_id = $1 AND anon_hash = $2 AND created_at > now() - interval '24 hours') AS marks,
            (SELECT count(*)::int FROM lost_seen_marks
              WHERE lost_id = $1 AND anon_hash IS NOT NULL AND created_at > now() - interval '24 hours') AS anon
       FROM feed_messages WHERE id = $1 AND ${LIVE_LOST}`,
    [id, key],
  );
  if (target === null) return refuse("unavailable", "the node cannot read right now", 503, {}, NO_STORE);
  if (!target[0]) {
    inc("relay_lost_total", { result: "anon_missed" });
    return refuse("not_found", "no such page", 404, {}, NO_STORE);
  }
  // before the model: a flood on one notice costs no call
  if (target[0].anon >= ANON_MARKS_PER_NOTICE) {
    inc("relay_lost_total", { result: "anon_full" });
    return refuse("rate_limited", "this notice took enough anonymous marks today", 429, {}, { "retry-after": "3600", ...NO_STORE });
  }
  if (target[0].marks >= MARKS_PER_PERSON) {
    return refuse("refused", `${MARKS_PER_PERSON} marks on one notice at most`, 409, { marks: target[0].marks }, NO_STORE);
  }

  const judgement = await judge({ kind: "seen_note", text: where, flags: readText(where) });
  if (!judgement.publish) {
    // Charged here: the third one closes the marks for the day.
    check(LOST_ANON_REFUSALS, key);
    inc("relay_lost_total", { result: "anon_refused" });
    return refuse("refused", judgement.reason, 422, {}, NO_STORE);
  }

  // The day's life of a hash (db/091): yesterday's are cleared before today's
  // is written. Cheap — the partial index holds only rows with a hash.
  await query(`UPDATE lost_seen_marks SET anon_hash = NULL WHERE anon_hash IS NOT NULL AND created_at <= now() - interval '24 hours'`);

  const markId = crypto.randomUUID();
  // The ceiling in the INSERT itself, as the signed path has it: two marks at
  // once from one key cannot both be the third.
  const written = await query<{ created_at: Date }>(
    `INSERT INTO lost_seen_marks (id, lost_id, author_identity, anon_hash, where_text, when_step)
       SELECT $1, f.id, NULL, $3, $4, $5 FROM feed_messages f
        WHERE f.id = $2 AND ${LIVE_LOST}
          AND (SELECT count(*) FROM lost_seen_marks
                WHERE lost_id = $2 AND anon_hash = $3 AND created_at > now() - interval '24 hours') < ${MARKS_PER_PERSON}
       RETURNING created_at`,
    [markId, id, key, where, when],
  );
  if (written === null) return refuse("unavailable", "the node cannot write right now", 503, {}, NO_STORE);
  if (!written[0]) {
    inc("relay_lost_total", { result: "anon_missed" });
    return refuse("not_found", "no such page", 404, {}, NO_STORE);
  }
  inc("relay_lost_total", { result: "anon_marked" });
  return json({ id: markId, lost_id: id, when, created_at: seconds(written[0].created_at) }, 200, NO_STORE);
}

route("POST", "/feed/:id/seen", (c) => mark(c.req, c.params.id));
route("GET", "/feed/:id/seen", (c) => marks(c.req, c.params.id));
route("GET", "/l/:id", (c) => page(c.req, c.params.id));
route("POST", "/feed/:id/complaints", (c) => complain(c.req, c.params.id));
route("POST", "/l/:id/seen", (c) => markAnonymous(c.req, c.params.id));

export { complain, mark, markAnonymous, marks, page };
