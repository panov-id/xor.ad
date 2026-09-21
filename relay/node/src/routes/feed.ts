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
import { sunsetHeader } from "../lib/identity_auth.ts";
import { refusalFor } from "../lib/feed_limits.ts";
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
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          discount_value, conditions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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

route("POST", "/feed", (c) => publish(c.req));

export { publish, TEXT_MAX_BYTES, TEXT_MAX_GRAPHEMES };
