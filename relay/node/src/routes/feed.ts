// Step 2: publishing a phrase.
//
// The shape of this route is decided by one sentence of §8.3 — **moderation
// happens before publication, and not in the path of the request**. So the
// answer is 202 with no `visible_at`: the phrase exists, it is being read, and
// whether anybody else ever sees it is not yet known. A route that waited for
// the verdict would make the person wait for a model, and a route that answered
// 200 would promise something nobody has decided.
//
// What is here is the writing side and its four limits (lib/feed_limits.ts).
// The verdict, the delivery, and the geo rounding of the delivery are their own
// pieces.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { checkAll, FEED_DENSITY_LIMITS, FEED_READ_LIMITS } from "../lib/rate_limit.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { refusalFor } from "../lib/feed_limits.ts";
import { band, boundingBox, quantise } from "../lib/feed_geo.ts";
import { query } from "../lib/db.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

// 128 graphemes on the node; the DDL's 2048 bytes is the wide net beneath it.
const TEXT_MAX_GRAPHEMES = 128;
const TEXT_MAX_BYTES = 2048;
const RADII = [100, 300, 1000, 3000, 10000];
const MODES = ["alone", "company", "party"];

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const countGraphemes = (text: string): number => [...graphemes.segment(text)].length;

interface FeedBody {
  text?: unknown;
  mode?: unknown;
  lat?: unknown;
  lon?: unknown;
  area_radius?: unknown;
  discount_value?: unknown;
  conditions?: unknown;
}

const seconds = (at: Date): number => Math.max(1, Math.ceil((at.getTime() - Date.now()) / 1000));

async function publish(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  const body = await readJson<FeedBody>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);

  const text = body.text;
  if (typeof text !== "string" || text.trim().length < 1) {
    return refuse("invalid_body", "the phrase is missing", 400);
  }
  // Both ceilings, and the refusal says which one — the same rule as a name
  // (§8.3, and db/025 for why the byte one is real rather than decorative).
  if (countGraphemes(text) > TEXT_MAX_GRAPHEMES) {
    return refuse("invalid_body", `the phrase is longer than ${TEXT_MAX_GRAPHEMES} characters`, 400);
  }
  if (new TextEncoder().encode(text).length > TEXT_MAX_BYTES) {
    return refuse(
      "invalid_body",
      `the phrase fits in ${TEXT_MAX_GRAPHEMES} characters but not in ${TEXT_MAX_BYTES} bytes`,
      400,
    );
  }
  if (typeof body.mode !== "string" || !MODES.includes(body.mode)) {
    return refuse("invalid_body", `mode must be one of ${MODES.join(", ")}`, 400);
  }
  if (typeof body.lat !== "number" || typeof body.lon !== "number") {
    return refuse("invalid_body", "lat and lon must be numbers", 400);
  }
  if (!Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90) {
    return refuse("invalid_body", "lat is not a latitude", 400);
  }
  if (!Number.isFinite(body.lon) || body.lon < -180 || body.lon > 180) {
    return refuse("invalid_body", "lon is not a longitude", 400);
  }
  // Five steps and nothing between them: a free integer from 100 to 10000 is
  // 9901 values, which is a near-unique label by itself (§8.3).
  if (typeof body.area_radius !== "number" || !RADII.includes(body.area_radius)) {
    return refuse("invalid_body", `area_radius must be one of ${RADII.join(", ")}`, 400);
  }
  const discount = typeof body.discount_value === "string" ? body.discount_value.slice(0, 200) : null;
  const conditions = typeof body.conditions === "string" ? body.conditions.slice(0, 500) : null;

  const id = crypto.randomUUID();
  const published = quantise({ lat: body.lat, lon: body.lon }, body.area_radius);
  const answer = await transaction<Response>(async (run) => {
    // The row is locked before anything is read, because the moments are
    // written at the verdict and two parallel sends otherwise both pass the
    // ceiling before either verdict lands (§8.3, review panel 2026-09-14).
    const refusal = await refusalFor(run, caller.identityId);
    if (refusal) {
      switch (refusal.kind) {
        case "paused":
          return refuse("rate_limited", "too many refusals; sending is paused", 429, {
            until: Math.floor(refusal.until.getTime() / 1000),
          }, { "retry-after": String(seconds(refusal.until)) });
        case "hold":
          // Not a pause and not a limit: your own phrase is still being read.
          // Seconds, and the client says "checking…" rather than "refused".
          return refuse("refused", "your previous phrase is still being checked", 409, {
            checking: refusal.checking,
          });
        case "hourly":
          return refuse("rate_limited", "four phrases an hour", 429, {
            next_slot: Math.floor(refusal.nextSlot.getTime() / 1000),
          }, { "retry-after": String(seconds(refusal.nextSlot)) });
        case "live":
          return refuse("refused", "four live phrases already", 409, { live: refusal.live });
      }
    }

    // `lang` is the node's answer, not the client's: the feed's language filter
    // reads it (2026-09-16, DATA-22), and a client that named its own language
    // would be naming the filter it lands in. Until the detector of §8.14 is
    // wired, the phrase is stored with the face's language and the column is
    // rewritten at the verdict — which is the only moment the text is read
    // anyway.
    await run(
      // The published centre is computed here, by the same function that will
      // print it, and stored beside the exact one: the delivery compares
      // against the published pair so that nothing a caller can bisect is
      // anything the answer did not already carry (db/027).
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          lat_published, lon_published, discount_value, conditions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        caller.brand ?? "unattributed",
        caller.identityId,
        text,
        body.mode,
        "und",
        body.lat,
        body.lon,
        body.area_radius,
        published.lat,
        published.lon,
        discount,
        conditions,
      ],
    );
    inc("relay_feed_total", { result: "queued" });
    // 202, and `visible_at` is deliberately absent rather than null-valued: the
    // client shows "checking…", and a field that is there and empty invites a
    // client to treat it as "published at no time".
    return json({ id, state: "checking" }, 202, sunsetHeader());
  }).catch((error) => {
    // The unique index is the "one at a time" rule, and losing that race is an
    // ordinary outcome rather than a failure: somebody double-tapped.
    if (String(error).includes("feed_one_waiting")) {
      inc("relay_feed_total", { result: "one_at_a_time" });
      return refuse("refused", "your previous phrase is still being checked", 409, { checking: 1 });
    }
    log("error", "feed publish failed", { error: String(error) });
    inc("relay_feed_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}





// docs/facts/limits.tsv: `feed.page.size` (30) and `feed.radius.ceiling` (25 km).
const PAGE_SIZE = 30;
const RADIUS_CEILING = 25000;

interface FeedRow {
  id: string;
  text: string;
  mode: string;
  lang: string;
  lat_published: number;
  lon_published: number;
  area_radius: number;
  like_count: number;
  discount_value: string | null;
  conditions: string | null;
  visible_at: Date;
  visible_at_cursor: string;
  author_age: number;
}

// GET /feed — the circles that intersect, and nothing else about anybody.
//
// The viewer names a centre and a radius with the request; §8.3 says the area
// is placed **anywhere**, with no check of where the person actually is and no
// geolocation permission, so there is nothing to store and nothing to verify.
// The contract did not name these parameters until 2026-09-21 — the route
// cannot exist without them, and the same paragraph says the node sees the
// viewing radius, so the omission was an omission.
//
// What a card carries outside: the phrase, its mode, its language, its like
// count, and its centre **rounded to the grid of its own radius**
// (lib/feed_geo.ts). The exact centre never leaves. Nothing about the author
// leaves at all — not an id, not a name, not an age; the age is read to decide
// the band and then dropped.
async function deliver(req: Request, url: URL): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  // Counted per identity, not per address (§3 keeps both, and the fan-out this
  // closes is several identities behind one address — review panel 2026-09-21,
  // open-work P1, decided 2026-09-21). Reading the feed had no limit of any kind
  // until now, which is what made walking a boundary by bisection free.
  const allowed = checkAll(FEED_READ_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    inc("relay_feed_total", { result: "rate_limited" });
    return refuse("rate_limited", "too many reads of the feed", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }

  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radius = Number(url.searchParams.get("radius"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return refuse("invalid_body", "lat is missing or not a latitude", 400);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return refuse("invalid_body", "lon is missing or not a longitude", 400);
  }
  // The viewing radius gets no steps (§8.3): it is not published to anybody, so
  // it cannot be a mark. It is still bounded by the ceiling the handle has.
  if (!Number.isFinite(radius) || radius < 100 || radius > RADIUS_CEILING) {
    return refuse("invalid_body", `radius must be between 100 and ${RADIUS_CEILING} metres`, 400);
  }
  const mode = url.searchParams.get("mode");
  if (mode !== null && !MODES.includes(mode)) {
    return refuse("invalid_body", `mode must be one of ${MODES.join(", ")}`, 400);
  }

  // The cursor is `(visible_at, id)` — a pair, because two phrases published in
  // the same millisecond would otherwise make a page boundary that drops one of
  // them (2026-09-16, DATA-5).
  //
  // The pair only works if its first half survives the round trip, and until
  // 2026-09-21 it did not: the cursor was built from `Date.getTime()`,
  // milliseconds, while `timestamptz` holds microseconds. A phrase published at
  // …500123 came back as …500, and the next page's `(visible_at, id) < (…)`
  // then threw away every row between …500000 and …500123 — rows that had not
  // been shown, on a descending order, silently. The pair was doing its job and
  // its first half was lying. Measured in a container by the review panel's
  // refuter: three rows in one millisecond, page one showed the newest, page
  // two showed the oldest, the middle one existed on neither page.
  //
  // So the cursor carries microseconds since the epoch, as digits, and the
  // query turns them back into an instant with integer arithmetic. Two things
  // it must not be, both measured here on 2026-09-21: not a JavaScript `Date`,
  // which has no microseconds at all; and **not a string that looks like a
  // timestamp**, because postgres.js converts such a parameter into a `Date`
  // on the way out — a cursor of "…500900Z" arrived at the database as
  // "…500000" and the first version of this fix was undone by its own driver,
  // silently, while looking correct in the source.
  const after = url.searchParams.get("after");
  let cursorAt: string | null = null;
  let cursorId: string | null = null;
  if (after) {
    const cut = after.lastIndexOf("_");
    const at = cut < 0 ? "" : after.slice(0, cut);
    const id = cut < 0 ? "" : after.slice(cut + 1);
    if (!/^[0-9]{1,19}$/.test(at) || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      return refuse("invalid_body", "after is not a cursor from this feed", 400);
    }
    cursorAt = at;
    cursorId = id;
  }

  const [me] = await query<{ age: number; languages: string[]; filter_age_min: number | null; filter_age_max: number | null }>(
    `SELECT age, languages, filter_age_min, filter_age_max FROM identities WHERE id = $1`,
    [caller.identityId],
  ) ?? [];
  if (!me) return refuse("unavailable", "the node cannot answer right now", 503);

  const mine = band(me.age);
  // The viewer's own filter, clamped into their band: narrower is allowed,
  // wider is not, and the clamp is here rather than in a CHECK because the band
  // depends on the age (§8.3).
  const ageLow = Math.max(mine.low, me.filter_age_min ?? mine.low);
  const ageHigh = mine.high === null
    ? (me.filter_age_max ?? null)
    : Math.min(mine.high, me.filter_age_max ?? mine.high);

  // The band is symmetric: the author must be inside the viewer's band **and**
  // the viewer inside the author's. Written as SQL rather than filtered in
  // memory because it decides which rows are read at all.
  const bandSql = `
    a.age >= $6 AND ($7::int IS NULL OR a.age <= $7)
    AND (
      CASE WHEN a.age <= 20 THEN $5::int BETWEEN greatest(13, a.age - 2) AND a.age + 2
           ELSE $5::int >= least(21, a.age - 2)
      END
    )`;

  // Growing the radius is the answer to an empty screen, and only the radius:
  // an empty feed says nothing — broken, nobody here, or the person narrowed
  // themselves — while the band is never widened, because widening it is the
  // door it exists to close.
  const steps = [radius, ...[1000, 3000, 10000, RADIUS_CEILING].filter((r) => r > radius)];
  let rows: FeedRow[] = [];
  let usedRadius = radius;
  for (const [index, attempt] of steps.entries()) {
    const box = boundingBox({ lat, lon }, attempt + 10000);
    // Two ways of asking the same geometric question, and which one is cheaper
    // depends entirely on whether anybody is there. Measured 2026-09-21 on a
    // million phrases (scripts/measure-feed-geo.sh, numbers in the panel
    // protocol): where phrases are dense the planner ignores the geometry and
    // walks `feed_cursor`, whose order is this query's order, and fills a page
    // in 8 ms — a box scan there is nine times worse, because it has to collect
    // every hit and sort. Where they are sparse that same walk reads the whole
    // table and finds nothing: 468 ms, repeated for every widening, so about
    // two seconds to say "nobody here".
    //
    // The first attempt is the common one and asks with BETWEEN. The widenings
    // happen only after an empty answer — that is, only in the sparse case — so
    // they ask with `<@ box`, which the GiST index of db/029 can serve.
    const geo = index === 0
      ? "f.lat_published BETWEEN $1 AND $2 AND f.lon_published BETWEEN $3 AND $4"
      : "point(f.lon_published, f.lat_published) <@ " +
        "box(point($3::float8, $1::float8), point($4::float8, $2::float8))";
    const found = await query<FeedRow>(
      `SELECT f.id, f.text, f.mode, f.lang, f.lat_published, f.lon_published,
              f.area_radius, f.like_count,
              (extract(epoch from f.visible_at) * 1000000)::bigint::text
                AS visible_at_cursor,
              f.discount_value, f.conditions, f.visible_at, a.age AS author_age
         FROM feed_messages f
         JOIN identities a ON a.id = f.author_identity
        WHERE f.visible_at IS NOT NULL AND f.expires_at > now()
          AND ${geo}
          AND ${bandSql}
          AND ($8::text IS NULL OR f.mode = $8)
          -- An undetermined language passes every filter, and it has to
          -- until the detector of section 8.14 exists. Every phrase is stored
          -- as und (the insert above says "rewritten at the verdict"; the
          -- verdict rewrites nothing, it touches visible_at and expires_at
          -- only), so a viewer who names a language would otherwise get an
          -- empty feed and an empty density for ever, and the radius growth
          -- would not save them: it grows the radius, not the filter. Nobody
          -- can name one today, there being no route that writes
          -- identities.languages, so this is a mine defused before the first
          -- PATCH of a profile arms it. Review panel, 2026-09-21.
          AND ($9::text[] = '{}' OR f.lang = 'und' OR f.lang = ANY($9))
          -- §8.9: a block hides each one's phrases from the other. Missing until
          -- 030 made the table; the likes review panel (2026-09-21) found it by
          -- the like_count that a blocked like left unmoved.
          AND NOT EXISTS (SELECT 1 FROM blocks b
                           WHERE (b.blocker_identity = $15::uuid AND b.blocked_identity = f.author_identity)
                              OR (b.blocker_identity = f.author_identity AND b.blocked_identity = $15::uuid))
          -- §8.9: what the viewer hid for themselves stays out of their feed only.
          AND NOT EXISTS (SELECT 1 FROM hidden_messages h
                           WHERE h.identity = $15::uuid AND h.feed_message_id = f.id)
          AND ($10::bigint IS NULL OR (f.visible_at, f.id) <
                (timestamptz 'epoch' + $10::bigint * interval '1 microsecond', $11::uuid))
          -- The circles intersect: the distance between the centres is no more
          -- than the two radii together. Measured with the same constant the
          -- grid uses (lib/feed_geo.ts), so the two cannot drift apart — and
          -- against the **published** centre, not the exact one. The caller
          -- owns the other side of this inequality (their own lat, lon and
          -- radius, at full precision), so measuring from the exact centre
          -- made the boundary a circle around a value that never goes out,
          -- and bisecting the boundary read it back to within metres
          -- (db/027, review panel 2026-09-21).
          AND sqrt(
                pow((f.lat_published - $12) * 111320, 2) +
                pow((f.lon_published - $13) * 111320 * cos(radians((f.lat_published + $12) / 2)), 2)
              ) <= f.area_radius + $14
        ORDER BY f.visible_at DESC, f.id DESC
        LIMIT ${PAGE_SIZE}`,
      [
        box.latMin, box.latMax, box.lonMin, box.lonMax,
        me.age, ageLow, ageHigh,
        mode, me.languages ?? [],
        cursorAt, cursorId,
        lat, lon, attempt,
        caller.identityId,
      ],
    ) ?? [];
    usedRadius = attempt;
    if (found.length > 0 || cursorAt) {
      rows = found;
      break;
    }
  }

  const items = rows.map((row) => {
    // The stored pair, not a fresh rounding of the exact one: the query
    // matched on these, so printing anything else would mean the answer and
    // the condition that produced it disagreed (db/027).
    const at = { lat: row.lat_published, lon: row.lon_published };
    return {
      kind: "phrase",
      id: row.id,
      text: row.text,
      mode: row.mode,
      lang: row.lang,
      lat: at.lat,
      lon: at.lon,
      area_radius: row.area_radius,
      like_count: row.like_count,
      created_at: Math.floor(row.visible_at.getTime() / 1000),
      ...(row.discount_value ? { offer: { discount_value: row.discount_value, conditions: row.conditions } } : {}),
      // "Farther than you asked", and only when it is true. The viewer's own
      // setting is not changed by this: an empty screen gets a temporary
      // answer, not a silent edit of somebody's preferences (§8.3).
      ...(usedRadius > radius ? { farther_than_asked: true } : {}),
    };
  });

  const last = rows[rows.length - 1];
  inc("relay_feed_total", { result: "delivered" });
  return json({
    items,
    next: rows.length === PAGE_SIZE && last
      ? `${last.visible_at_cursor}_${last.id}`
      : null,
    ...(usedRadius > radius ? { radius_used: usedRadius } : {}),
  }, 200, sunsetHeader());
}


// DELETE /feed/:id — taking your own phrase down.
//
// Two numbers part company here and §8.3 is explicit about why: **the live slot
// frees at once, the hour's ceiling does not.** The four-live limit is a
// property of the table, so deleting a row frees a slot immediately; the
// four-an-hour limit is held by moments in `identity_stats`, which a deletion
// does not touch — otherwise taking a phrase down, or a step away, would reset
// the hour and the ceiling would mean nothing (2026-09-14).
//
// Only your own. Somebody else's phrase answers exactly as a phrase that never
// existed: a distinguishable refusal would let a stranger probe which ids are
// real.
async function takeDown(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return refuse("not_found", "no such phrase", 404);
  }

  const gone = await query<{ id: string }>(
    `DELETE FROM feed_messages
      WHERE id = $1 AND author_identity = $2
      RETURNING id`,
    [id, caller.identityId],
  );
  if (gone === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (gone.length === 0) {
    inc("relay_feed_total", { result: "take_down_missed" });
    return refuse("not_found", "no such phrase", 404);
  }
  inc("relay_feed_total", { result: "taken_down" });
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

// The steps a density answer comes in, and why it is steps (§8.3, 2026-08-26).
//
// The handle on screen 3 says how many live phrases are inside the circle, and
// a number there would be a measuring instrument in a stranger's hands: drag
// the radius, read the count, and the difference tells you about one person's
// area. A step is enough to aim with and too coarse to triangulate.
const DENSITY_STEPS: Array<{ upTo: number; step: string }> = [
  { upTo: 0, step: "none" },
  { upTo: 4, step: "few" },
  { upTo: 14, step: "about_ten" },
  { upTo: 99, step: "tens" },
];
// The count stops here, because the answer does. Every step above is decided
// by the time the count reaches the last `upTo` + 1 — a hundred and a million
// both read "hundreds" — so counting further is paying for a number nobody is
// told. Measured 2026-09-21 on a million phrases (scripts/measure-feed-geo.sh):
// the full count in a dense spot took 98.2 ms, the capped one 50.6 ms, and the
// handle is what a slider calls on every move. Derived from the table rather
// than written as 100, so a new step cannot leave the cap behind it.
const DENSITY_CAP = DENSITY_STEPS[DENSITY_STEPS.length - 1].upTo + 1;

export function densityStep(count: number): string {
  for (const { upTo, step } of DENSITY_STEPS) if (count <= upTo) return step;
  return "hundreds";
}

// GET /feed/density — the same circle and the same band as the feed, answered
// as a step.
//
// It reads what the feed would deliver rather than everything in the circle: a
// handle that promised company and then showed an empty screen because the band
// cut it would be worse than no handle.
async function density(req: Request, url: URL): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;

  // The number the registry has carried since 2026-09-15 and nothing enforced:
  // feed.density.burst, a hundred in a row being a density profile rather than
  // a person. Per identity, for the same reason the feed's is.
  const allowed = checkAll(FEED_DENSITY_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    inc("relay_feed_total", { result: "density_rate_limited" });
    return refuse("rate_limited", "too many density questions", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }

  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radius = Number(url.searchParams.get("radius"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return refuse("invalid_body", "lat is missing or not a latitude", 400);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return refuse("invalid_body", "lon is missing or not a longitude", 400);
  }
  if (!Number.isFinite(radius) || radius < 100 || radius > RADIUS_CEILING) {
    return refuse("invalid_body", `radius must be between 100 and ${RADIUS_CEILING} metres`, 400);
  }

  const [me] = await query<{ age: number; languages: string[] }>(
    `SELECT age, languages FROM identities WHERE id = $1`,
    [caller.identityId],
  ) ?? [];
  if (!me) return refuse("unavailable", "the node cannot answer right now", 503);

  const mine = band(me.age);
  const box = boundingBox({ lat, lon }, radius + 10000);
  const counted = await query<{ n: string }>(
    // The inner query stops at DENSITY_CAP rows; the outer one counts what it
    // got. Note what was *not* changed, and why: the box form that rescued the
    // sparse feed does nothing for this handle — it has no ORDER BY, so there
    // is no cursor walk to escape, and on the same million rows the box was
    // slower here (93.9 ms against 81.8). Measured rather than copied across.
    `SELECT count(*)::text AS n FROM (
       SELECT 1
       FROM feed_messages f
       JOIN identities a ON a.id = f.author_identity
      WHERE f.visible_at IS NOT NULL AND f.expires_at > now()
        AND f.lat_published BETWEEN $1 AND $2 AND f.lon_published BETWEEN $3 AND $4
        AND a.age >= $6 AND ($7::int IS NULL OR a.age <= $7)
        AND (
          CASE WHEN a.age <= 20 THEN $5::int BETWEEN greatest(13, a.age - 2) AND a.age + 2
               ELSE $5::int >= least(21, a.age - 2)
          END
        )
        -- Same reason as the feed's: an unknown language passes, or the
        -- handle would say "nobody here" to everyone who chose one (db note
        -- above, review panel 2026-09-21).
        AND ($8::text[] = '{}' OR f.lang = 'und' OR f.lang = ANY($8))
        -- §8.9: a block hides each one's phrases from the other. Missing until
        -- 030 made the table; the likes review panel (2026-09-21) found it by
        -- the like_count that a blocked like left unmoved.
        AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_identity = $12::uuid AND b.blocked_identity = f.author_identity)
                        OR (b.blocker_identity = f.author_identity AND b.blocked_identity = $12::uuid))
        -- The published centre here too: the handle answers a coarser question
        -- than the feed, but its none/few boundary is still a yes-or-no about
        -- one circle, and a yes-or-no about the exact centre is the same
        -- oracle in cheaper clothes (db/027).
        AND sqrt(
              pow((f.lat_published - $9) * 111320, 2) +
              pow((f.lon_published - $10) * 111320 * cos(radians((f.lat_published + $9) / 2)), 2)
            ) <= f.area_radius + $11
      LIMIT ${DENSITY_CAP}
    ) AS capped`,
    [
      box.latMin, box.latMax, box.lonMin, box.lonMax,
      me.age, mine.low, mine.high,
      me.languages ?? [],
      lat, lon, radius,
      caller.identityId,
    ],
  );
  if (counted === null) return refuse("unavailable", "the node cannot answer right now", 503);

  inc("relay_feed_total", { result: "density" });
  // The count itself never leaves. That is the whole decision.
  return json({ step: densityStep(Number(counted[0]?.n ?? 0)) }, 200, sunsetHeader());
}

route("DELETE", "/feed/:id", (c) => takeDown(c.req, c.params.id));
route("GET", "/feed/density", (c) => density(c.req, c.url));

route("POST", "/feed", (c) => publish(c.req));
route("GET", "/feed", (c) => deliver(c.req, c.url));

export { deliver, density, PAGE_SIZE, publish, RADIUS_CEILING, takeDown, TEXT_MAX_BYTES, TEXT_MAX_GRAPHEMES };
