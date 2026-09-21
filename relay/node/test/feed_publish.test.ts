// Sending a phrase to the feed, and the four rules that stop a person filling
// it (chat spec §8.3).
//
// The route answers 202 and nothing about visibility, because moderation
// happens before publication and outside the request. Everything here is about
// what the node refuses and how it says so — the part a person meets.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "feed-publish-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "feed-publish-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "feed-publish-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const limits = await import("../src/lib/feed_limits.ts");
const verdict = await import("../src/lib/feed_verdict.ts");
const geo = await import("../src/lib/feed_geo.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/statements.ts");
await import("../src/routes/likes.ts");

const KEY_ID = "ak_pub_feedpublishtest001";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;

async function call(method: string, path: string, init: {
  body?: unknown;
  headers?: Record<string, string>;
} = {}) {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "feed-publish-origin-token",
        "x-client-ip": nextAddress(),
        ...(raw === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      body: raw,
    }),
    params: found.params,
    url,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(
    method,
    auth.signedAuthority(target),
    auth.signedPath(target),
    await auth.sha256hex(raw),
    time,
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)),
  );
  return await call(method, path, {
    body,
    headers: {
      "x-identity-session": sessionId,
      "x-identity-time": String(time),
      "x-identity-sign": auth.bytesToBase64url(signature),
    },
  });
}

async function author(age = 30) {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, "the registration failed");
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

const phrase = (over: Record<string, unknown> = {}) => ({
  text: "гуляю у реки, если кто рядом",
  mode: "alone",
  lat: 41.9,
  lon: 12.5,
  area_radius: 1000,
  ...over,
});

// Publishing something is the ordinary way to free the "one at a time" slot in
// a test: the verdict transaction is its own piece, so it is done here by the
// statement §8.3 gives for it.
async function publishWaiting(identityId: string) {
  await database.queryOrThrow(
    `UPDATE feed_messages
        SET visible_at = now(), expires_at = now() + interval '4 hours 20 minutes'
      WHERE author_identity = $1 AND visible_at IS NULL`,
    [identityId],
  );
  await database.queryOrThrow(
    `UPDATE identity_stats
        SET published_at_recent = array_append(published_at_recent, now())
      WHERE identity = $1`,
    [identityId],
  );
}

Deno.test("a phrase is accepted for checking, not published", async () => {
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  assertEquals(sent.status, 202, JSON.stringify(sent.body));
  const answer = sent.body as { id: string; state: string };
  assertEquals(answer.state, "checking");

  const [row] = await database.queryOrThrow<
    { visible_at: Date | null; expires_at: Date | null; author_identity: string; mode: string }
  >(
    `SELECT visible_at, expires_at, author_identity, mode FROM feed_messages WHERE id = $1`,
    [answer.id],
  );
  assertEquals(row.visible_at, null, "the phrase was published without a verdict");
  assertEquals(row.expires_at, null, "a phrase with no verdict already has a term");
  assertEquals(row.author_identity, me.identity_id);
  assertEquals(row.mode, "alone");
});

Deno.test("while one phrase is being checked the next is not taken", async () => {
  // §8.3: one at a time, and held by a partial unique index rather than by a
  // count — a count races a SELECT that looked empty a moment ago.
  const me = await author();
  assertEquals((await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase())).status, 202);
  const second = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "и ещё одна" }));
  assertEquals(second.status, 409);
  assertEquals((second.body as { error: { code: string } }).error.code, "refused");

  // And the slot frees when the verdict lands.
  await publishWaiting(me.identity_id);
  const third = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "третья" }));
  assertEquals(third.status, 202, "the slot did not free after a verdict");
});

Deno.test("four an hour counts moments, and says when the next slot is", async () => {
  const me = await author();
  for (let i = 0; i < limits.PUBLISH_PER_HOUR; i++) {
    const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: `фраза ${i}` }));
    assertEquals(sent.status, 202, `phrase ${i + 1} was refused: ${JSON.stringify(sent.body)}`);
    await publishWaiting(me.identity_id);
  }
  // The live ones are taken down so that the limit under test is the hourly one
  // rather than the four-live one — §8.3 keeps them apart on purpose.
  await database.queryOrThrow(
    `DELETE FROM feed_messages WHERE author_identity = $1 AND visible_at IS NOT NULL`,
    [me.identity_id],
  );

  const fifth = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "пятая" }));
  assertEquals(fifth.status, 429, JSON.stringify(fifth.body));
  const said = fifth.body as { error: { code: string; next_slot: number } };
  assertEquals(said.error.code, "rate_limited");
  const inAnHour = Date.now() / 1000 + 3600;
  assert(
    Math.abs(said.error.next_slot - inAnHour) < 120,
    `next_slot was ${said.error.next_slot}, expected about ${Math.round(inAnHour)}`,
  );
  assert(fifth.headers.get("retry-after"), "no retry-after on the hourly refusal");
});

Deno.test("four live phrases is its own limit, and a take-down frees it at once", async () => {
  const me = await author();
  for (let i = 0; i < limits.LIVE_MAX; i++) {
    assertEquals(
      (await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: `живая ${i}` }))).status,
      202,
    );
    await publishWaiting(me.identity_id);
  }
  // The hour's moments are cleared so that this case measures the live limit
  // and not the hourly one.
  await database.queryOrThrow(
    `UPDATE identity_stats SET published_at_recent = '{}' WHERE identity = $1`,
    [me.identity_id],
  );

  const fifth = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "пятая" }));
  assertEquals(fifth.status, 409, JSON.stringify(fifth.body));
  assertEquals((fifth.body as { error: { live: number } }).error.live, limits.LIVE_MAX);

  // Taking one down frees a slot immediately — the hour's moment stays where it
  // is, and that is the whole reason the two numbers are separate (§8.3).
  await database.queryOrThrow(
    `DELETE FROM feed_messages WHERE id = (
       SELECT id FROM feed_messages WHERE author_identity = $1 AND visible_at IS NOT NULL LIMIT 1
     )`,
    [me.identity_id],
  );
  const after = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "взамен" }));
  assertEquals(after.status, 202, "a take-down did not free a slot");
});

Deno.test("five refusals in an hour buy fifteen minutes of silence", async () => {
  const me = await author();
  // The refusals are written the way a verdict writes them; the verdict
  // transaction itself is a separate piece of step 2.
  await database.queryOrThrow(
    `UPDATE identity_stats
        SET rejected_at_recent = ARRAY(
              SELECT now() - make_interval(mins => g) FROM generate_series(1, $2) g
            )
      WHERE identity = $1`,
    [me.identity_id, limits.REFUSALS_BEFORE_PAUSE],
  );

  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  assertEquals(sent.status, 429, JSON.stringify(sent.body));
  const said = sent.body as { error: { until: number } };
  const untilMs = said.error.until * 1000;
  assert(
    untilMs > Date.now() && untilMs < Date.now() + limits.PAUSE_MINUTES * 60 * 1000,
    "the pause does not end within fifteen minutes of the last refusal",
  );

  // Outside the window the pause is over. The refusals are aged rather than
  // waited out.
  await database.queryOrThrow(
    `UPDATE identity_stats
        SET rejected_at_recent = ARRAY(
              SELECT t - interval '20 minutes' FROM unnest(rejected_at_recent) t
            )
      WHERE identity = $1`,
    [me.identity_id],
  );
  const later = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  assertEquals(later.status, 202, "the pause outlived its fifteen minutes");
});

Deno.test("a phrase is measured in graphemes, and the refusal names the ceiling", async () => {
  const me = await author();
  const long = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "я".repeat(129) }));
  assertEquals(long.status, 400);
  assert(
    (long.body as { error: { message: string } }).error.message.includes("128 characters"),
    "the refusal did not name the grapheme ceiling",
  );

  // Inside 128 graphemes and outside 2048 bytes: the second ceiling is real.
  const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}";
  const heavy = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: family.repeat(100) }));
  assertEquals(heavy.status, 400);
  assert(
    (heavy.body as { error: { message: string } }).error.message.includes("bytes"),
    "the refusal did not name the byte ceiling",
  );
});

Deno.test("a radius between the steps is refused, and so is a mode nobody named", async () => {
  const me = await author();
  const odd = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ area_radius: 500 }));
  assertEquals(odd.status, 400, "a radius between the steps was accepted");
  const mode = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ mode: "alone-ish" }));
  assertEquals(mode.status, 400, "an unknown mode was accepted");
});


// --- the verdict ------------------------------------------------------------
//
// Two things have to happen together: the row becomes visible or stops
// existing, and the moment goes into the author's counters. Apart they are a
// hole — a send arriving between them sees an empty queue and an unwritten
// moment, and passes "four an hour" (§8.3, review panel 2026-09-14).

Deno.test("a passed phrase becomes visible and gets its term in one write", async () => {
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  const { id } = sent.body as { id: string };

  const applied = await verdict.publishPhrase(id);
  assertEquals(applied.applied, true);
  assertEquals(applied.identityId, me.identity_id);

  const [row] = await database.queryOrThrow<{ visible_at: Date | null; expires_at: Date | null }>(
    `SELECT visible_at, expires_at FROM feed_messages WHERE id = $1`,
    [id],
  );
  assert(row.visible_at, "the phrase did not become visible");
  assert(row.expires_at, "a published phrase has no term");
  const span = row.expires_at!.getTime() - row.visible_at!.getTime();
  // Four hours twenty — `feed.phrase.span`, read from the registry rather than
  // from memory.
  assertEquals(span, (4 * 60 + 20) * 60 * 1000, "the term is not four hours and twenty minutes");

  // And the moment, in the same breath.
  const [stats] = await database.queryOrThrow<
    { published_at_recent: Date[]; first_published_at: Date | null }
  >(
    `SELECT published_at_recent, first_published_at FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(stats.published_at_recent.length, 1, "the publication left no moment");
  assert(stats.first_published_at, "the first publication left no date");
});

Deno.test("a refused phrase stops existing, and leaves a moment behind", async () => {
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  const { id } = sent.body as { id: string };

  assertEquals((await verdict.refusePhrase(id)).applied, true);

  const rows = await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id]);
  assertEquals(rows.length, 0, "a refused phrase was kept as a row with a flag");
  const [stats] = await database.queryOrThrow<{ rejected_at_recent: Date[] }>(
    `SELECT rejected_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(stats.rejected_at_recent.length, 1, "the refusal left no moment");

  // The slot frees with the row: the author can send again at once.
  const again = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "другая" }));
  assertEquals(again.status, 202, "a refusal did not free the waiting slot");
});

Deno.test("a verdict that arrives twice decides once", async () => {
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  const { id } = sent.body as { id: string };

  assertEquals((await verdict.publishPhrase(id)).applied, true);
  const second = await verdict.publishPhrase(id);
  assertEquals(second.applied, false, "the same phrase was published twice");

  const [stats] = await database.queryOrThrow<{ published_at_recent: Date[] }>(
    `SELECT published_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(stats.published_at_recent.length, 1, "a repeated verdict wrote a second moment");
});

Deno.test("the moments are cut to the last few, and the hour drops out of them", async () => {
  const me = await author();
  // Nine refusals in a row leave six — the number §8.3 states, checked against
  // the expression rather than against a memory of it.
  for (let i = 0; i < 9; i++) {
    const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: `раз ${i}` }));
    assertEquals(sent.status, 202, `send ${i + 1} was refused: ${JSON.stringify(sent.body)}`);
    await verdict.refusePhrase((sent.body as { id: string }).id);
    // The pause would stop the next send after the fifth refusal, so the
    // moments are aged out of the pause's window between rounds — what is
    // under test here is the trimming, not the pause.
    await database.queryOrThrow(
      `UPDATE identity_stats
          SET rejected_at_recent = ARRAY(
                SELECT t - interval '20 minutes' FROM unnest(rejected_at_recent) t
              )
        WHERE identity = $1`,
      [me.identity_id],
    );
  }
  const [stats] = await database.queryOrThrow<{ rejected_at_recent: Date[] }>(
    `SELECT rejected_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assert(
    stats.rejected_at_recent.length <= 6,
    `nine refusals left ${stats.rejected_at_recent.length} moments, not six or fewer`,
  );
});

Deno.test("a phrase nobody read is dropped, and its author is not charged for it", async () => {
  // §8.3: a row whose checking wait expired is deleted and does not count as
  // queued. No moment either way — neither a publication nor a refusal
  // happened, and the author's pause must not grow because the node was slow.
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  const { id } = sent.body as { id: string };
  await database.queryOrThrow(
    `UPDATE feed_messages SET created_at = now() - make_interval(mins => $2) WHERE id = $1`,
    [id, verdict.QUEUE_WAIT_MINUTES + 1],
  );

  const swept = await verdict.sweepStaleQueue();
  assert(swept >= 1, "the stale phrase was not swept");

  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length,
    0,
  );
  const [stats] = await database.queryOrThrow<
    { rejected_at_recent: Date[]; published_at_recent: Date[] }
  >(
    `SELECT rejected_at_recent, published_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(stats.rejected_at_recent.length, 0, "waiting too long counted as a refusal");
  assertEquals(stats.published_at_recent.length, 0, "waiting too long counted as a publication");

  // And the slot is free again.
  const again = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "заново" }));
  assertEquals(again.status, 202, "the sweep did not free the waiting slot");
});

Deno.test("a phrase still inside its wait is left alone", async () => {
  const me = await author();
  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  const { id } = sent.body as { id: string };
  await verdict.sweepStaleQueue();
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length,
    1,
    "a phrase that had just arrived was swept",
  );
});


// --- the delivery -----------------------------------------------------------

// Publishes straight away: the delivery is what is under test, not the queue.
async function livePhrase(me: { pair: CryptoKey; session_id: string }, over: Record<string, unknown> = {}) {
  const sent = await signedCall(me.pair, me.session_id, "POST", "/feed", phrase(over));
  assertEquals(sent.status, 202, JSON.stringify(sent.body));
  const { id } = sent.body as { id: string };
  await verdict.publishPhrase(id);
  return id;
}

const feedUrl = (over: Record<string, string | number> = {}) => {
  const params = new URLSearchParams({ lat: "41.9", lon: "12.5", radius: "1000" });
  for (const [k, v] of Object.entries(over)) params.set(k, String(v));
  return `/feed?${params.toString()}`;
};

Deno.test("a phrase in the circle comes back, rounded, and the exact centre does not", async () => {
  const mine = await author();
  const theirs = await author();
  // Their centre is a few hundred metres from the viewer's, with the same
  // radius: the circles overlap heavily.
  const id = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "во дворе с гитарой",
    lat: 41.9021,
    lon: 12.4964,
  });

  const feed = await signedCall(mine.pair.privateKey, mine.session_id, "GET", feedUrl({ lat: 41.9, lon: 12.497 }));
  assertEquals(feed.status, 200, JSON.stringify(feed.body));
  const items = (feed.body as { items: Array<Record<string, unknown>> }).items;
  const card = items.find((i) => i.id === id);
  assert(card, `the phrase was not delivered: ${JSON.stringify(items)}`);
  assertEquals(card!.text, "во дворе с гитарой");

  // The centre that goes outside is the grid node, never the one that was
  // published with.
  const expected = geo.quantise({ lat: 41.9021, lon: 12.4964 }, 1000);
  assertEquals(card!.lat, expected.lat);
  assertEquals(card!.lon, expected.lon);
  assert(card!.lat !== 41.9021, "the exact latitude left the node");

  // And nothing about the author does.
  assertEquals(card!.author_identity, undefined);
  assertEquals(card!.author_age, undefined);
});

Deno.test("circles that do not reach each other are not delivered", async () => {
  const mine = await author();
  const theirs = await author();
  // Forty kilometres away, both with a kilometre of radius: nothing touches.
  const far = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "далеко отсюда",
    lat: 42.26,
    lon: 12.5,
  });

  const feed = await signedCall(mine.pair.privateKey, mine.session_id, "GET", feedUrl());
  const items = (feed.body as { items: Array<{ id: string }> }).items;
  assertEquals(items.find((i) => i.id === far), undefined, "a phrase out of reach was delivered");
});

Deno.test("the band cuts the feed, and it is never widened to fill it", async () => {
  const teenager = await author(15);
  const adult = await author(35);
  const adults = await livePhrase({ pair: adult.pair.privateKey, session_id: adult.session_id }, {
    text: "взрослая фраза",
  });

  const seen = await signedCall(teenager.pair.privateKey, teenager.session_id, "GET", feedUrl());
  const items = (seen.body as { items: Array<{ id: string }> }).items;
  assertEquals(
    items.find((i) => i.id === adults),
    undefined,
    "a fifteen-year-old was shown an adult's phrase",
  );
  // Even though the feed is empty for them, and the radius grew looking for
  // something: the band is never part of what grows (§8.3).
  assertEquals(items.length, 0, "the empty feed was filled from outside the band");
});

Deno.test("an empty screen grows the radius, says so, and does not change the setting", async () => {
  const mine = await author();
  const theirs = await author();
  // A corner of the world the other cases of this suite do not use: the point
  // of this one is an **empty** screen, and the other phrases live around
  // 41.9/12.5. Twelve kilometres away — outside a kilometre, inside the ceiling.
  const far = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "на том берегу",
    lat: 10.108,
    lon: 20.0,
  });

  const feed = await signedCall(
    mine.pair.privateKey,
    mine.session_id,
    "GET",
    feedUrl({ lat: 10.0, lon: 20.0, radius: 1000 }),
  );
  const body = feed.body as { items: Array<Record<string, unknown>>; radius_used?: number };
  const card = body.items.find((i) => i.id === far);
  assert(card, `the radius did not grow: ${JSON.stringify(body)}`);
  assertEquals(card!.farther_than_asked, true, "the card did not say it was farther than asked");
  assert((body.radius_used ?? 0) > 1000, "the answer did not say which radius it used");
});

Deno.test("a phrase still waiting for a verdict is delivered to nobody", async () => {
  const mine = await author();
  const theirs = await author();
  const sent = await signedCall(theirs.pair.privateKey, theirs.session_id, "POST", "/feed", phrase({ text: "ещё не читана" }));
  const { id } = sent.body as { id: string };

  const feed = await signedCall(mine.pair.privateKey, mine.session_id, "GET", feedUrl());
  const items = (feed.body as { items: Array<{ id: string }> }).items;
  assertEquals(items.find((i) => i.id === id), undefined, "an unread phrase reached the feed");
});

Deno.test("an expired phrase is gone from the feed even before it is swept", async () => {
  const mine = await author();
  const theirs = await author();
  const id = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, { text: "истекла" });
  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);

  const feed = await signedCall(mine.pair.privateKey, mine.session_id, "GET", feedUrl());
  const items = (feed.body as { items: Array<{ id: string }> }).items;
  assertEquals(items.find((i) => i.id === id), undefined, "an expired phrase was still delivered");
});

Deno.test("the cursor is a pair, and it does not drop a phrase published in the same instant", async () => {
  const mine = await author();
  const theirs = await author();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    ids.push(await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, { text: `страница ${i}` }));
    // The hour's moments are cleared so the author's own limits are not what
    // this case measures.
    await database.queryOrThrow(`UPDATE identity_stats SET published_at_recent = '{}' WHERE identity = $1`, [theirs.identity_id]);
    await database.queryOrThrow(`DELETE FROM feed_messages WHERE author_identity = $1 AND visible_at IS NULL`, [theirs.identity_id]);
  }
  // All three share one `visible_at` to the millisecond: that is the case a
  // cursor of time alone loses (2026-09-16, DATA-5).
  await database.queryOrThrow(
    `UPDATE feed_messages SET visible_at = now() WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  const first = await signedCall(mine.pair.privateKey, mine.session_id, "GET", feedUrl());
  const firstItems = (first.body as { items: Array<{ id: string }> }).items;
  const delivered = new Set(firstItems.map((i) => i.id));
  for (const id of ids) {
    assert(delivered.has(id), `phrase ${id} was lost between pages`);
  }
});


// --- taking down, expiring, and the density handle ---------------------------

Deno.test("taking a phrase down frees the slot but not the hour", async () => {
  // §8.3 keeps these two apart deliberately: the live limit is a property of
  // the table, the hourly one is moments in identity_stats — otherwise a
  // take-down, or a step away, would reset the hour and the ceiling would mean
  // nothing (2026-09-14).
  const me = await author();
  const ids: string[] = [];
  for (let i = 0; i < limits.LIVE_MAX; i++) {
    const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: `живая ${i}` }));
    const { id } = sent.body as { id: string };
    await verdict.publishPhrase(id);
    ids.push(id);
  }

  const [before] = await database.queryOrThrow<{ published_at_recent: Date[] }>(
    `SELECT published_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(before.published_at_recent.length, limits.PUBLISH_PER_HOUR);

  const removed = await signedCall(me.pair.privateKey, me.session_id, "DELETE", `/feed/${ids[0]}`);
  assertEquals(removed.status, 204, JSON.stringify(removed.body));

  // The hour did not move.
  const [after] = await database.queryOrThrow<{ published_at_recent: Date[] }>(
    `SELECT published_at_recent FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(
    after.published_at_recent.length,
    before.published_at_recent.length,
    "a take-down erased the hour's moments",
  );

  // So the next send meets the hourly ceiling rather than the live one — the
  // slot is free and the hour is not.
  const next = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "взамен" }));
  assertEquals(next.status, 429, JSON.stringify(next.body));
  assertEquals((next.body as { error: { code: string } }).error.code, "rate_limited");
});

Deno.test("somebody else's phrase answers like one that never existed", async () => {
  const mine = await author();
  const theirs = await author();
  const id = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, { text: "не твоя" });

  const attempt = await signedCall(mine.pair.privateKey, mine.session_id, "DELETE", `/feed/${id}`);
  assertEquals(attempt.status, 404);
  const invented = await signedCall(mine.pair.privateKey, mine.session_id, "DELETE", `/feed/${crypto.randomUUID()}`);
  assertEquals(
    (attempt.body as { error: { code: string } }).error.code,
    (invented.body as { error: { code: string } }).error.code,
    "somebody else's phrase is told apart from one that does not exist",
  );

  // And it is still there.
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length,
    1,
    "a stranger took somebody's phrase down",
  );
});

Deno.test("a phrase past its term is swept, and a live one is left alone", async () => {
  const me = await author();
  const live = await livePhrase({ pair: me.pair.privateKey, session_id: me.session_id }, { text: "ещё живая" });
  const old = await livePhrase({ pair: me.pair.privateKey, session_id: me.session_id }, { text: "отжила" });
  await database.queryOrThrow(
    `UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`,
    [old],
  );

  const swept = await verdict.sweepExpiredPhrases();
  assert(swept >= 1, "the expired phrase was not swept");
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [old])).length,
    0,
  );
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [live])).length,
    1,
    "a live phrase was swept with the expired ones",
  );
});

Deno.test("density answers a step, and never the number", async () => {
  const mine = await author();
  const theirs = await author();
  // A corner of the world to itself, so the count is this case's own.
  const here = { lat: -20.0, lon: 30.0 };

  const empty = await signedCall(
    mine.pair.privateKey,
    mine.session_id,
    "GET",
    `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`,
  );
  assertEquals(empty.status, 200, JSON.stringify(empty.body));
  assertEquals((empty.body as { step: string }).step, "none");
  assertEquals((empty.body as Record<string, unknown>).count, undefined, "the count left the node");

  await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "одна тут",
    lat: here.lat,
    lon: here.lon,
  });
  const few = await signedCall(
    mine.pair.privateKey,
    mine.session_id,
    "GET",
    `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`,
  );
  assertEquals((few.body as { step: string }).step, "few");
});

Deno.test("density counts what the feed would deliver, not what is in the circle", async () => {
  // A handle that promised company and then showed an empty screen because the
  // band cut it would be worse than no handle at all.
  const teenager = await author(15);
  const adult = await author(35);
  const here = { lat: -25.0, lon: 35.0 };
  await livePhrase({ pair: adult.pair.privateKey, session_id: adult.session_id }, {
    text: "взрослая рядом",
    lat: here.lat,
    lon: here.lon,
  });

  const seen = await signedCall(
    teenager.pair.privateKey,
    teenager.session_id,
    "GET",
    `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`,
  );
  assertEquals(
    (seen.body as { step: string }).step,
    "none",
    "the handle counted a phrase the band hides",
  );
});


// --- Article 17: what the author is told ------------------------------------
//
// §13 puts this screen with the feed rather than after it, and the reason is
// the feed: it is the first place where something of somebody's can be taken
// down. We never ask for an email — identity is a key pair — so without this
// route a restriction is a silent deletion.

async function writeStatement(identityId: string, over: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO dsa_statements
       (id, brand, target_id, recipient_identity, restriction, facts,
        ground_kind, ground_text, automated_used, until)
     VALUES ($1, 'alpha', $2, $3, $4, $5, $6, $7, false, $8)`,
    [
      id,
      over.target_id ?? crypto.randomUUID(),
      identityId,
      over.restriction ?? "removed",
      over.facts ?? "Фраза называла частный адрес и звала туда людей.",
      over.ground_kind ?? "legal",
      over.ground_text ?? "ст. 17(3)(d), незаконное содержание",
      over.until ?? null,
    ],
  );
  return id;
}

Deno.test("an author with no mailbox can read why their phrase went", async () => {
  const me = await author();
  const stranger = await author();
  const mine = await writeStatement(me.identity_id);
  const theirs = await writeStatement(stranger.identity_id);

  const seen = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  assertEquals(seen.status, 200, JSON.stringify(seen.body));
  const items = (seen.body as { items: Array<Record<string, unknown>> }).items;
  assertEquals(items.length, 1, JSON.stringify(items));
  assertEquals(items[0].id, mine);
  assertEquals(items[0].restriction, "removed");
  assertEquals(items[0].ground_kind, "legal");
  // Indefinite is an absent field, not a null one: a client printing
  // "until: none" would be saying something nobody meant.
  assertEquals("until" in items[0], false, "an indefinite restriction carried an until");
  // Where to take it further travels with the statement.
  assert(items[0].appeal, "the statement did not say where to appeal");

  // And nothing about who complained.
  const text = JSON.stringify(items[0]);
  assert(!text.includes("notifier"), "the notifier reached the author");
  assertEquals(items.find((i) => i.id === theirs), undefined, "another person's statement was shown");
});

Deno.test("a temporary restriction says when it ends", async () => {
  const me = await author();
  await writeStatement(me.identity_id, {
    restriction: "hidden",
    until: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
  const seen = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  const [item] = (seen.body as { items: Array<Record<string, unknown>> }).items;
  assert(typeof item.until === "number", `until was ${JSON.stringify(item.until)}`);
  assert((item.until as number) * 1000 > Date.now(), "the end of the restriction is in the past");
});

Deno.test("the first reading is what counts as delivery", async () => {
  // A statement written and never shown discharges nothing (db/005). The column
  // is written here, by the reading, and never moved afterwards — it means "the
  // first time the author could have read it".
  const me = await author();
  const id = await writeStatement(me.identity_id);
  const [before] = await database.queryOrThrow<{ delivered_at: Date | null }>(
    `SELECT delivered_at FROM dsa_statements WHERE id = $1`,
    [id],
  );
  assertEquals(before.delivered_at, null, "a statement was delivered before anybody read it");

  await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  const [after] = await database.queryOrThrow<{ delivered_at: Date | null }>(
    `SELECT delivered_at FROM dsa_statements WHERE id = $1`,
    [id],
  );
  assert(after.delivered_at, "reading a statement did not record the delivery");

  await new Promise((resolve) => setTimeout(resolve, 20));
  await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  const [again] = await database.queryOrThrow<{ delivered_at: Date }>(
    `SELECT delivered_at FROM dsa_statements WHERE id = $1`,
    [id],
  );
  assertEquals(
    again.delivered_at.getTime(),
    after.delivered_at!.getTime(),
    "a second reading moved the moment of first delivery",
  );
});

addEventListener("unload", () => {



  database.closePool();
});

Deno.test("a statement that was not shown is not recorded as delivered", async () => {
  // The route answers with a hundred and has no cursor, so anything past the
  // hundredth cannot be reached by any call at all. Until 2026-09-21 the
  // delivery UPDATE was bounded by the recipient rather than by the rows that
  // had just gone out, and it marked those unreachable statements delivered:
  // a record under Art. 17 that the author was told, for something they were
  // never shown and could not ask for. Found by the protocols lens of the
  // review panel.
  const me = await author();
  const ids: string[] = [];
  for (let i = 0; i < 101; i++) ids.push(await writeStatement(me.identity_id));
  const oldest = ids[0];

  const seen = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  const items = (seen.body as { items: Array<{ id: string }> }).items;
  assertEquals(items.length, 100, "the page size changed; this case assumes a hundred");
  assertEquals(
    items.find((item) => item.id === oldest),
    undefined,
    "the oldest statement was in the answer after all; the case is testing nothing",
  );

  const [row] = await database.queryOrThrow<{ delivered_at: Date | null }>(
    `SELECT delivered_at FROM dsa_statements WHERE id = $1`,
    [oldest],
  );
  assertEquals(
    row.delivered_at,
    null,
    "a statement the author was never shown is recorded as delivered to them",
  );
});

Deno.test("the visible boundary sits on the published centre, not the exact one", async () => {
  // The trilateration the review panel found on 2026-09-21. The answer rounds
  // a phrase's centre to a grid; the query did not, so "is this phrase in my
  // circle" drew its boundary around the exact centre — and the caller owns
  // the other side of that inequality, at full precision, with no rate limit
  // in the way. Two passes of bisection on latitude and one on longitude read
  // the exact centre back to within metres.
  //
  // The case does not bisect. It stands one probe in the gap between the two
  // possible boundaries: inside the circle around the published centre, and
  // outside the circle around the exact one. Delivered means the boundary is
  // where it should be; missing means the node is still measuring from a
  // value it never hands out.
  const { quantise } = await import("../src/lib/feed_geo.ts");

  const mine = await author();
  const theirs = await author();
  const exact = { lat: 41.94321, lon: 12.5 };
  const radius = 1000;
  const published = quantise(exact, radius);
  const offsetMetres = (published.lat - exact.lat) * 111320;
  assert(
    Math.abs(offsetMetres) > 100,
    `the rounding moved the centre by ${offsetMetres.toFixed(0)} m, too little for this case to tell the two boundaries apart`,
  );

  const id = await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "фраза на краю клетки",
    lat: exact.lat,
    lon: exact.lon,
    area_radius: radius,
  });

  // A probe just inside the published circle, on the far side from the exact
  // one, so the two boundaries disagree about it.
  const away = offsetMetres > 0 ? 1 : -1;
  const probeLat = published.lat + away * (radius + radius - 50) / 111320;

  // A decoy under the probe. Without it an empty answer makes the route grow
  // the radius (feed.ts) until the phrase falls in anyway, and the case would
  // pass against the very code it is meant to catch — it did, on the first
  // run, and that is why the decoy is here.
  await livePhrase({ pair: theirs.pair.privateKey, session_id: theirs.session_id }, {
    text: "приманка под зондом",
    lat: probeLat,
    lon: exact.lon,
    area_radius: radius,
  });
  const seen = await signedCall(
    mine.pair.privateKey,
    mine.session_id,
    "GET",
    feedUrl({ lat: probeLat, lon: exact.lon, radius }),
  );
  const items = (seen.body as { items: Array<{ id: string; lat: number }> }).items;
  const card = items.find((item) => item.id === id);
  assert(
    card,
    "the phrase was cut by a boundary drawn around its exact centre, which is the oracle itself",
  );
  assertEquals(card!.lat, published.lat, "the card printed a centre the query did not match on");
});

Deno.test("reading the feed is counted per identity, so a fan-out costs something", async () => {
  // The owner's decision of 2026-09-21 on the panel's open item P1: the age
  // band stays a precise promise, its price is written into §4.2, and the
  // fan-out that turns the band into an exact age is made expensive. Counted
  // per identity on purpose — the attack is several identities behind one
  // address, and counting by address would refuse a household instead.
  const { FEED_READ_LIMITS, reset } = await import("../src/lib/rate_limit.ts");
  reset();

  const me = await author();
  const neighbour = await author();
  const ceiling = FEED_READ_LIMITS[0].max;

  let refused: { status: number; headers: Headers } | null = null;
  for (let i = 0; i < ceiling + 1; i++) {
    const answer = await signedCall(me.pair.privateKey, me.session_id, "GET", feedUrl());
    if (answer.status === 429) {
      refused = answer;
      break;
    }
    assertEquals(answer.status, 200, `read ${i} was refused with ${answer.status}`);
  }
  assert(refused, `${ceiling + 1} reads from one identity were all allowed`);
  assert(refused!.headers.get("retry-after"), "the refusal did not say how long to wait");

  // And the next identity is not paying for it: this is not an address bucket.
  const other = await signedCall(neighbour.pair.privateKey, neighbour.session_id, "GET", feedUrl());
  assertEquals(other.status, 200, "one identity's reading closed the feed for another");
  reset();
});

Deno.test("a page boundary inside one millisecond does not swallow a phrase", async () => {
  // The cursor is a pair, (visible_at, id), precisely so that a boundary
  // landing between two phrases published at the same instant keeps both. Its
  // first half was built from Date.getTime() — milliseconds — while the column
  // holds microseconds, so the pair guarded against a collision it could no
  // longer see: a cursor of …500123 went out as …500, and page two dropped
  // everything between …500000 and …500123 without a trace. Measured in a
  // container by the review panel's refuter, 2026-09-21; this is the same
  // measurement, against the route.
  const { reset } = await import("../src/lib/rate_limit.ts");
  const { quantise } = await import("../src/lib/feed_geo.ts");
  reset();
  const me = await author();
  const writer = await author();

  // Its own patch of the world. These rows are dated in the future and there
  // are thirty-one of them, so left at the shared coordinates they would push
  // every other case's phrase off the first page — which is exactly what they
  // did on the first run.
  const here = { lat: 48.2, lon: 16.37 };
  const at = quantise(here, 1000);

  // Thirty-one rows so the first page ends exactly between row 30 and row 31,
  // and the two that straddle the boundary share a millisecond.
  // Tomorrow, worked out when the case runs. The first version wrote the date
  // it was written on, 2026-09-21T09:00, and four hours of life made that the
  // past by the afternoon: every row had expired, the page came back empty,
  // and the case failed on its page-size check rather than on what it guards.
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const base = `${tomorrow}T09:00:00`;
  const stamps: string[] = [];
  for (let i = 0; i < 29; i++) stamps.push(`${base}.9${String(800 - i).padStart(5, "0")}Z`);
  stamps.push(`${base}.500900Z`); // row 30 — last on page one
  stamps.push(`${base}.500123Z`); // row 31 — same millisecond, smaller microsecond
  const ids: string[] = [];
  // The stamp goes into the statement itself rather than through a parameter.
  // Measured 2026-09-21: postgres.js turns a parameter that looks like a
  // timestamp into a JS Date on the way out, and a Date has milliseconds, so
  // ".500900" arrived as ".500000" and the case could not set up the very
  // collision it exists to measure. The values here are constants written
  // three lines above, not input.
  for (const stamp of stamps) {
    const id = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, $3, 'alone', 'und', $4, $5, 1000, $6, $7,
               '${stamp}'::timestamptz,
               '${stamp}'::timestamptz + interval '4 hours')`,
      [id, writer.identity_id, `фраза ${ids.length}`,
       here.lat, here.lon, at.lat, at.lon],
    );
    ids.push(id);
  }
  const straddling = ids[ids.length - 1];

  const there = feedUrl({ lat: here.lat, lon: here.lon });
  const first = await signedCall(me.pair.privateKey, me.session_id, "GET", there);
  const page = first.body as { items: Array<{ id: string }>; next: string | null };
  assertEquals(page.items.length, 30, "the page size changed; this case assumes thirty");
  assert(page.next, "a full page came back without a cursor");

  const second = await signedCall(
    me.pair.privateKey,
    me.session_id,
    "GET",
    feedUrl({ lat: here.lat, lon: here.lon, after: page.next! }),
  );
  const rest = (second.body as { items: Array<{ id: string }> }).items;
  assert(
    rest.find((item) => item.id === straddling),
    "the phrase sharing a millisecond with the page boundary was never delivered on either page",
  );
  reset();
});

Deno.test("an identity with no counters row can still publish", async () => {
  // The counters row is written by registration and by nothing else, so an
  // identity older than db/025 has none — and a missing row was answered with
  // "four live phrases already", for ever, from an identity that had never
  // published anything. A permanent ban wearing the words of a temporary
  // ceiling. Found by the data lens of the review panel, 2026-09-21.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const me = await author();

  // The state db/025 left behind, reproduced exactly: the identity is there
  // and its counters row is not.
  await database.queryOrThrow(`DELETE FROM identity_stats WHERE identity = $1`, [me.identity_id]);
  const [gone] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(gone.n, "0", "the counters row did not go away; the case is testing nothing");

  const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase());
  assertEquals(
    sent.status,
    202,
    `an identity with no counters row was refused: ${JSON.stringify(sent.body)}`,
  );

  // And the row is there afterwards, so the ceiling is countable from now on
  // and FOR UPDATE has something to lock.
  const [back] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(back.n, "1", "publishing did not leave a counters row behind");
  reset();
});

Deno.test("choosing a language does not empty the feed while no phrase has one", async () => {
  // Every phrase is stored with lang 'und' — the insert says the column is
  // "rewritten at the verdict" and the verdict rewrites nothing, because the
  // detector of §8.14 does not exist yet. The filter compared the viewer's
  // languages against that column, so the first person to choose a language
  // would have seen an empty feed for ever, with the radius growth unable to
  // help: it grows the radius, not the filter. No route writes
  // identities.languages today, which is what makes this a mine rather than a
  // fire. Found by the data lens of the review panel, 2026-09-21.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const me = await author();
  const writer = await author();
  const spot = { lat: 50.45, lon: 30.52 };
  const id = await livePhrase({ pair: writer.pair.privateKey, session_id: writer.session_id }, {
    text: "фраза без определённого языка",
    lat: spot.lat,
    lon: spot.lon,
  });

  // The state a PATCH /identity would put this identity in, once there is one.
  await database.queryOrThrow(
    `UPDATE identities SET languages = ARRAY['ru'] WHERE id = $1`,
    [me.identity_id],
  );

  const seen = await signedCall(
    me.pair.privateKey,
    me.session_id,
    "GET",
    feedUrl({ lat: spot.lat, lon: spot.lon }),
  );
  const items = (seen.body as { items: Array<{ id: string }> }).items;
  assert(
    items.find((item) => item.id === id),
    "choosing a language emptied the feed of phrases whose language nobody has determined",
  );

  const density = await signedCall(
    me.pair.privateKey,
    me.session_id,
    "GET",
    `/feed/density?lat=${spot.lat}&lon=${spot.lon}&radius=1000`,
  );
  assert(
    (density.body as { step: string }).step !== "none",
    "the density handle said nobody was here to a viewer who chose a language",
  );
  reset();
});

Deno.test("a widening asks through the box index, not through the whole table", async () => {
  // Measured on a million phrases (scripts/measure-feed-geo.sh, 2026-09-21): a
  // widening happens only after an empty answer, and in the empty case the
  // BETWEEN form walks feed_cursor over every row in the table — 468 ms per
  // attempt, up to five attempts. The box form over db/029's GiST index answers
  // in 63 ms. This checks the planner actually takes that index for the form
  // the route now sends; with enable_seqscan off a small test table still
  // shows which index the query *can* use, which is the property that matters.
  const rows = await database.transaction(async (run) => {
    await run(`SET LOCAL enable_seqscan = off`);
    await run(`SET LOCAL enable_bitmapscan = on`);
    return await run<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT f.id FROM feed_messages f
        WHERE f.visible_at IS NOT NULL
          AND point(f.lon_published, f.lat_published) <@
              box(point(12.4::float8, 41.8::float8), point(12.6::float8, 42.0::float8))`,
    );
  });
  const text = rows.map((r) => r["QUERY PLAN"]).join("\n");
  assert(
    text.includes("feed_live_geo_box"),
    `the widening query does not reach the box index:\n${text}`,
  );
});

Deno.test("a capped density count still reaches the top step", async () => {
  // The count now stops at the first number that decides the answer — a
  // hundred and a million both read "hundreds" — because measured on a million
  // phrases the full count cost twice the capped one, on a handle a slider
  // calls on every move. The promise that must survive the cap: a hundred or
  // more is still "hundreds". A cap one short of the last step would quietly
  // turn every crowded place into "tens".
  const { reset } = await import("../src/lib/rate_limit.ts");
  const { quantise } = await import("../src/lib/feed_geo.ts");
  reset();
  const me = await author();
  const writer = await author();
  const here = { lat: 55.75, lon: 37.62 };
  const at = quantise(here, 1000);

  for (let i = 0; i < 120; i++) {
    await database.queryOrThrow(
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, 'толпа', 'alone', 'und', $3, $4, 1000, $5, $6,
               now(), now() + interval '4 hours')`,
      [crypto.randomUUID(), writer.identity_id, here.lat, here.lon, at.lat, at.lon],
    );
  }

  const seen = await signedCall(
    me.pair.privateKey,
    me.session_id,
    "GET",
    `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`,
  );
  assertEquals(
    (seen.body as { step: string }).step,
    "hundreds",
    "a hundred and twenty phrases in one place did not read as hundreds",
  );
  reset();
});

Deno.test("the old node can still publish while db/027 is applied", async () => {
  // The wizard migrates in the new image while the old node is still serving,
  // then swaps containers. The old node's INSERT does not name lat_published or
  // lon_published; when 027 made them NOT NULL, every phrase the old node took
  // during that window failed, and after a rollback of the image every phrase
  // failed for good. Found by the operations and data lenses of the second
  // review panel, 2026-09-21. The old INSERT, verbatim in its column list:
  const writer = await author();
  const id = crypto.randomUUID();
  const written = await database.query(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        discount_value, conditions)
     VALUES ($1, 'xor', $2, 'старый узел', 'alone', 'und', 41.9, 12.5, 1000, NULL, NULL)`,
    [id, writer.identity_id],
  );
  assert(written !== null, "an INSERT that does not name the published columns was refused");
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE id = $1`, [id]);
});

Deno.test("the backfill in db/027 rounds exactly as quantise does", async () => {
  // The migration carries a second implementation of the grid, and the first
  // version of it disagreed with the TypeScript: PostgreSQL's round() on a
  // double rounds halves to even, Math.round rounds them up, and an integer
  // radius divided by 111320.0 went through numeric. Measured by the data lens
  // of the second review panel on 20 040 points. This runs the migration's own
  // UPDATE statement, read out of the file, so a later edit to either side is
  // caught rather than trusted.
  const { quantise } = await import("../src/lib/feed_geo.ts");
  const text = await Deno.readTextFile(
    new URL("../db/027_feed_published_centre.sql", import.meta.url),
  );
  const statement = text.slice(
    text.indexOf("UPDATE feed_messages SET"),
    text.indexOf("WHERE lat_published IS NULL;") + "WHERE lat_published IS NULL".length,
  );
  assert(statement.startsWith("UPDATE"), "the backfill statement was not found in db/027");

  const writer = await author();
  // Exact halves of a step, which is where the two roundings part, plus
  // ordinary points — for every radius the product offers.
  const cases: Array<{ lat: number; lon: number; r: number }> = [];
  for (const r of [100, 300, 1000, 3000, 10000]) {
    const step = r / 111320;
    for (const k of [2.5, 7.5, -3.5, 101.5]) cases.push({ lat: k * step, lon: 12.5, r });
    for (let i = 0; i < 6; i++) cases.push({ lat: 35 + Math.random() * 20, lon: -10 + Math.random() * 40, r });
  }
  const ids: string[] = [];
  for (const c of cases) {
    const id = crypto.randomUUID();
    ids.push(id);
    await database.queryOrThrow(
      // Published rows: feed_one_waiting allows one phrase per author in the
      // queue, and this case needs dozens from one author.
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          visible_at, expires_at)
       VALUES ($1, 'xor', $2, 'сетка', 'alone', 'und', $3, $4, $5,
               now(), now() + interval '4 hours')`,
      [id, writer.identity_id, c.lat, c.lon, c.r],
    );
  }
  await database.queryOrThrow(`${statement} AND id = ANY($1::uuid[])`, [ids]);

  const rows = await database.queryOrThrow<{ id: string; lat_published: number; lon_published: number }>(
    `SELECT id, lat_published, lon_published FROM feed_messages WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const differ: string[] = [];
  cases.forEach((c, i) => {
    const want = quantise({ lat: c.lat, lon: c.lon }, c.r);
    const got = byId.get(ids[i])!;
    // The latitude is plain arithmetic and must match bit for bit — this is
    // where the rounding of halves showed. The longitude goes through cos(),
    // and PostgreSQL and V8 are different implementations of it: the first run
    // of this case found them apart in the last bit on 5 of 50 points, never
    // in the cell. So the cell is compared exactly and the value to within a
    // few units in the last place (1e-9 degrees is about a tenth of a
    // millimetre).
    const cosLat = Math.cos((want.lat * Math.PI) / 180);
    const dLambda = c.r / (111320 * cosLat);
    const cellWant = Math.round(want.lon / dLambda);
    const cellGot = Math.round(got.lon_published / dLambda);
    if (got.lat_published !== want.lat || cellGot !== cellWant ||
        Math.abs(got.lon_published - want.lon) > 1e-9) {
      differ.push(`r=${c.r} lat=${c.lat}: sql ${got.lat_published},${got.lon_published} ts ${want.lat},${want.lon}`);
    }
  });
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE id = ANY($1::uuid[])`, [ids]);
  assertEquals(differ, [], `the SQL backfill and quantise disagree on ${differ.length} of ${cases.length}`);
});

Deno.test("the density handle is limited per identity, a hundred an hour", async () => {
  // The owner's decision of 2026-09-21: feed.density.burst is a hundred an
  // hour per identity, a sliding window — not "a hundred in a row", which six
  // places in the documents said while the node counted an hour. The handle is
  // asked on release, so a hundred gestures an hour is ample for a person; the
  // hundred-and-first is a profile being taken. Nothing tested the 429 at all
  // until the second review panel noticed.
  const { FEED_DENSITY_LIMITS, reset } = await import("../src/lib/rate_limit.ts");
  reset();
  assertEquals(FEED_DENSITY_LIMITS[0].windowMs, 60 * 60 * 1000, "the density window is not an hour");
  const me = await author();
  const neighbour = await author();
  const ceiling = FEED_DENSITY_LIMITS[0].max;
  const url = "/feed/density?lat=41.9&lon=12.5&radius=1000";

  let refused: { status: number; headers: Headers } | null = null;
  for (let i = 0; i < ceiling + 1; i++) {
    const answer = await signedCall(me.pair.privateKey, me.session_id, "GET", url);
    if (answer.status === 429) {
      refused = answer;
      assertEquals(i, ceiling, `the handle refused after ${i} questions, not after ${ceiling}`);
      break;
    }
    assertEquals(answer.status, 200, `question ${i} was answered ${answer.status}`);
  }
  assert(refused, `${ceiling + 1} density questions from one identity were all answered`);
  assert(refused!.headers.get("retry-after"), "the refusal did not say how long to wait");

  const other = await signedCall(neighbour.pair.privateKey, neighbour.session_id, "GET", url);
  assertEquals(other.status, 200, "one identity's questions closed the handle for another");
  reset();
});

Deno.test("the hundred-and-first statement of reasons reaches its author", async () => {
  // Article 17(1): every restriction is explained to the person it happened to.
  // The route used to stop at a hundred with no cursor, so the hundred-and-first
  // could never be read by any call (open-work P3). All of them are written by
  // one statement here, so they share created_at to the microsecond — the page
  // boundary has only the id to go on, which is what the pair is for.
  const me = await author();
  await database.queryOrThrow(
    `INSERT INTO dsa_statements
       (brand, target_id, recipient_identity, restriction, facts,
        ground_kind, ground_text, automated_used)
     SELECT 'alpha', gen_random_uuid()::text, $1, 'removed', 'Фраза ' || n,
            'contractual', 'Условия, п. 8', false
       FROM generate_series(1, 101) AS n`,
    [me.identity_id],
  );

  const first = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  assertEquals(first.status, 200, JSON.stringify(first.body));
  const one = first.body as { items: Array<{ id: string }>; next?: string };
  assertEquals(one.items.length, 100, "the page size changed; this case assumes a hundred");
  assert(one.next, "a full page of statements came back without a cursor");

  const second = await signedCall(
    me.pair.privateKey, me.session_id, "GET", `/statements?after=${encodeURIComponent(one.next!)}`,
  );
  assertEquals(second.status, 200, JSON.stringify(second.body));
  const two = second.body as { items: Array<{ id: string }>; next?: string };
  assertEquals(two.items.length, 1, "the second page did not carry exactly the one left over");
  assertEquals("next" in two, false, "the last page still offered a cursor");

  const seen = new Set([...one.items, ...two.items].map((i) => i.id));
  assertEquals(seen.size, 101, "a statement was shown twice or not at all");

  const [undelivered] = await database.queryOrThrow<{ count: string }>(
    `SELECT count(*)::text AS count FROM dsa_statements
      WHERE recipient_identity = $1 AND delivered_at IS NULL`,
    [me.identity_id],
  );
  assertEquals(undelivered.count, "0", "a statement that was read is not marked delivered");
});

Deno.test("a cursor that is not one from this route is refused", async () => {
  const me = await author();
  const bad = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements?after=yesterday");
  assertEquals(bad.status, 400);
  assertEquals((bad.body as { error: { code: string } }).error.code, "invalid_body");
});

// ── Likes (chat spec §8.4) and the match they make (§8.5) ──────────────────────
// Phrases are written straight into the table at their own spot, so these cases
// neither wait for a moderator nor land on another case's feed.
async function seedPhrase(identity: string, text: string, mode = "alone"): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'xor', $2, $3, $4, 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now(), now() + interval '3 hours')`,
    [id, identity, text, mode],
  );
  return id;
}
const like = (who: { pair: CryptoKeyPair; session_id: string }, phraseId: string) =>
  signedCall(who.pair.privateKey, who.session_id, "POST", `/feed/${phraseId}/like`);
const stateOf = (r: { body: unknown }) => (r.body as { state?: string }).state;
async function likeCount(id: string): Promise<number> {
  const [row] = await database.queryOrThrow<{ like_count: number }>(
    `SELECT like_count FROM feed_messages WHERE id = $1`, [id]);
  return Number(row.like_count);
}

Deno.test("a like counts once, and a double tap adds nothing", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");

  const first = await like(a, theirs);
  assertEquals(first.status, 200, JSON.stringify(first.body));
  assertEquals(stateOf(first), "liked");
  const again = await like(a, theirs);
  assertEquals(stateOf(again), "liked");
  assertEquals(await likeCount(theirs), 1, "a double tap counted twice");

  const stats = await database.queryOrThrow<{ identity: string; likes_given: number; likes_received: number }>(
    `SELECT identity, likes_given, likes_received FROM identity_stats WHERE identity = ANY($1::uuid[])`,
    [[a.identity_id, b.identity_id]],
  );
  const by = Object.fromEntries(stats.map((r) => [r.identity, r]));
  assertEquals(Number(by[a.identity_id].likes_given), 1, "the liker's count did not move");
  assertEquals(Number(by[b.identity_id].likes_received), 1, "the author's count did not move");
  reset();
});

Deno.test("liking back makes a match with both phrases in it", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?", "company");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");

  assertEquals(stateOf(await like(a, theirs)), "liked");
  const back = await like(b, mine);
  assertEquals(back.status, 200, JSON.stringify(back.body));
  assertEquals(stateOf(back), "matched", "a mutual like did not make a match");
  const matchId = (back.body as { match_id?: string }).match_id;
  assert(matchId, "a match came back without its id");

  const people = await database.queryOrThrow<{ identity: string; text_snapshot: string; mode: string }>(
    `SELECT identity, text_snapshot, mode FROM match_participants WHERE match_id = $1`, [matchId],
  );
  assertEquals(people.length, 2, "the match does not hold both sides");
  const snap = Object.fromEntries(people.map((p) => [p.identity, p]));
  assertEquals(snap[a.identity_id].text_snapshot, "кто на набережную?");
  assertEquals(snap[a.identity_id].mode, "company");
  assertEquals(snap[b.identity_id].text_snapshot, "гуляю у залива");
  reset();
});

Deno.test("a like with no live phrase of one's own is refused, not swallowed", async () => {
  // §8.4: such a like could never become a match, so taking it quietly would
  // be a like that goes nowhere without the person ever knowing.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  const refused = await like(a, theirs);
  assertEquals(refused.status, 409, JSON.stringify(refused.body));
  assertEquals((refused.body as { error: { code: string } }).error.code, "refused");
  assertEquals(await likeCount(theirs), 0);
  reset();
});

Deno.test("a like the rules forbid answers exactly like one that counted", async () => {
  // Different answers would be an oracle: blocked, out of band and one's own
  // phrase would each be told apart from a like that went in (§8.4, §8.9).
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const blocked = await author();
  const young = await author(15);
  const own = await seedPhrase(a.identity_id, "своя фраза");
  const theirs = await seedPhrase(blocked.identity_id, "фраза того, кого заблокировали");
  const teen = await seedPhrase(young.identity_id, "фраза из другой полосы");
  await database.queryOrThrow(
    `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [blocked.identity_id, a.identity_id],
  );
  for (const [target, why] of [[own, "self"], [theirs, "blocked"], [teen, "band"]] as const) {
    const answer = await like(a, target);
    assertEquals(answer.status, 200, `${why}: ${JSON.stringify(answer.body)}`);
    assertEquals(answer.body, { state: "liked" }, `${why}: the answer tells this case apart`);
    assertEquals(await likeCount(target), 0, `${why}: the like went in`);
  }
  reset();
});


const unlike = (who: { pair: CryptoKeyPair; session_id: string }, phraseId: string) =>
  signedCall(who.pair.privateKey, who.session_id, "DELETE", `/feed/${phraseId}/like`);

Deno.test("a like taken back gives back its counts", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  assertEquals(stateOf(await like(a, theirs)), "liked");
  const back = await unlike(a, theirs);
  assertEquals(back.status, 200, JSON.stringify(back.body));
  assertEquals(back.body, { state: "unliked" }, "a like taken back did not say so");
  assertEquals(await likeCount(theirs), 0, "like_count did not go back");
  const [given] = await database.queryOrThrow<{ n: number }>(
    `SELECT likes_given AS n FROM identity_stats WHERE identity = $1`, [a.identity_id]);
  assertEquals(Number(given.n), 0, "likes_given did not go back");
  const again = await unlike(a, theirs);
  assertEquals(again.body, { state: "unliked" }, "taking back a like that is not there answered differently");
  assertEquals(await likeCount(theirs), 0, "a second take-back went below the truth");
  reset();
});

Deno.test("a like that made a match cannot be taken back: spent", async () => {
  // §8.4: the like is withdrawn only while no match came of it; once the pair
  // has a match the answer is spent and nothing moves.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  await like(a, theirs);
  assertEquals(stateOf(await like(b, mine)), "matched");
  const back = await unlike(a, theirs);
  assertEquals(back.status, 200, JSON.stringify(back.body));
  assertEquals(back.body, { state: "spent" }, "a like with a match behind it was taken back");
  assertEquals(await likeCount(theirs), 1, "the like under a match was removed");
  reset();
});

Deno.test("a block hides each one's phrases from the other, in the feed and in its density", async () => {
  // §8.9: "phrases are shown to neither of them". Until 030 there was no
  // blocks table to read; the likes review panel (2026-09-21, security lens)
  // found the feed still showing them — and a like_count that did not move
  // after a like was then how the blocked person could tell.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const here = { lat: 64.14, lon: -21.94 };
  const { quantise } = await import("../src/lib/feed_geo.ts");
  const at = quantise(here, 1000);
  const put = async (who: string, text: string) => {
    const id = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, $3, 'alone', 'und', $4, $5, 1000, $6, $7, now(), now() + interval '3 hours')`,
      [id, who, text, here.lat, here.lon, at.lat, at.lon],
    );
    return id;
  };
  const fromA = await put(a.identity_id, "фраза А");
  const fromB = await put(b.identity_id, "фраза Б");
  const sees = async (who: typeof a, id: string) => {
    const got = await signedCall(who.pair.privateKey, who.session_id, "GET", feedUrl(here));
    assertEquals(got.status, 200, JSON.stringify(got.body));
    return (got.body as { items: Array<{ id: string }> }).items.some((i) => i.id === id);
  };
  const density = async (who: typeof a) => {
    const got = await signedCall(who.pair.privateKey, who.session_id, "GET",
      `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`);
    return (got.body as { step: string }).step;
  };
  assert(await sees(a, fromB), "before the block A did not see B at all — the case proves nothing");
  assert(await sees(b, fromA), "before the block B did not see A at all — the case proves nothing");

  await database.queryOrThrow(
    `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [b.identity_id, a.identity_id],
  );
  assert(!(await sees(a, fromB)), "the blocked one still sees the blocker's phrase");
  assert(!(await sees(b, fromA)), "the blocker still sees the blocked one's phrase");

  // Density counts one's own phrase too, so A's goes before the count: what is
  // left at the spot is B's alone, which A must no longer be told about.
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE id = $1`, [fromA]);
  assertEquals(await density(a), "none", "density still counts a blocked author's phrase");
  await database.queryOrThrow(`DELETE FROM blocks WHERE blocker_identity = $1`, [b.identity_id]);
  assert((await density(a)) !== "none", "without the block B's phrase does not count — the case proves nothing");
  reset();
});

Deno.test("an expired match nobody swept does not hold a like for ever", async () => {
  // Likes review panel, 2026-09-21 (data and security lenses): spent counted
  // any match row of the pair, and nothing sweeps matches yet.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  await like(a, theirs);
  const { sha256hex } = await import("../src/lib/identity_auth.ts");
  const [lo, hi] = [a.identity_id, b.identity_id].sort();
  const pk = await sha256hex(new TextEncoder().encode(`${lo}:${hi}`));
  await database.queryOrThrow(
    `INSERT INTO matches (id, pair_key, expires_at) VALUES ($1, $2, now() - interval '1 hour')`,
    [crypto.randomUUID(), pk],
  );
  const back = await unlike(a, theirs);
  assertEquals(back.body, { state: "unliked" }, "an expired match still held the like");
  assertEquals(await likeCount(theirs), 0);
  reset();
});

Deno.test("a like on an offer cannot be taken back", async () => {
  // §8.4 and screens 5 and 25: a like on an offer makes its match at once and
  // is not taken back. The one-sided match is not built yet, so without this
  // the like went back as if it were a phrase's.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const offer = await seedPhrase(b.identity_id, "отдам две табуретки");
  await database.queryOrThrow(`UPDATE feed_messages SET discount_value = '100%' WHERE id = $1`, [offer]);
  assertEquals(stateOf(await like(a, offer)), "liked");
  const back = await unlike(a, offer);
  assertEquals(back.body, { state: "spent" }, "a like on an offer was taken back");
  assertEquals(await likeCount(offer), 1);
  reset();
});

Deno.test("spent holds the phrase a match came from, not every phrase of that person", async () => {
  // Owner's decision, 2026-09-21: per phrase, as screen 25 says, not per pair.
  // The match takes B's phrase that A liked last (§8.5), so A's like on the
  // other one of B's phrases stays A's to take back.
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const first = await seedPhrase(b.identity_id, "первая фраза Б");
  const second = await seedPhrase(b.identity_id, "вторая фраза Б");
  await like(a, first);
  await like(a, second);
  const back = await like(b, mine);
  assertEquals(stateOf(back), "matched");
  const [matched] = await database.queryOrThrow<{ message_id: string }>(
    `SELECT message_id FROM match_participants WHERE match_id = $1 AND identity = $2`,
    [(back.body as { match_id: string }).match_id, b.identity_id],
  );
  const other = matched.message_id === first ? second : first;
  assertEquals((await unlike(a, matched.message_id)).body, { state: "spent" });
  assertEquals((await unlike(a, other)).body, { state: "unliked" },
    "a like on a phrase no match came from was held by the pair's match");
  reset();
});

Deno.test({
  name: "the three hundred and first like or take-back in an hour is refused",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // limits.tsv like.hour — a brake for a script, never a person (owner,
    // 2026-09-21). A take-back of nothing is the cheapest call to count with.
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const ghost = crypto.randomUUID();
    for (let i = 0; i < 300; i++) {
      const r = await unlike(a, ghost);
      assertEquals(r.status, 200, `call ${i + 1} of 300 was refused`);
    }
    const over = await unlike(a, ghost);
    assertEquals(over.status, 429, "the 301st call in an hour went through");
    assert(over.headers.get("retry-after"), "the limit did not say when to come back");
    reset();
  },
});

Deno.test("an expired match is swept with its snapshots, a live one is not", async () => {
  // Likes review panel, 2026-09-21: nothing swept matches, and each expired row
  // kept two snapshots of other people's phrases with no term at all.
  const { sweepExpiredMatches } = await import("../src/lib/match_sweeper.ts");
  const a = await author();
  const b = await author();
  const make = async (interval: string) => {
    const id = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO matches (id, pair_key, expires_at) VALUES ($1, $2, now() + $3::interval)`,
      [id, `sweep-${id}`, interval],
    );
    for (const who of [a.identity_id, b.identity_id]) {
      await database.queryOrThrow(
        `INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
         VALUES ($1, $2, $3, 'снимок чужой фразы', 'alone')`,
        [id, who, crypto.randomUUID()],
      );
    }
    return id;
  };
  const dead = await make("-1 minute");
  const alive = await make("1 hour");
  const swept = await sweepExpiredMatches();
  assert(swept >= 1, "the sweep reported nothing swept");
  const left = await database.queryOrThrow<{ match_id: string }>(
    `SELECT match_id FROM match_participants WHERE match_id = ANY($1::uuid[])`, [[dead, alive]],
  );
  assertEquals(left.filter((r) => r.match_id === dead).length, 0, "an expired match kept its snapshots");
  assertEquals(left.filter((r) => r.match_id === alive).length, 2, "a live match lost its participants");
});
