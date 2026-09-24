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
await import("../src/routes/matches.ts");
await import("../src/routes/chats.ts");
await import("../src/routes/inbox.ts");
await import("../src/routes/blocks.ts");
await import("../src/routes/hidden.ts");
await import("../src/routes/feed_queue.ts");
await import("../src/routes/profile.ts");
await import("../src/routes/support.ts");
await import("../src/routes/support_admin.ts");
await import("../src/routes/away.ts");

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

async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
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
      ...extra,
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

// The first pass after a long stop meets the whole backlog. One DELETE over it
// held a lock per row until the last one went, as the other sweepers learned
// (lib/identity_sweeper.ts, BATCH): this one goes in batches too, and a pass
// ends at its ceiling, leaving the rest for the next minute (loop plan A11).
Deno.test("expired phrases go in batches, and a pass stops at its ceiling", async () => {
  await verdict.sweepExpiredPhrases();
  const me = await author();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    ids.push(await livePhrase({ pair: me.pair.privateKey, session_id: me.session_id }, { text: `старая ${i}` }));
    // Expired at once, so four live phrases is never the limit this case meets.
    await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [ids[i]]);
    await database.queryOrThrow(`UPDATE identity_stats SET published_at_recent = '{}' WHERE identity = $1`, [me.identity_id]);
  }
  const left = async () => Number((await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM feed_messages WHERE id = ANY($1::uuid[])`, [ids]))[0].n);

  assertEquals(await verdict.sweepExpiredPhrases({ batch: 2, maxBatches: 1 }), 2, "a pass took more than its ceiling");
  assertEquals(await left(), 3);
  assertEquals(await verdict.sweepExpiredPhrases({ batch: 2 }), 3, "an unbounded pass left some behind");
  assertEquals(await left(), 0);
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

// The feed's and the likes' cursors are sealed (lib/cursor.ts, §8.11): the
// pair inside is the last row's instant to the microsecond — for the feed,
// another person's publication and so their end — and only a cursor the pool
// issued for that list opens (the owner's decision of 2026-09-24).
Deno.test("a page cursor says nothing, and only one issued for that list opens", async () => {
  const { sealCursor } = await import("../src/lib/cursor.ts");
  const me = await author();
  const id = crypto.randomUUID();
  const micros = String(Date.now() * 1000 + 123);
  const feedCursor = await sealCursor("feed", micros, id);
  assert(!feedCursor.includes(micros.slice(0, 10)) && !feedCursor.includes(id.slice(0, 8)),
    "the cursor carries its instant or its id in the clear");
  assertEquals(feedCursor === await sealCursor("feed", micros, id), false, "two seals of one pair came out alike");

  const feedAt = async (after: string) =>
    (await signedCall(me.pair.privateKey, me.session_id, "GET", feedUrl({ after }))).status;
  const likesAt = async (after: string) =>
    (await signedCall(me.pair.privateKey, me.session_id, "GET", `/likes?after=${encodeURIComponent(after)}`)).status;
  assertEquals(await feedAt(feedCursor), 200, "a cursor the node issued was refused");
  assertEquals(await likesAt(await sealCursor("likes", micros, id)), 200, "a likes cursor the node issued was refused");

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const flipped = feedCursor.slice(0, 20) + (feedCursor[20] === "A" ? "B" : "A") + feedCursor.slice(21);
  for (const [name, bad] of [
    ["the old clear pair", `${micros}_${id}`],
    ["an edited cursor", flipped],
    // The last character carries spare bits of base64: a cursor spelled
    // another way is not the one issued (verifier, 2026-09-24).
    ["its last character changed in the spare bits", feedCursor.slice(0, -1) + B64[B64.indexOf(feedCursor.at(-1)!) ^ 1]],
    ["a likes cursor", await sealCursor("likes", micros, id)],
  ]) {
    assertEquals(await feedAt(bad), 400, `the feed took ${name}`);
  }
  assertEquals(await likesAt(feedCursor), 400, "the likes took a feed cursor");
  assertEquals(await likesAt(`${micros}_${id}`), 400, "the likes took the old clear pair");
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

// Crossing likes make exactly one match (§8.4). The route's own comment says
// why a route-only test proves nothing: in one process the two transactions
// never overlap where it matters. So one side is played on its own connection,
// step by step, the way the route does it: the pair lock, the like, and a
// commit only after the other side's request has started (loop plan A12).
Deno.test({
  name: "a like crossing another under the pair lock still makes the match",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const { pairKey } = await import("../src/routes/likes.ts");
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    const mine = await seedPhrase(a.identity_id, "встречный лайк А");
    const theirs = await seedPhrase(b.identity_id, "встречный лайк Б");
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    const got: { back?: { status: number; body: unknown } } = {};
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [await pairKey(a.identity_id, b.identity_id)]);
        await tx.unsafe(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [a.identity_id, theirs]);
        const pending = like(b, mine).then((r) => (got.back = r));
        // Commit only once the other request is seen waiting on this pair
        // lock; a fixed pause let a slow start come after the commit, and the
        // case went green with nothing crossing.
        let waited = false;
        for (let i = 0; i < 250 && !waited && !got.back; i++) {
          // Asked on this side's own connection: a pool query here would open
          // a connection the next cases count as a leak.
          const [row] = await tx.unsafe(
            `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`);
          waited = row.n > 0;
          if (!waited) await new Promise((r) => setTimeout(r, 20));
        }
        assert(waited, "the other like never waited on the pair lock, so nothing crossed");
        void pending;
      });
      for (let i = 0; i < 150 && !got.back; i++) await new Promise((r) => setTimeout(r, 20));
      assert(got.back, "the crossing like never answered");
      assertEquals(stateOf(got.back), "matched", `a crossing like lost the match: ${JSON.stringify(got.back.body)}`);
    } finally {
      await sql.end();
      reset();
    }
  },
});

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

Deno.test({
  name: "a like that waits on a held author row gives up in seconds, not in fifteen",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Likes panel, 2026-09-21, operations lens: a flood of likes on one author
    // queued on that author's identity_stats row, four connections waited out
    // the fifteen-second statement timeout, and every other route waited for a
    // connection. lock_timeout makes a like give up while the pool is still free.
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    await seedPhrase(a.identity_id, "кто на набережную?");
    const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
    const got: { status?: number; took?: number } = {};
    await database.transaction(async (tx) => {
      await tx(`SET LOCAL statement_timeout = 0`);
      await tx(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [b.identity_id]);
      const started = Date.now();
      const pending = like(a, theirs).then((r) => { got.status = r.status; got.took = Date.now() - started; });
      await tx(`SELECT pg_sleep(4)`);
      return { pending };
    }).then(({ pending }) => pending);
    assert(got.status !== undefined, "the like never answered");
    assertEquals(got.status, 503, `a like waited out the held row and answered ${got.status} after ${got.took} ms`);
    assert((got.took ?? 0) < 3500, `it gave up only after ${got.took} ms`);
    reset();
  },
});

// ── Consent to a match (§8.5, screens 6 and 7) ─────────────────────────────────
async function freshMatch() {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  await like(a, theirs);
  const back = await like(b, mine);
  assertEquals(stateOf(back), "matched", "the setup did not make a match");
  return { a, b, id: (back.body as { match_id: string }).match_id };
}
const matchCall = (who: { pair: CryptoKeyPair; session_id: string }, method: string, path: string, body?: unknown) =>
  signedCall(who.pair.privateKey, who.session_id, method, path, body);
// The ephemeral half of §8.13, signed over "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI
// so the node cannot carry it from one match to another (panel 2026-09-22).
const HALF_DOMAIN = "xor.ephemeral.v1\n";
async function halfFor(who: { pair: CryptoKeyPair }, matchId: string, spki?: string) {
  const key = spki ?? auth.bytesToBase64url(new Uint8Array(await crypto.subtle.exportKey(
    "spki", ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair).publicKey)));
  const prefix = new TextEncoder().encode(HALF_DOMAIN + matchId + "\n");
  const raw = auth.base64urlToBytes(key)!;
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix); bytes.set(raw, prefix.length);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
  return { ephemeral_public_key: key, ephemeral_signature: auth.bytesToBase64url(signature) };
}
const consent = async (who: { pair: CryptoKeyPair; session_id: string }, matchId: string) =>
  matchCall(who, "POST", `/matches/${matchId}/consent`, await halfFor(who, matchId));

// The half belongs to the session that published it (open.tsv
// chat.queue.epk-session; chat spec §8.2, 18.09.2026). A move freezes that
// session before the second press, and its private half stays on the old
// device: a chat opened with it would open with a key nobody can derive. So
// the freeze takes back the half and the consent with it, the match waits
// again, and the new device consents with a half of its own (loop plan A13).
Deno.test({
  name: "a frozen session's half does not open the chat, and its consent is taken back",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { freezeSession } = await import("../src/lib/sessions.ts");
    const { a, b, id } = await freshMatch();
    assertEquals((await consent(a, id)).body, { state: "waiting" });
    const [stamped] = await database.queryOrThrow<{ ephemeral_session: string | null }>(
      `SELECT ephemeral_session FROM match_participants WHERE match_id = $1 AND identity = $2`, [id, a.identity_id]);
    assertEquals(stamped.ephemeral_session, a.session_id, "the half does not say which session published it");
    await database.transaction(async (run) => { await freezeSession(run, a.session_id, "transfer"); });
    const [taken] = await database.queryOrThrow<{ ephemeral_public_key: string | null; accepted_at: Date | null }>(
      `SELECT ephemeral_public_key, accepted_at FROM match_participants WHERE match_id = $1 AND identity = $2`, [id, a.identity_id]);
    assertEquals(taken.ephemeral_public_key, null, "a frozen session's half still stands");
    assertEquals(taken.accepted_at, null, "a consent without its half still stands");
    const second = await consent(b, id);
    assertEquals((second.body as { state: string }).state, "waiting", "the chat opened on a half nobody can derive with");
  },
});

// The two races a move can meet (panel 2026-09-24, security and data lenses,
// both reproduced). The freeze is the node's own, run in a transaction held
// open while a consent comes in, as a move holds it.
async function heldFreeze(sessionId: string, reason: "transfer" | "pin_limit", during: () => Promise<unknown>) {
  const { freezeSession } = await import("../src/lib/sessions.ts");
  const got: { answer?: { status: number; body: unknown } } = {};
  await database.transaction(async (run) => {
    await freezeSession(run, sessionId, reason);
    const pending = during().then((r) => (got.answer = r as { status: number; body: unknown }));
    await new Promise((r) => setTimeout(r, 400));
    void pending;
  });
  for (let i = 0; i < 150 && !got.answer; i++) await new Promise((r) => setTimeout(r, 20));
  assert(got.answer, "the consent never answered");
  return got.answer;
}

Deno.test({
  name: "a consent racing a freeze of its own session writes no half",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, id } = await freshMatch();
    const answer = await heldFreeze(a.session_id, "transfer", () => consent(a, id));
    const [row] = await database.queryOrThrow<{ ephemeral_public_key: string | null }>(
      `SELECT ephemeral_public_key FROM match_participants WHERE match_id = $1 AND identity = $2`, [id, a.identity_id]);
    assertEquals(row.ephemeral_public_key, null,
      `a frozen session's consent left a half nothing will take back (answer ${answer.status})`);
  },
});

Deno.test({
  name: "the other side's consent during a freeze opens no chat on the half it takes back",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, id } = await freshMatch();
    assertEquals((await consent(a, id)).body, { state: "waiting" });
    const answer = await heldFreeze(a.session_id, "transfer", () => consent(b, id));
    assertEquals((answer.body as { state?: string }).state, "waiting",
      `a chat opened on the half a move was taking back: ${JSON.stringify(answer.body)}`);
  },
});

// A PIN-limit freeze is lifted on the same device by the paper code, private
// halves and all: its consents stand.
Deno.test({
  name: "a PIN-limit freeze leaves the halves and the consent standing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { freezeSession } = await import("../src/lib/sessions.ts");
    const { a, id } = await freshMatch();
    await consent(a, id);
    await database.transaction(async (run) => { await freezeSession(run, a.session_id, "pin_limit"); });
    const [row] = await database.queryOrThrow<{ ephemeral_public_key: string | null; accepted_at: Date | null }>(
      `SELECT ephemeral_public_key, accepted_at FROM match_participants WHERE match_id = $1 AND identity = $2`, [id, a.identity_id]);
    assert(row.ephemeral_public_key, "a PIN-limit freeze took back a half its device still holds");
    assert(row.accepted_at, "a PIN-limit freeze took back a consent");
  },
});

Deno.test({
  name: "consent waits for the other side, and both make it agreed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
  const { a, b, id } = await freshMatch();
  const first = await consent(a, id);
  assertEquals(first.status, 200, JSON.stringify(first.body));
  assertEquals(first.body, { state: "waiting" });
  const second = await consent(b, id);
  const agreed = second.body as { state: string; chat_id?: string };
  assertEquals(agreed.state, "agreed", "both consented and the match did not say so");
  // Step 5 (§8.5, §8.6): agreement opens the chat in the same transaction.
  assert(agreed.chat_id, "both agreed and no chat was opened");
  const people = await database.queryOrThrow<{ identity: string }>(
    `SELECT identity FROM chat_participants WHERE chat_id = $1`, [agreed.chat_id]);
  assertEquals(people.length, 2, "the chat does not hold both sides");
  const starters = await database.queryOrThrow<{ text_snapshot: string }>(
    `SELECT text_snapshot FROM chat_starters WHERE chat_id = $1 ORDER BY position`, [agreed.chat_id]);
  assertEquals(starters.length, 2, "the chat's header does not carry both phrases");
  const [linked] = await database.queryOrThrow<{ chat_id: string }>(`SELECT chat_id FROM matches WHERE id = $1`, [id]);
  assertEquals(linked.chat_id, agreed.chat_id, "the match does not point at its chat");
}});

Deno.test({
  name: "a match that is not yours, or is over, answers not found",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
  const { id } = await freshMatch();
  const stranger = await author();
  const other = await consent(stranger, id);
  assertEquals(other.status, 404, "a stranger consented to someone else's match");
  const { a, id: gone } = await freshMatch();
  await database.queryOrThrow(`UPDATE matches SET expires_at = now() - interval '1 minute' WHERE id = $1`, [gone]);
  assertEquals((await consent(a, gone)).status, 404, "an expired match took a consent");
}});

Deno.test({
  name: "not now is written at once, can be undone, and consent clears it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
  const { a, id } = await freshMatch();
  const declined = await matchCall(a, "POST", `/matches/${id}/decline`);
  assertEquals(declined.status, 204, JSON.stringify(declined.body));
  const row = async () => (await database.queryOrThrow<{ accepted_at: Date | null; declined_at: Date | null }>(
    `SELECT accepted_at, declined_at FROM match_participants WHERE match_id = $1 AND identity = $2`,
    [id, a.identity_id]))[0];
  assert((await row()).declined_at, "not now was not written");
  assertEquals((await matchCall(a, "DELETE", `/matches/${id}/decline`)).status, 204);
  assertEquals((await row()).declined_at, null, "undoing not now left it written");
  await matchCall(a, "POST", `/matches/${id}/decline`);
  await consent(a, id);
  const after = await row();
  assertEquals(after.declined_at, null, "consent after not now left the decline standing");
  assert(after.accepted_at, "consent after not now was not written");
}});

// ── Chat messages through the node (§8.8) ─────────────────────────────────────
async function openChat() {
  const { a, b, id } = await freshMatch();
  await consent(a, id);
  const agreed = await consent(b, id);
  return { a, b, chat: (agreed.body as { chat_id: string }).chat_id };
}
const ciphertext = (n = 64) => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(n)));
async function queued(chat: string, sessionId: string): Promise<string[]> {
  const rows = await database.queryOrThrow<{ local_id: string }>(
    `SELECT local_id FROM pending_deliveries WHERE chat = $1 AND recipient_session = $2`, [chat, sessionId]);
  return rows.map((r) => r.local_id);
}

Deno.test({
  name: "a message waits in the other one's queue, once, and the answer does not say who is there",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const localId = crypto.randomUUID();
    const sent = await matchCall(a, "POST", `/chats/${chat}/messages`);
    assertEquals(sent.status, 400, "a message with no body was taken");
    const body = { local_id: localId, ciphertext: ciphertext() };
    const ok = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, body);
    assertEquals(ok.status, 202, JSON.stringify(ok.body));
    assertEquals(ok.body, { local_id: localId, accepted: true });
    await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, body);
    assertEquals(await queued(chat, b.session_id), [localId], "the recipient's queue is not exactly the one message");
    assertEquals(await queued(chat, a.session_id), [], "the sender queued a message to itself");
  },
});

// "No product" reaches the socket too: a room already open when its person
// stepped away is handed nothing while they are away — the lines wait in the
// queue and come when they are back (the owner's decision of 2026-09-24; the
// room itself stays open, 409 answers requests through it).
Deno.test({
  name: "a room of someone away is handed nothing, and gets what waited once they are back",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { pendingFor } = await import("../src/chat/relay.ts");
    const { a, b, chat } = await openChat();
    const localId = crypto.randomUUID();
    await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: localId, ciphertext: ciphertext() });
    assertEquals((await pendingFor(chat, b.session_id, null)).length, 1, "the fixture queued nothing");
    const away = await signedCall(b.pair.privateKey, b.session_id, "POST", "/away",
      { span: "short", nonce: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))) });
    assertEquals(away.status, 200, JSON.stringify(away.body));
    assertEquals((await pendingFor(chat, b.session_id, null)).length, 0, "a room of someone away would be handed the line");
    assertEquals((await pendingFor(chat, b.session_id, localId)).length, 0, "a new line would reach a room of someone away");
    assertEquals(await queued(chat, b.session_id), [localId], "the line left the queue instead of waiting");
    assertEquals((await signedCall(b.pair.privateKey, b.session_id, "DELETE", "/away")).status, 204);
    assertEquals((await pendingFor(chat, b.session_id, null)).map((r) => r.local_id), [localId], "coming back did not bring the line");
  },
});

// The wake itself, on the wire: a held room gets what waited only on a
// `chat_message` of "<chat>::<session>" (src/chat/relay.ts). A time away that
// runs out by itself sends it from the minute's job, once; an early return
// sends it from DELETE /away, and the job then says nothing (db/047).
Deno.test({
  name: "a time away that runs out wakes the held rooms once, and a return by hand is not woken twice",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { wakeReturned } = await import("../src/lib/away_waker.ts");
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    const arrived: string[] = [];
    await sql.listen("chat_message", (payload: string) => arrived.push(payload));
    const heard = async (payload: string, ms: number) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (arrived.includes(payload)) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return arrived.includes(payload);
    };
    const count = (payload: string) => arrived.filter((p) => p === payload).length;
    const stepAway = (who: { pair: CryptoKeyPair; session_id: string }) =>
      signedCall(who.pair.privateKey, who.session_id, "POST", "/away",
        { span: "short", nonce: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))) });
    try {
      // By the clock.
      const one = await openChat();
      const wake = `${one.chat}::${one.b.session_id}`;
      assertEquals((await stepAway(one.b)).status, 200);
      await wakeReturned();
      assert(!(await heard(wake, 300)), "a room was woken while its person was still away");
      await database.queryOrThrow(
        `UPDATE identities SET stepped_away_until = now() - interval '1 second'
          WHERE id = (SELECT identity FROM sessions WHERE id = $1)`, [one.b.session_id]);
      await wakeReturned();
      assert(await heard(wake, 2000), "a time away that ran out woke nothing");
      await wakeReturned();
      await new Promise((resolve) => setTimeout(resolve, 300));
      assertEquals(count(wake), 1, "the same end of a time away was announced more than once");

      // By hand.
      const two = await openChat();
      const back = `${two.chat}::${two.b.session_id}`;
      assertEquals((await stepAway(two.b)).status, 200);
      assertEquals((await signedCall(two.b.pair.privateKey, two.b.session_id, "DELETE", "/away")).status, 204);
      assert(await heard(back, 2000), "coming back by hand woke nothing");
      await wakeReturned();
      await new Promise((resolve) => setTimeout(resolve, 300));
      assertEquals(count(back), 1, "the job woke a return that had already announced itself");
    } finally {
      await sql.end();
    }
  },
});

// The waker's two filters (lib/away_waker.ts), unguarded until 2026-09-24 (the
// verifier found them green when removed): a frozen session holds no room to
// wake, and a conversation over for the person is not woken.
Deno.test({
  name: "a time away that runs out wakes no frozen session and no conversation that ended",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { wakeReturned } = await import("../src/lib/away_waker.ts");
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    const heard: string[] = [];
    await sql.listen("chat_message", (payload: string) => heard.push(payload));
    const stepAway = (who: { pair: CryptoKeyPair; session_id: string }) =>
      signedCall(who.pair.privateKey, who.session_id, "POST", "/away",
        { span: "short", nonce: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))) });
    const runOut = (session: string) => database.queryOrThrow(
      `UPDATE identities SET stepped_away_until = now() - interval '1 second'
        WHERE id = (SELECT identity FROM sessions WHERE id = $1)`, [session]);
    try {
      const frozen = await openChat();
      assertEquals((await stepAway(frozen.b)).status, 200);
      await runOut(frozen.b.session_id);
      await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [frozen.b.session_id]);

      const gone = await openChat();
      assertEquals((await stepAway(gone.b)).status, 200);
      await runOut(gone.b.session_id);
      await database.queryOrThrow(`UPDATE chat_participants SET gone_at = now() WHERE chat_id = $1 AND identity = (SELECT identity FROM sessions WHERE id = $2)`,
        [gone.chat, gone.b.session_id]);

      await wakeReturned();
      await new Promise((r) => setTimeout(r, 400));
      assert(!heard.includes(`${frozen.chat}::${frozen.b.session_id}`), "a frozen session was woken");
      assert(!heard.includes(`${gone.chat}::${gone.b.session_id}`), "a conversation that ended for the person was woken");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "receipt deletes one's own rows and nobody else's",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const localId = crypto.randomUUID();
    await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: localId, ciphertext: ciphertext() });
    const byOther = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/received`, { ids: [localId] });
    assertEquals(byOther.status, 204);
    assertEquals(await queued(chat, b.session_id), [localId], "the sender deleted the recipient's row");
    const byOwner = await signedCall(b.pair.privateKey, b.session_id, "POST", `/chats/${chat}/received`, { ids: [localId] });
    assertEquals(byOwner.status, 204);
    assertEquals(await queued(chat, b.session_id), [], "receipt left the row");
  },
});

Deno.test({
  name: "a stranger cannot write into a chat, and an oversized ciphertext is refused",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, chat } = await openChat();
    const stranger = await author();
    const other = await signedCall(stranger.pair.privateKey, stranger.session_id, "POST", `/chats/${chat}/messages`,
      { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(other.status, 404, "a stranger wrote into someone else's chat");
    const big = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`,
      { local_id: crypto.randomUUID(), ciphertext: "A".repeat(2049) });
    assertEquals(big.status, 400, "a ciphertext over chat.ciphertext.bytes was taken");
  },
});

Deno.test({
  name: "the queue keeps two hundred and pushes out the oldest in silence",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // limits.tsv chat.pending.max; §8.8: "overflow pushes out the oldest in
    // silence" — a refusal would again say "they have been gone a long time".
    const { reset } = await import("../src/lib/rate_limit.ts");
    const { a, b, chat } = await openChat();
    const first = crypto.randomUUID();
    const send = (id: string) =>
      signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: id, ciphertext: ciphertext(16) });
    reset();
    assertEquals((await send(first)).status, 202);
    for (let i = 0; i < 200; i++) {
      if (i % 50 === 0) reset();
      const r = await send(crypto.randomUUID());
      assertEquals(r.body, { local_id: (r.body as { local_id: string }).local_id, accepted: true }, `message ${i + 2} was answered differently`);
    }
    const left = await queued(chat, b.session_id);
    assertEquals(left.length, 200, `the queue holds ${left.length}`);
    assert(!left.includes(first), "the oldest message was not the one pushed out");
    reset();
  },
});

Deno.test({
  name: "a queued message older than its term is swept, a fresh one is not",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { sweepExpiredPending } = await import("../src/lib/pending_sweeper.ts");
    const { a, b, chat } = await openChat();
    const [old, fresh] = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of [old, fresh]) {
      await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: id, ciphertext: ciphertext() });
    }
    await database.queryOrThrow(
      `UPDATE pending_deliveries SET created_at = now() - interval '261 minutes' WHERE local_id = $1`, [old]);
    await sweepExpiredPending();
    assertEquals(await queued(chat, b.session_id), [fresh], "the sweep took the wrong rows");
  },
});

Deno.test({
  name: "a block closes the chat to both: no message, no ticket",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // §8.9: a block acts on phrases, the match and the shared chat alike. Step 5
    // panel, 2026-09-21, security lens: no chat path read `blocks` at all.
    const { a, b, chat } = await openChat();
    await database.queryOrThrow(
      `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [b.identity_id, a.identity_id]);
    const sent = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`,
      { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(sent.status, 404, "the blocked one wrote into the chat");
    assertEquals(await queued(chat, b.session_id), [], "a message from the blocked one was queued");
    const ticket = await signedCall(b.pair.privateKey, b.session_id, "POST", `/chats/${chat}/ticket`);
    assertEquals(ticket.status, 404, "the blocker got a ticket into the blocked chat");
  },
});

Deno.test({
  name: "a pair with a live chat gets no second match, and agreeing never fails on it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Step 5 panel, data lens: with a live chat and an expired match, a mutual
    // like made a new match, and both agreeing then failed on chats.pair_key —
    // a 503 on every press. §8.6: while a chat lives, no match is made.
    const { a, b, chat } = await openChat();
    await database.queryOrThrow(
      `UPDATE matches SET expires_at = now() - interval '1 minute' WHERE chat_id = $1`, [chat]);
    const mine = await seedPhrase(a.identity_id, "ещё раз к реке?");
    const theirs = await seedPhrase(b.identity_id, "да, давай");
    const first = await like(a, theirs);
    const back = await like(b, mine);
    assertEquals(stateOf(first), "liked", "a pair with a live chat was given a second match (first like)");
    assertEquals(stateOf(back), "liked", "a pair with a live chat was given a second match (like back)");
    const [kept] = await database.queryOrThrow<{ chat_id: string | null }>(
      `SELECT chat_id FROM matches WHERE pair_key = (SELECT pair_key FROM chats WHERE id = $1)`, [chat]);
    assertEquals(kept.chat_id, chat, "the pair's match row was taken over and lost its chat");
  },
});

// ── The end of a conversation (§8.10) ─────────────────────────────────────────
const goneOf = async (chat: string) =>
  (await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM chat_participants WHERE chat_id = $1 AND gone_at IS NOT NULL`, [chat]))[0].n;

Deno.test({
  name: "closing a conversation by hand ends it for both and empties its queue",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    const closed = await matchCall(b, "DELETE", `/chats/${chat}`);
    assertEquals(closed.status, 200, JSON.stringify(closed.body));
    assertEquals(await goneOf(chat), 2, "the conversation is not over for both");
    assertEquals(await queued(chat, b.session_id), [], "a closed conversation kept its queue");
    const late = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(late.status, 404, "a closed conversation took a message");
    assertEquals((await matchCall(a, "DELETE", `/chats/${chat}`)).status, 404, "closing twice answered differently from a chat that is not there");
  },
});

Deno.test({
  name: "one's own term ends the conversation for oneself, and the sweep removes what is over for both",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
    const { a, b, chat } = await openChat();
    // A's term: created_at + 60 minutes (never wrote). Put the chat 61 minutes back.
    await database.queryOrThrow(`UPDATE chats SET created_at = now() - interval '61 minutes' WHERE id = $1`, [chat]);
    const late = await signedCall(a.pair.privateKey, a.session_id, "POST", `/chats/${chat}/messages`, { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(late.status, 404, "a message was taken after the sender's own term");
    assertEquals(await goneOf(chat), 1, "the sender's end was not written");
    await sweepChats();
    const left = await database.queryOrThrow(`SELECT 1 FROM chats WHERE id = $1`, [chat]);
    assertEquals(left.length, 0, "a conversation over for both outlived the sweep");
    void b;
  },
});

Deno.test({
  name: "alive answers one's own live conversations and nothing else",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // §8.10: the only command that destroys anything — the client wipes what is
    // not in the answer. Someone else's id and one that never existed must look
    // exactly like a dead one: simply absent.
    const { a, chat } = await openChat();
    const other = await openChat();
    const ask = (ids: unknown) => signedCall(a.pair.privateKey, a.session_id, "POST", "/chats/alive", { ids });
    const got = await ask([chat, other.chat, crypto.randomUUID()]);
    assertEquals(got.status, 200, JSON.stringify(got.body));
    assertEquals(got.body, { alive: [chat] });
    await matchCall(a, "DELETE", `/chats/${chat}`);
    assertEquals((await ask([chat])).body, { alive: [] }, "a closed conversation is still alive");
    assertEquals((await ask(Array.from({ length: 201 }, () => crypto.randomUUID()))).status, 400, "a list over the ceiling was taken");
  },
});

Deno.test({
  name: "one's own span is one of four, and it moves one's own end only",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const set = (who: typeof a, span: unknown) =>
      signedCall(who.pair.privateKey, who.session_id, "PATCH", `/chats/${chat}`, { span });
    assertEquals((await set(a, 10)).status, 200);
    assertEquals((await set(a, 15)).status, 400, "a span outside 10/30/60/260 was taken");
    const rows = await database.queryOrThrow<{ identity: string; idle_ttl_minutes: number }>(
      `SELECT identity, idle_ttl_minutes FROM chat_participants WHERE chat_id = $1`, [chat]);
    const by = Object.fromEntries(rows.map((r) => [r.identity, r.idle_ttl_minutes]));
    assertEquals(by[a.identity_id], 10);
    assertEquals(by[b.identity_id], 60, "one side's span moved the other's");
    // The inbox says each side its own span, for the header's "fades after …"
    // (23.09.2026) — never the other's.
    const spanIn = async (who: typeof a) =>
      ((await matchCall(who, "GET", "/inbox")).body as { items: Array<{ id: string; my_span?: number }> })
        .items.find((i) => i.id === chat)?.my_span;
    assertEquals(await spanIn(a), 10, "the inbox does not carry one's own span");
    assertEquals(await spanIn(b), 60, "the inbox gave one side the other's span");
  },
});

Deno.test({
  name: "the inbox shows one's offers to talk and one's conversations, and says who is waiting",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // §8.12: nothing is stored for it — it is read from matches and chats.
    const { a, b, id } = await freshMatch();
    const inbox = async (who: typeof a) =>
      (await matchCall(who, "GET", "/inbox")).body as { items: Array<Record<string, unknown>>; next?: string };
    const mine = (await inbox(a)).items.find((i) => i.id === id);
    assert(mine, "a live match is not in the inbox");
    assertEquals(mine.kind, "match");
    assertEquals(mine.state, "pending");
    assertEquals(mine.waiting_for_you, false);
    assertEquals((mine.phrase as { text: string }).text, "гуляю у залива", "the card does not carry the other side's phrase");
    assertEquals(mine.name, "Аня");
    assert(!("unread" in mine), "the node claims to know what was read");

    await consent(b, id);
    assertEquals((await inbox(a)).items.find((i) => i.id === id)?.waiting_for_you, true, "the other side agreed and the card does not say so");

    await matchCall(a, "POST", `/matches/${id}/decline`);
    assertEquals((await inbox(a)).items.find((i) => i.id === id), undefined, "a declined offer stayed in one's own inbox");
    assert((await inbox(b)).items.find((i) => i.id === id), "one side's 'not now' was shown to the other");

    const agreed = await consent(a, id);
    const chatId = (agreed.body as { chat_id: string }).chat_id;
    const after = (await inbox(a)).items;
    assertEquals(after.find((i) => i.id === id), undefined, "a match that became a chat is still offered");
    const chat = after.find((i) => i.id === chatId);
    assertEquals(chat?.kind, "chat");
    assertEquals(chat?.state, "open");
    assert(typeof chat?.chat_expires_at === "number", "the chat row does not say when it ends for oneself");

    const stranger = await author();
    assertEquals((await inbox(stranger)).items.length, 0, "a stranger's inbox is not empty");
  },
});

// ── Blocks (§8.9) ──────────────────────────────────────────────────────────────
const nonce = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));
const blockedBy = async (who: string) =>
  (await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM blocks WHERE blocker_identity = $1`, [who]))[0].n;

Deno.test({
  name: "blocking by a conversation ends it for both, hides the match, and answers 204 to anything",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const { a, b, chat } = await openChat();
    const block = (who: typeof a, body: unknown) => signedCall(who.pair.privateKey, who.session_id, "POST", "/blocks", body);
    const done = await block(a, { chat, nonce: nonce() });
    assertEquals(done.status, 204, JSON.stringify(done.body));
    assertEquals(await blockedBy(a.identity_id), 1, "the block was not written");
    assertEquals(await goneOf(chat), 2, "the shared conversation did not end for both");
    // Not an oracle: a stranger's chat, a chat that never was — the same 204, nothing written.
    const stranger = await author();
    assertEquals((await block(stranger, { chat, nonce: nonce() })).status, 204);
    assertEquals((await block(stranger, { chat: crypto.randomUUID(), nonce: nonce() })).status, 204);
    assertEquals(await blockedBy(stranger.identity_id), 0, "a stranger blocked through someone else's chat");
    void b;
    reset();
  },
});

Deno.test({
  name: "a replayed block does not come back after it was lifted",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Why POST /blocks carries a nonce (protocol §2): without it a captured
    // request, replayed inside the window, would restore a block its owner took off.
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    const phraseId = await seedPhrase(b.identity_id, "фраза Б");
    const body = { feed: phraseId, nonce: nonce() };
    const call = () => signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks", body);
    assertEquals((await call()).status, 204);
    const list = await matchCall(a, "GET", "/blocks");
    const mine = list.body as Array<{ id: string; since: number }>;
    assertEquals(mine.length, 1, JSON.stringify(list.body));
    assert(!JSON.stringify(mine).includes(b.identity_id), "the list leads back to the blocked identity");
    assertEquals((await matchCall(a, "DELETE", `/blocks/${mine[0].id}`)).status, 204);
    assertEquals(await blockedBy(a.identity_id), 0, "the block was not lifted");
    assertEquals((await call()).status, 204, "a replay answered differently");
    assertEquals(await blockedBy(a.identity_id), 0, "a replayed request restored a lifted block");
    assertEquals((await matchCall(b, "DELETE", `/blocks/${mine[0].id}`)).status, 204, "someone else's id answered differently");
    reset();
  },
});

// Protocol §2: a repeat is looked up before the stepped-away refusal, so a lost
// answer can be asked for from a time away; a new block cannot be made there.
Deno.test({
  name: "a repeated block is answered from a time away, and a new one is refused",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    const body = { feed: await seedPhrase(b.identity_id, "фраза для повтора"), nonce: nonce() };
    assertEquals((await signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks", body)).status, 204);
    await database.queryOrThrow(
      `UPDATE identities SET stepped_away_until = now() + interval '20 minutes' WHERE id = $1`, [a.identity_id]);
    const again = await signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks", body);
    assertEquals(again.status, 204, `a repeat from a time away was not answered: ${JSON.stringify(again.body)}`);
    const fresh = await signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks",
      { feed: await seedPhrase(b.identity_id, "другая фраза"), nonce: nonce() });
    assertEquals(fresh.status, 409, "a new block was made while away");
    assertEquals((fresh.body as { error: { code: string } }).error.code, "stepped_away", "a new block was refused for another reason");
    reset();
  },
});

// POST /identities/close — "start over" (chat spec §8.2, screen 12): one
// transaction closes the identity and takes down all it has live, and the
// PIN is proved on the same counter as the vault's.
Deno.test({
  name: "closing an identity takes down what it has live, and a wrong PIN closes nothing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const pin = crypto.getRandomValues(new Uint8Array(32));
    await database.queryOrThrow(`UPDATE vault_shares SET auth_hash = $2 WHERE session = $1`,
      [a.session_id, await auth.sha256hex(pin)]);
    await seedPhrase(a.identity_id, "ещё одна фраза");
    await signedCall(b.pair.privateKey, b.session_id, "POST", `/chats/${chat}/messages`,
      { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    const close = (proof: Uint8Array, nonce = auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)))) =>
      signedCall(a.pair.privateKey, a.session_id, "POST", "/identities/close", { nonce, auth: auth.bytesToBase64url(proof) });
    const count = async (sql: string, args: unknown[]) =>
      Number((await database.queryOrThrow<{ n: string }>(sql, args))[0].n);

    const wrong = await close(crypto.getRandomValues(new Uint8Array(32)));
    assertEquals(wrong.status, 409);
    assertEquals((wrong.body as { error: { code: string } }).error.code, "pin_mismatch");
    assertEquals(await count(`SELECT count(*)::text AS n FROM identities WHERE id = $1 AND closed_at IS NULL`, [a.identity_id]), 1,
      "a wrong PIN closed the identity");
    await database.queryOrThrow(`UPDATE vault_shares SET next_attempt_at = NULL WHERE session = $1`, [a.session_id]);

    const closed = await close(pin);
    assertEquals(closed.status, 200, JSON.stringify(closed.body));
    const [me] = await database.queryOrThrow<
      { closed_at: Date | null; recovery_auth_hash: string | null; recovery_wrapped_key: string | null }>(
      `SELECT closed_at, recovery_auth_hash, recovery_wrapped_key FROM identities WHERE id = $1`, [a.identity_id]);
    assert(me.closed_at, "the identity is not closed");
    assertEquals(me.recovery_auth_hash, null, "the paper code could still raise a closed identity");
    assertEquals(me.recovery_wrapped_key, null, "the paper code's wrapped key outlived the close");
    assertEquals(await count(
      `SELECT count(*)::text AS n FROM matches m JOIN match_participants p ON p.match_id = m.id
        WHERE p.identity = $1 AND m.expires_at > now()`, [a.identity_id]), 0, "a closed identity still has a live match");
    assertEquals(await count(`SELECT count(*)::text AS n FROM chats WHERE id = $1`, [chat]), 0,
      "the conversation's row outlived the close (chat spec §8.2: deleted in the same transaction)");
    assertEquals(await count(`SELECT count(*)::text AS n FROM feed_messages WHERE author_identity = $1`, [a.identity_id]), 0,
      "a closed identity still has phrases in the feed");
    assertEquals(await count(`SELECT count(*)::text AS n FROM likes WHERE liker_identity = $1`, [a.identity_id]), 0,
      "a closed identity's likes are still counted");
    assertEquals(await count(`SELECT count(*)::text AS n FROM chat_participants WHERE chat_id = $1 AND gone_at IS NULL`, [chat]), 0,
      "a conversation with a closed identity goes on");
    assertEquals(await count(`SELECT count(*)::text AS n FROM pending_deliveries WHERE chat = $1`, [chat]), 0,
      "the queue of an ended conversation stayed");
    const [session] = await database.queryOrThrow<{ frozen_reason: string | null }>(
      `SELECT frozen_reason FROM sessions WHERE id = $1`, [a.session_id]);
    assertEquals(session.frozen_reason, "closed", "the session of a closed identity is not frozen");
    assertEquals(await count(`SELECT count(*)::text AS n FROM vault_shares WHERE session = $1 AND share_enc IS NOT NULL`, [a.session_id]), 0,
      "the share of a closed identity was not burned");
    assertEquals((await signedCall(a.pair.privateKey, a.session_id, "GET", "/identities/me")).status, 401,
      "a closed identity still answers");
    // The other side goes on living.
    assertEquals((await signedCall(b.pair.privateKey, b.session_id, "GET", "/identities/me")).status, 200);
  },
});

// A like or a phrase that passed the guard while the identity was open must
// not land once a close or a time away has committed (verifier, 2026-09-24).
// Deterministic: another connection holds the counters row both lock, the
// request waits on it, the identity is closed and the lock let go.
Deno.test({
  name: "a like or a phrase waiting on a close lands nothing once the close commits",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    await seedPhrase(a.identity_id, "своя фраза");
    const theirs = await seedPhrase(b.identity_id, "чужая фраза");
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    try {
      for (const [name, act, landed] of [
        ["like", () => like(a, theirs),
          async () => (await database.queryOrThrow<{ n: string }>(
            `SELECT count(*)::text AS n FROM likes WHERE liker_identity = $1`, [a.identity_id]))[0].n !== "0"],
        ["phrase", () => signedCall(a.pair.privateKey, a.session_id, "POST", "/feed",
            phrase({ text: "после закрытия" })),
          async () => (await database.queryOrThrow<{ n: string }>(
            `SELECT count(*)::text AS n FROM feed_messages WHERE author_identity = $1 AND text = 'после закрытия'`,
            [a.identity_id]))[0].n !== "0"],
      ] as const) {
        await database.queryOrThrow(`UPDATE identities SET closed_at = NULL WHERE id = $1`, [a.identity_id]);
        let answer: { status: number } | null = null;
        await sql.begin(async (tx) => {
          await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [a.identity_id]);
          const pending = act().then((r) => (answer = r));
          await new Promise((r) => setTimeout(r, 300));
          await tx.unsafe(`UPDATE identities SET closed_at = now() WHERE id = $1`, [a.identity_id]);
          void pending;
        });
        for (let i = 0; i < 100 && answer === null; i++) await new Promise((r) => setTimeout(r, 20));
        assert(answer !== null, `the ${name} never answered`);
        assert(!(await landed()), `a ${name} landed on an identity closed while it waited`);
      }
    } finally {
      await sql.end();
      reset();
    }
  },
});

// A close racing a step-away of the same identity (review panel 2026-09-24,
// data lens): a step-away holds the counters row, then writes the identity's
// row. A close that took the identity's row first and the counters second met
// it the other way round — deadlock, one of the two 503. Another connection
// plays the step-away here, in its order, while the close waits.
Deno.test({
  name: "a close and a step-away of one identity take their locks in one order",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const a = await author();
    const pin = crypto.getRandomValues(new Uint8Array(32));
    await database.queryOrThrow(`UPDATE vault_shares SET auth_hash = $2 WHERE session = $1`,
      [a.session_id, await auth.sha256hex(pin)]);
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    const got: { closed?: { status: number; body: unknown } } = {};
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [a.identity_id]);
        const pending = signedCall(a.pair.privateKey, a.session_id, "POST", "/identities/close",
          { nonce: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))), auth: auth.bytesToBase64url(pin) })
          .then((r) => (got.closed = r));
        await new Promise((r) => setTimeout(r, 300));
        await tx.unsafe(`UPDATE identities SET stepped_away_until = now() + interval '20 minutes' WHERE id = $1`, [a.identity_id]);
        void pending;
      });
      for (let i = 0; i < 150 && !got.closed; i++) await new Promise((r) => setTimeout(r, 20));
      assert(got.closed, "the close never answered");
      assertEquals(got.closed.status, 200, `the close lost to the step-away: ${JSON.stringify(got.closed.body)}`);
    } finally {
      await sql.end();
    }
  },
});

// How many repeats a route has answered from a stored nonce (lib/metrics.ts).
const replays = async (route: string) => {
  const { render } = await import("../src/lib/metrics.ts");
  const line = render().split("\n").find((row) => row.startsWith(`relay_nonce_replay_total{route="${route}"}`));
  return line ? Number(line.split(" ").at(-1)) : 0;
};

// A repeat is answered, not counted (protocol §2). The hourly limit was taken
// before the nonce was looked at: every repeat of one block spent a slot, and
// once the hour's twenty were gone the repeat of a block already made got 429
// instead of its 204 — the family of the step away's guard (loop, 2026-09-24).
Deno.test({
  name: "repeating a block spends no slot of the hour's limit, and is answered after the limit is gone",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset, checkAll, BLOCK_LIMITS } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await author();
    const b = await author();
    const first = { feed: await seedPhrase(b.identity_id, "фраза для повтора"), nonce: nonce() };
    const call = (body: unknown) => signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks", body);
    assertEquals((await call(first)).status, 204);
    const before = await replays("POST /blocks");
    for (let i = 0; i < 25; i++) assertEquals((await call(first)).status, 204, `repeat ${i + 1} was refused`);
    assertEquals(await replays("POST /blocks"), before + 25, "the repeats are not counted as repeats");
    const c = await author();
    const second = await call({ feed: await seedPhrase(c.identity_id, "другая фраза"), nonce: nonce() });
    assertEquals(second.status, 204, "repeats of one block used up the hour's limit");

    // The limit gone by other means, the repeat still finds its answer.
    while (checkAll(BLOCK_LIMITS, a.identity_id).allowed) { /* spend the hour */ }
    assertEquals((await call(first)).status, 204, "a repeat of a block already made was refused by the limit");
    reset();
  },
});

// ── Hiding a phrase for oneself (§8.9, screens 5 and 10) ───────────────────────
Deno.test({
  name: "a hidden phrase leaves one's own feed only, and comes back by its id",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    const { quantise } = await import("../src/lib/feed_geo.ts");
    reset();
    const me = await author();
    const other = await author();
    const writer = await author();
    const here = { lat: 35.17, lon: 33.36 };
    const at = quantise(here, 1000);
    const phraseId = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages
         (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
          lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, 'кофе у моря', 'alone', 'und', $3, $4, 1000, $5, $6, now(), now() + interval '3 hours')`,
      [phraseId, writer.identity_id, here.lat, here.lon, at.lat, at.lon],
    );
    const sees = async (who: typeof me) =>
      ((await signedCall(who.pair.privateKey, who.session_id, "GET", feedUrl(here))).body as {
        items: Array<{ id: string }>;
      }).items.some((i) => i.id === phraseId);
    assert(await sees(me), "the phrase was not in the feed to begin with — the case proves nothing");

    const hid = await signedCall(me.pair.privateKey, me.session_id, "POST", "/hidden", { feed: phraseId });
    assertEquals(hid.status, 200, JSON.stringify(hid.body));
    const hiddenId = (hid.body as { id: string }).id;
    assert(hiddenId && hiddenId !== phraseId, "the handle is the phrase id itself");
    assert(!(await sees(me)), "a hidden phrase is still in one's own feed");
    assert(await sees(other), "hiding for oneself hid the phrase from somebody else");

    const list = await matchCall(me, "GET", "/hidden");
    assertEquals(list.body, [{ id: hiddenId, kind: "feed", text: "кофе у моря" }]);
    assertEquals((await matchCall(other, "DELETE", `/hidden/${hiddenId}`)).status, 204, "someone else's id answered differently");
    assert(!(await sees(me)), "someone else brought one's hidden phrase back");
    assertEquals((await matchCall(me, "DELETE", `/hidden/${hiddenId}`)).status, 204);
    assert(await sees(me), "the phrase did not come back");
    reset();
  },
});

Deno.test({
  name: "a span set after one's term does not bring the conversation back",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Step 7 panel, security lens: PATCH did not look at the term, so between the
    // term and the sweep's next minute a span of 260 revived what §8.10 had ended.
    const { a, chat } = await openChat();
    await database.queryOrThrow(`UPDATE chats SET created_at = now() - interval '61 minutes' WHERE id = $1`, [chat]);
    const late = await signedCall(a.pair.privateKey, a.session_id, "PATCH", `/chats/${chat}`, { span: 260 });
    assertEquals(late.status, 404, "a span was taken after the caller's own term");
    const alive = await signedCall(a.pair.privateKey, a.session_id, "POST", "/chats/alive", { ids: [chat] });
    assertEquals(alive.body, { alive: [] }, "the conversation came back to life");
  },
});

Deno.test({
  name: "hiding does not let a blocked person read the blocker's phrase",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Step 7 panel, security lens: POST /hidden checked only that the phrase was
    // published, and GET /hidden returned its text — a way round §8.9 for anyone
    // who remembered an id. The same goes for a phrase outside one's age band.
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const blocked = await author();
    const blocker = await author();
    const teen = await author(15);
    const theirs = await seedPhrase(blocker.identity_id, "фраза блокирующего");
    const young = await seedPhrase(teen.identity_id, "фраза из другой полосы");
    await database.queryOrThrow(
      `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [blocker.identity_id, blocked.identity_id]);
    for (const [id, why] of [[theirs, "blocked"], [young, "band"]] as const) {
      const hid = await signedCall(blocked.pair.privateKey, blocked.session_id, "POST", "/hidden", { feed: id });
      assertEquals(hid.status, 404, `${why}: a phrase one may not see was hidden, and so confirmed`);
    }
    const list = await matchCall(blocked, "GET", "/hidden");
    assertEquals(list.body, [], "a text one may not see came back through the hidden list");
    reset();
  },
});

Deno.test({
  name: "a block outlives the conversation it ended: no match comes back, no consent over it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Step 7 panel, data lens, reproduced in a container: the block deleted the
    // pair's match only while it had no chat. With a chat, the sweep deleted the
    // chat, the foreign key set matches.chat_id to NULL, and the match came back
    // into the inbox as pending — one consent then opened a chat over the block.
    const { reset } = await import("../src/lib/rate_limit.ts");
    const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
    reset();
    const { a, b, chat } = await openChat();
    const [m] = await database.queryOrThrow<{ id: string }>(`SELECT id FROM matches WHERE chat_id = $1`, [chat]);
    const blocked = await signedCall(a.pair.privateKey, a.session_id, "POST", "/blocks", { chat, nonce: nonce() });
    assertEquals(blocked.status, 204);
    await sweepChats();
    const items = ((await matchCall(b, "GET", "/inbox")).body as { items: Array<{ id: string }> }).items;
    assertEquals(items.find((i) => i.id === m.id), undefined, "the match came back into the blocked one's inbox");
    const again = await consent(b, m.id);
    assertEquals(again.status, 404, "consent was taken over a block");
    reset();
  },
});

Deno.test({
  name: "a conversation that ended takes its match with it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // The same return without any block: closed by hand, swept, and the match —
    // both sides' consent still on it — was offered again as pending.
    const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
    const { a, b, chat } = await openChat();
    const [m] = await database.queryOrThrow<{ id: string }>(`SELECT id FROM matches WHERE chat_id = $1`, [chat]);
    await matchCall(a, "DELETE", `/chats/${chat}`);
    await sweepChats();
    const items = ((await matchCall(b, "GET", "/inbox")).body as { items: Array<{ id: string }> }).items;
    assertEquals(items.find((i) => i.id === m.id), undefined, "a finished conversation's match was offered again");
  },
});

Deno.test({
  name: "a conversation over for the other side reads as ended, and their term is not told",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Screen 7: "ended" when it is over for the other one. The fact only — the
    // other side's span is theirs (§8.6).
    const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
    const { a, b, chat } = await openChat();
    await signedCall(a.pair.privateKey, a.session_id, "PATCH", `/chats/${chat}`, { span: 10 });
    await database.queryOrThrow(`UPDATE chats SET created_at = now() - interval '11 minutes' WHERE id = $1`, [chat]);
    await sweepChats();
    const items = ((await matchCall(b, "GET", "/inbox")).body as { items: Array<Record<string, unknown>> }).items;
    const row = items.find((i) => i.id === chat);
    assertEquals(row?.state, "ended", JSON.stringify(row));
    assert(!JSON.stringify(row).includes("\"span\""), "the other side's span leaked");
  },
});

// ── The moderator's queue in the panel (§8.3: moderation before publication) ───
// No model is wired (§8.14), so a person decides. The panel session is minted the
// way lib/auth.ts redeem() mints it, and the operator's record is written where
// authed() reads it on every request.
async function panelAs(role: string, brand: string | null = null): Promise<(method: string, path: string, body?: unknown) => Promise<{ status: number; body: unknown; headers: Headers }>> {
  const { sign } = await import("../src/lib/jwt.ts");
  const { sha256hex } = await import("../src/lib/hash.ts");
  const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
  const { config } = await import("../src/config.ts");
  const email = `${role}-${crypto.randomUUID()}@platform.test`;
  await scopedForBrand(null).put(`panel/${config.envName}/users/${await sha256hex(email)}.json`, {
    email, role, brand, created_at: "2026-09-22T00:00:00.000Z",
  });
  const token = await sign({
    sub: email, role, brand, env: config.envName, exp: Math.floor(Date.now() / 1000) + 3600,
  }, "feed-publish-secret");
  return async (method, path, body) => {
    const url = new URL(`https://relay.test${path}`);
    const found = match(method, url.pathname);
    assert(found, `no route for ${method} ${url.pathname}`);
    const response = await found.h({
      req: new Request(url, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      params: found.params,
      url,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  };
}

Deno.test({
  name: "a moderator sees a waiting phrase, publishes it once, and a viewer cannot",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "жду вердикта человека" }));
    assertEquals(sent.status, 202, JSON.stringify(sent.body));
    const moderator = await panelAs("moderator");
    const viewer = await panelAs("viewer");
    assertEquals((await viewer("GET", "/admin/feed-queue")).status, 403, "a viewer read the moderation queue");

    const queue = await moderator("GET", "/admin/feed-queue");
    assertEquals(queue.status, 200, JSON.stringify(queue.body));
    const row = (queue.body as Array<Record<string, unknown>>).find((i) => i.text === "жду вердикта человека");
    assert(row, "a waiting phrase is not in the queue");
    assertEquals(row.name, "Аня", "the moderator does not see the name that goes out with the phrase");
    assert(!JSON.stringify(row).includes(me.identity_id), "the queue hands the moderator the author's identity");

    assertEquals((await viewer("POST", `/admin/feed-queue/${row.id}/publish`)).status, 403);
    const published = await moderator("POST", `/admin/feed-queue/${row.id}/publish`);
    assertEquals(published.status, 200, JSON.stringify(published.body));
    const [live] = await database.queryOrThrow<{ visible_at: Date | null }>(
      `SELECT visible_at FROM feed_messages WHERE id = $1`, [row.id]);
    assert(live.visible_at, "a published phrase is not visible");
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/publish`)).status, 409, "a second verdict was applied");
    reset();
  },
});

Deno.test({
  name: "a refused phrase leaves the queue and is never seen",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "это отклонят" }));
    const moderator = await panelAs("moderator");
    const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "это отклонят");
    assert(row, "a waiting phrase is not in the queue");
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/refuse`)).status, 200);
    const left = await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1 AND visible_at IS NOT NULL`, [row.id]);
    assertEquals(left.length, 0, "a refused phrase became visible");
    const again = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>);
    assertEquals(again.find((i) => i.id === row.id), undefined, "a refused phrase stayed in the queue");
    reset();
  },
});

Deno.test({
  name: "a tenant's moderator neither sees nor decides another brand's phrase",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "фраза чужого бренда" }));
    const [row] = await database.queryOrThrow<{ id: string; brand: string }>(
      `SELECT id, brand FROM feed_messages WHERE text = 'фраза чужого бренда' AND visible_at IS NULL`);
    assert(row, "the phrase is not waiting");
    const stranger = await panelAs("moderator", "some-other-brand");
    const queue = await stranger("GET", "/admin/feed-queue");
    assertEquals(queue.status, 200, JSON.stringify(queue.body));
    assertEquals((queue.body as Array<{ id: string }>).find((i) => i.id === row.id), undefined,
      "a tenant's moderator sees another brand's queue");
    assertEquals((await stranger("POST", `/admin/feed-queue/${row.id}/publish`)).status, 404);
    assertEquals((await stranger("POST", `/admin/feed-queue/${row.id}/refuse`)).status, 404);
    const own = await panelAs("moderator", row.brand);
    const refused = await own("POST", `/admin/feed-queue/${row.id}/refuse`);
    assertEquals(refused.status, 200, `the brand's own moderator cannot decide: ${JSON.stringify(refused.body)}`);
    reset();
  },
});

Deno.test({
  name: "publishing a phrase accepts the name that goes out with it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    await database.queryOrThrow(
      `UPDATE identities SET name_state = 'pending', name_pending = 'Анна' WHERE id = $1`, [me.identity_id]);
    await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "имя ждёт вместе со мной" }));
    const moderator = await panelAs("moderator");
    const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "имя ждёт вместе со мной");
    assert(row, "a waiting phrase is not in the queue");
    assertEquals(row.name_state, "pending", "the moderator is not told the name is unchecked");
    assertEquals(row.name, "Анна", "the moderator is shown the old name, not the one that would go out");
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/publish`)).status, 200);
    const [who] = await database.queryOrThrow<{ name: string; name_state: string; name_pending: string | null }>(
      `SELECT name, name_state, name_pending FROM identities WHERE id = $1`, [me.identity_id]);
    assertEquals(who, { name: "Анна", name_state: "accepted", name_pending: null }, "Publish did not accept the name");
    reset();
  },
});

// The name's verdict reaches the author's open rooms as a `name_verdict`
// frame (protocol §4.4 frames, §8.2): the node has no socket of a session's
// own, so the frame goes to every room the session holds; with none open, the
// profile's name_state says the same (loop plan A10, 2026-09-24).
Deno.test({
  name: "a name's verdict is announced to its author's live sessions, accepted or refused",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const postgres = (await import("npm:postgres@3.4.4")).default;
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    const heard: string[] = [];
    await sql.listen("session_frame", (payload: string) => heard.push(payload));
    const moderator = await panelAs("moderator");
    const waiting = async (me: { identity_id: string; pair: CryptoKeyPair; session_id: string }, text: string) => {
      await database.queryOrThrow(
        `UPDATE identities SET name_state = 'pending', name_pending = 'Вера' WHERE id = $1`, [me.identity_id]);
      await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text }));
      const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
        .find((i) => i.text === text);
      assert(row, "a waiting phrase is not in the queue");
      return row.id as string;
    };
    const frameFor = async (session: string) => {
      for (let i = 0; i < 100; i++) {
        const got = heard.find((p) => p.startsWith(`${session}|`));
        if (got) return JSON.parse(got.slice(session.length + 1));
        await new Promise((r) => setTimeout(r, 20));
      }
      return null;
    };
    try {
      const one = await author();
      assertEquals((await moderator("POST", `/admin/feed-queue/${await waiting(one, "имя примут")}/publish`)).status, 200);
      assertEquals(await frameFor(one.session_id), { type: "name_verdict", data: { accepted: true } },
        "an accepted name was not announced to its author's session");

      const two = await author();
      assertEquals((await moderator("POST", `/admin/feed-queue/${await waiting(two, "имя отклонят")}/refuse-name`)).status, 200);
      assertEquals(await frameFor(two.session_id), { type: "name_verdict", data: { accepted: false } },
        "a refused name was not announced to its author's session");
    } finally {
      await sql.end();
      reset();
    }
  },
});

Deno.test({
  name: "publish accepts only the name the moderator saw, and never a rejected one unread",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    await database.queryOrThrow(
      `UPDATE identities SET name_state = 'pending', name_pending = 'Анна' WHERE id = $1`, [me.identity_id]);
    await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "имя сменится под рукой" }));
    const moderator = await panelAs("moderator");
    const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "имя сменится под рукой");
    assert(row);
    // The name moves between the read and the click.
    await database.queryOrThrow(`UPDATE identities SET name_pending = 'Анна-Мария' WHERE id = $1`, [me.identity_id]);
    const stale = await moderator("POST", `/admin/feed-queue/${row.id}/publish`, { name: row.name });
    assertEquals(stale.status, 409, "a name that moved under the moderator's read was accepted");
    const [still] = await database.queryOrThrow<{ visible_at: Date | null }>(
      `SELECT visible_at FROM feed_messages WHERE id = $1`, [row.id]);
    assertEquals(still.visible_at, null, "the phrase went out although its name did not hold");
    // Read again, publish what is there now.
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/publish`, { name: "Анна-Мария" })).status, 200);

    // A rejected name stays rejected through a publish: nothing was waiting to be accepted.
    const other = await author();
    await database.queryOrThrow(`UPDATE identities SET name_state = 'rejected' WHERE id = $1`, [other.identity_id]);
    await signedCall(other.pair.privateKey, other.session_id, "POST", "/feed", phrase({ text: "имя отклонено" }));
    const second = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "имя отклонено");
    assert(second);
    // …and a phrase whose name is rejected does not go out at all: both must
    // be accepted (§8.2, 2026-08-26).
    const held = await moderator("POST", `/admin/feed-queue/${second.id}/publish`, { name: second.name });
    assertEquals(held.status, 409, JSON.stringify(held.body));
    assertEquals((held.body as { error: string }).error, "the name is rejected; the phrase waits for a new one");
    const [who] = await database.queryOrThrow<{ name_state: string }>(
      `SELECT name_state FROM identities WHERE id = $1`, [other.identity_id]);
    assertEquals(who.name_state, "rejected", "publish quietly re-accepted a rejected name");
    reset();
  },
});

// ── PATCH /identities/me (§8.2, protocol §4.11) ──────────────────────────────
const patchMe = (who: { pair: CryptoKeyPair; session_id: string }, body: unknown) =>
  signedCall(who.pair.privateKey, who.session_id, "PATCH", "/identities/me", body);
const profileOf = async (id: string) =>
  (await database.queryOrThrow<Record<string, unknown>>(
    `SELECT name, name_pending, name_state, age, filter_age_min, filter_age_max, languages
       FROM identities WHERE id = $1`, [id]))[0];

Deno.test({
  name: "a new name waits for the queue, and comes out with the next phrase",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const who = await author();
    const asked = await patchMe(who, { name: "Анна" });
    assertEquals(asked.status, 202, JSON.stringify(asked.body));
    assertEquals(await profileOf(who.identity_id), {
      name: "Аня", name_pending: "Анна", name_state: "pending", age: 30,
      filter_age_min: null, filter_age_max: null, languages: [],
    });
    // Nobody sees the new name yet: the queue does, beside the next phrase.
    await signedCall(who.pair.privateKey, who.session_id, "POST", "/feed", phrase({ text: "с новым именем" }));
    const moderator = await panelAs("moderator");
    const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "с новым именем");
    assert(row);
    assertEquals(row.name, "Анна");
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/publish`, { name: "Анна" })).status, 200);
    assertEquals((await profileOf(who.identity_id)).name, "Анна");
    // The unchanged name is not a change: nothing goes to the queue.
    assertEquals((await patchMe(who, { name: "Анна" })).status, 200);
    // Too long, and not a string.
    assertEquals((await patchMe(who, { name: "а".repeat(25) })).status, 400);
    assertEquals((await patchMe(who, { name: 7 })).status, 400);
    reset();
  },
});

Deno.test({
  name: "the accepted name is frozen while a phrase lives or a chat is open",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const who = await author();
    await livePhrase({ pair: who.pair.privateKey, session_id: who.session_id });
    const frozen = await patchMe(who, { name: "Анна" });
    assertEquals(frozen.status, 409, JSON.stringify(frozen.body));
    assertEquals((frozen.body as { error: { code: string } }).error.code, "name_frozen");
    // Other fields still move while the name is frozen.
    assertEquals((await patchMe(who, { languages: ["ru", "en"] })).status, 200);
    const { a } = await openChat();
    const inChat = await patchMe(a, { name: "Борис" });
    assertEquals((inChat.body as { error: { code: string } }).error.code, "name_frozen");
    // A rejected name is never frozen: it is corrected whenever.
    await database.queryOrThrow(`UPDATE identities SET name_state = 'rejected' WHERE id = $1`, [a.identity_id]);
    assertEquals((await patchMe(a, { name: "Борис" })).status, 202);
    reset();
  },
});

Deno.test({
  name: "age moves up across 20/21 and never down; the filter stays in the band; ten edits a day",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const teen = await author(20);
    assertEquals((await patchMe(teen, { age: 21 })).status, 200);
    const down = await patchMe(teen, { age: 20 });
    assertEquals(down.status, 409);
    assertEquals((down.body as { error: { code: string } }).error.code, "age_step_down");
    // Inside the pool both ways.
    assertEquals((await patchMe(teen, { age: 25 })).status, 200);
    assertEquals((await patchMe(teen, { age: 22 })).status, 200);
    assertEquals((await patchMe(teen, { age: 12 })).status, 400);
    // The filter: a 22-year-old's band is [21, ∞).
    assertEquals((await patchMe(teen, { filter_age_min: 25, filter_age_max: 30 })).status, 200);
    const wide = await patchMe(teen, { filter_age_min: 19 });
    assertEquals(wide.status, 409);
    assertEquals((wide.body as { error: { code: string } }).error.code, "filter_out_of_band");
    assertEquals((await patchMe(teen, { filter_age_min: 40, filter_age_max: 30 })).status, 400);
    assertEquals((await patchMe(teen, { languages: ["a", "b", "c", "d"] })).status, 400);
    assertEquals((await patchMe(teen, { filter_modes: ["alone"] })).status, 400, "filter_modes has no column yet and must say so");
    // profile.patch.day: the ten above counted (refusals too), the next is 429.
    const spent = await patchMe(teen, { languages: ["ru"] });
    assertEquals(spent.status, 429, JSON.stringify(spent.body));
    reset();
  },
});

Deno.test({
  name: "a birthday clamps the old filter; invisible characters are not a name; the rename and the verdict do not deadlock",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const who = await author(20);
    assertEquals((await patchMe(who, { filter_age_min: 18, filter_age_max: 22 })).status, 200);
    const grown = await patchMe(who, { age: 21 });
    assertEquals(grown.status, 200, JSON.stringify(grown.body));
    const now = grown.body as { filter_age_min?: number; filter_age_max?: number };
    // band(21) is [19, ∞): 18 rises to 19, 22 stays.
    assertEquals([now.filter_age_min, now.filter_age_max], [19, 22], "the filter was not clamped into the new band");
    assertEquals((await patchMe(who, { name: "Ан\u200bна" })).status, 400);
    assertEquals((await patchMe(who, { name: "\u200b\u200b" })).status, 400);
    assertEquals((await patchMe(who, { name: "  Анна   Мария " })).status, 202);
    assertEquals((await profileOf(who.identity_id)).name_pending, "Анна Мария", "whitespace was not collapsed");

    // The verdict (stats → identities) and the route, in parallel, many times:
    // with the locks in opposite orders one side dies with 40P01 and the
    // route answers 500 (both lenses, 2026-09-22).
    const verdict = await import("../src/lib/feed_verdict.ts");
    await database.queryOrThrow(`DELETE FROM feed_messages WHERE author_identity = $1`, [who.identity_id]);
    for (let i = 0; i < 12; i++) {
      reset();
      // Back to accepted each round, so the rename is a fresh pending and the verdict applies.
      await database.queryOrThrow(`UPDATE identities SET name_state = 'accepted', name_pending = NULL WHERE id = $1`, [who.identity_id]);
      // Four an hour would stop the fifth send: the moments are not the subject here.
      await database.queryOrThrow(`UPDATE identity_stats SET published_at_recent = '{}', rejected_at_recent = '{}' WHERE identity = $1`, [who.identity_id]);
      const sent = await signedCall(who.pair.privateKey, who.session_id, "POST", "/feed", phrase({ text: `гонка ${i}` }));
      assertEquals(sent.status, 202, JSON.stringify(sent.body));
      const id = (sent.body as { id: string }).id;
      const [a, b] = await Promise.all([
        verdict.publishPhrase(id),
        patchMe(who, { name: `Имя ${i}` }),
      ]);
      assert(a.applied, "the verdict did not apply");
      assert(b.status === 202 || b.status === 409, `the rename answered ${b.status}: ${JSON.stringify(b.body)}`);
      await database.queryOrThrow(`DELETE FROM feed_messages WHERE id = $1`, [id]);
    }
    reset();
  },
});

Deno.test({
  name: "the moderator refuses a name: the phrase waits unswept, no match forms, a new name brings it back",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const who = await author();
    await signedCall(who.pair.privateKey, who.session_id, "POST", "/feed", phrase({ text: "имя не пройдёт" }));
    const moderator = await panelAs("moderator");
    const row = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.text === "имя не пройдёт");
    assert(row);
    const refused = await moderator("POST", `/admin/feed-queue/${row.id}/refuse-name`, { name: "Аня" });
    assertEquals(refused.status, 200, JSON.stringify(refused.body));
    // The name is rejected; the phrase is still there, and says so to its author.
    assertEquals(await profileOf(who.identity_id), {
      name: "Аня", name_pending: null, name_state: "rejected", age: 30,
      filter_age_min: null, filter_age_max: null, languages: [],
    });
    const mine = await signedCall(who.pair.privateKey, who.session_id, "GET", "/identities/me");
    assertEquals((mine.body as { name_state: string }).name_state, "rejected", "the profile does not say the name was refused");
    // A second refusal of the same name: nothing to refuse again.
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/refuse-name`, { name: "Аня" })).status, 409);
    // The sweeper leaves a phrase whose name is being fixed alone.
    await database.queryOrThrow(`UPDATE feed_messages SET created_at = now() - interval '1 hour' WHERE id = $1`, [row.id]);
    const verdict = await import("../src/lib/feed_verdict.ts");
    await verdict.sweepStaleQueue();
    const [still] = await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [row.id]);
    assert(still, "the sweeper took a phrase that was waiting for its name");
    // No match forms while the name is rejected (§8.2 — the second line of defence).
    const them = await author();
    const theirs = await seedPhrase(them.identity_id, "жду мэтча");
    await database.queryOrThrow(`UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '4 hours' WHERE id = $1`, [row.id]);
    await like(who, theirs);
    const back = await like(them, row.id as string);
    assertEquals(stateOf(back), "liked", "a match formed with a rejected name");
    await database.queryOrThrow(`UPDATE feed_messages SET visible_at = NULL, expires_at = NULL WHERE id = $1`, [row.id]);
    // The author sends a new name; it waits beside the phrase; publish takes both.
    assertEquals((await patchMe(who, { name: "Анна" })).status, 202);
    const again = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.id === row.id);
    assert(again, "the phrase left the queue");
    assertEquals([again.name, again.name_state], ["Анна", "pending"]);
    // Pending is not accepted either: `name` still holds the refused string,
    // and a match would show it (profile panel 2026-09-22, security 3).
    await database.queryOrThrow(`UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '4 hours' WHERE id = $1`, [row.id]);
    await database.queryOrThrow(`DELETE FROM likes WHERE liker_identity IN ($1, $2)`, [who.identity_id, them.identity_id]);
    await like(who, theirs);
    assertEquals(stateOf(await like(them, row.id as string)), "liked", "a match formed while the name was still pending");
    await database.queryOrThrow(`UPDATE feed_messages SET visible_at = NULL, expires_at = NULL WHERE id = $1`, [row.id]);
    assertEquals((await moderator("POST", `/admin/feed-queue/${row.id}/publish`, { name: "Анна" })).status, 200);
    assertEquals((await profileOf(who.identity_id)).name_state, "accepted");
    reset();
  },
});

Deno.test({
  name: "a signed send carries the storefront's key, and the phrase lands under its brand",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    // The client sends the key beside the signature: the key says which face,
    // the signature says which person (§8, "brand comes from the key").
    const sent = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "с лицом" }), { "x-api-key": KEY_ID });
    assertEquals(sent.status, 202, JSON.stringify(sent.body));
    const [row] = await database.queryOrThrow<{ brand: string }>(
      `SELECT brand FROM feed_messages WHERE id = $1`, [(sent.body as { id: string }).id]);
    assertEquals(row.brand, "alpha", "a phrase sent through a storefront's key was not attributed to it");
    // Without a key: unattributed, as before — not refused.
    const bare = await signedCall(me.pair.privateKey, me.session_id, "DELETE", `/feed/${(sent.body as { id: string }).id}`);
    assertEquals(bare.status, 204, JSON.stringify(bare.body));
    // A key nobody issued does not lend a face.
    const forged = await signedCall(me.pair.privateKey, me.session_id, "POST", "/feed", phrase({ text: "чужое лицо" }), { "x-api-key": "ak_pub_nobodyissuedthis0000" });
    assertEquals(forged.status, 401, JSON.stringify(forged.body));
    reset();
  },
});

// ── Step 6: the ephemeral halves ride on consent, the inbox hands them over ──
Deno.test({
  name: "consent needs a half bound to its match; the inbox hands each side the other's",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, id } = await freshMatch();
    // No half — no consent: the spec knows no unencrypted chat (§8.13).
    const bare = await matchCall(a, "POST", `/matches/${id}/consent`);
    assertEquals(bare.status, 400, JSON.stringify(bare.body));
    // A half signed for another match is not a half for this one.
    const elsewhere = await halfFor(a, crypto.randomUUID());
    const moved = await matchCall(a, "POST", `/matches/${id}/consent`, elsewhere);
    assertEquals(moved.status, 400, "a half signed for another match was taken");
    // A half with a signature nobody made.
    const forged = { ...(await halfFor(a, id)), ephemeral_signature: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(64))) };
    assertEquals((await matchCall(a, "POST", `/matches/${id}/consent`, forged)).status, 400);

    const aHalf = await halfFor(a, id);
    const first = await matchCall(a, "POST", `/matches/${id}/consent`, aHalf);
    assertEquals(first.status, 200, JSON.stringify(first.body));
    // The same half again is fine (a retry); a different one is refused — the
    // peer may already have derived with the first.
    assertEquals((await matchCall(a, "POST", `/matches/${id}/consent`, aHalf)).status, 200);
    const other = await matchCall(a, "POST", `/matches/${id}/consent`, await halfFor(a, id));
    assertEquals(other.status, 409, JSON.stringify(other.body));
    assertEquals((other.body as { error: { code: string } }).error.code, "half_published");

    const bHalf = await halfFor(b, id);
    const agreed = await matchCall(b, "POST", `/matches/${id}/consent`, bHalf);
    assertEquals(stateOf(agreed), "agreed");
    const chatId = (agreed.body as { chat_id: string }).chat_id;

    const inboxOf = async (who: typeof a) => {
      const r = await matchCall(who, "GET", "/inbox");
      return (r.body as { items: Array<Record<string, unknown>> }).items.find((i) => i.kind === "chat" && i.id === chatId) as Record<string, unknown>;
    };
    const seenByA = await inboxOf(a);
    const seenByB = await inboxOf(b);
    assert(seenByA && seenByB, "the chat is not in both inboxes");
    const peerA = seenByA.peer as { ephemeral_public_key: string; ephemeral_signature: string; identity_public_key: string; identity_id: string };
    assertEquals(peerA.ephemeral_public_key, bHalf.ephemeral_public_key, "a did not get b's half");
    assertEquals(peerA.ephemeral_signature, bHalf.ephemeral_signature);
    assertEquals((seenByB.peer as { ephemeral_public_key: string }).ephemeral_public_key, aHalf.ephemeral_public_key);
    const spkiB = new Uint8Array(await crypto.subtle.exportKey("spki", b.pair.publicKey));
    assertEquals(peerA.identity_public_key, auth.bytesToBase64url(spkiB));
    assertEquals(peerA.identity_id, b.identity_id);
    assertEquals(seenByA.me as string, a.identity_id);
    // The match the halves were signed for, so the peer can verify the binding.
    assertEquals(seenByA.match_id as string, id);
    // The halves belong to the chat now, not to the match: a match gone (the
    // sweeper, a later re-match) leaves the conversation its keys (step-6 panel).
    await database.queryOrThrow(`DELETE FROM matches WHERE id = $1`, [id]);
    const afterA = await inboxOf(a);
    assert(afterA, "the chat left the inbox with its match");
    assertEquals((afterA.peer as { ephemeral_public_key: string }).ephemeral_public_key, bHalf.ephemeral_public_key, "the peer's half went with the match");
    assertEquals(afterA.match_id as string, id, "the match id went with the match");
  },
});

// ── Step-5 tails with a database (panel 2026-09-21) ────────────────────────────
Deno.test({
  name: "the pending sweeper has its index, and the chat sweeper ends conversations in batches, all of them",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const [index] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'pending_deliveries' AND indexdef LIKE '%(created_at)%'`);
    assertEquals(index.n, 1, "pending_deliveries has no index on created_at");

    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const chats: string[] = [];
    for (let i = 0; i < 3; i++) chats.push((await openChat()).chat);
    // Every side's term is over.
    await database.queryOrThrow(
      `UPDATE chat_participants SET last_own_message_at = now() - interval '2 days' WHERE chat_id = ANY($1::uuid[])`, [chats]);
    const { sweepChats } = await import("../src/lib/chat_sweeper.ts");
    // A batch smaller than the work: one call still finishes it.
    const swept = await sweepChats({ batch: 2 });
    assertEquals(swept.ended, 6, "not every side was ended");
    assertEquals(swept.deleted, 3, "not every conversation was deleted");
    const [left] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM chats WHERE id = ANY($1::uuid[])`, [chats]);
    assertEquals(left.n, 0);
    reset();
  },
});

// ── Step 6: the key reissued after a device lost it (§8.13) ────────────────────
const REKEY_DOMAIN = "xor.rekey.v1\n";
async function rekeyHalf(who: { pair: CryptoKeyPair }, chatId: string, epoch: number) {
  const key = auth.bytesToBase64url(new Uint8Array(await crypto.subtle.exportKey(
    "spki", ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair).publicKey)));
  const prefix = new TextEncoder().encode(`${REKEY_DOMAIN}${chatId}\n${epoch}\n`);
  const raw = auth.base64urlToBytes(key)!;
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix); bytes.set(raw, prefix.length);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
  return { epoch, ephemeral_public_key: key, ephemeral_signature: auth.bytesToBase64url(signature) };
}

Deno.test({
  name: "a side that lost its keys asks for new ones; the other agrees; both hold the next epoch",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const rowOf = async (who: typeof a) => {
      const r = await matchCall(who, "GET", "/inbox");
      return (r.body as { items: Array<Record<string, unknown>> }).items.find((i) => i.kind === "chat" && i.id === chat) as Record<string, unknown>;
    };
    assertEquals((await rowOf(a)).key_epoch, 0);

    // A half signed for another epoch, or by nobody, is not a half.
    const wrongEpoch = { ...(await rekeyHalf(a, chat, 2)), epoch: 1 };
    assertEquals((await matchCall(a, "POST", `/chats/${chat}/rekey`, wrongEpoch)).status, 400);
    const forged = { ...(await rekeyHalf(a, chat, 1)), ephemeral_signature: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(64))) };
    assertEquals((await matchCall(a, "POST", `/chats/${chat}/rekey`, forged)).status, 400);

    const aNew = await rekeyHalf(a, chat, 1);
    const asked = await matchCall(a, "POST", `/chats/${chat}/rekey`, aNew);
    assertEquals(asked.status, 200, JSON.stringify(asked.body));
    assertEquals(asked.body, { state: "waiting", epoch: 1 });
    // Running further ahead than the other side is refused.
    const ahead = await matchCall(a, "POST", `/chats/${chat}/rekey`, await rekeyHalf(a, chat, 2));
    assertEquals(ahead.status, 409, JSON.stringify(ahead.body));

    // The other side sees the request, and the new half, in its inbox.
    const seenByB = await rowOf(b);
    assertEquals(seenByB.rekey_requested, true, "b was not told keys are being reissued");
    const peerOfB = seenByB.peer as { key_epoch: number; ephemeral_public_key: string };
    assertEquals([peerOfB.key_epoch, peerOfB.ephemeral_public_key], [1, aNew.ephemeral_public_key]);

    const bNew = await rekeyHalf(b, chat, 1);
    const agreed = await matchCall(b, "POST", `/chats/${chat}/rekey`, bNew);
    assertEquals(agreed.body, { state: "agreed", epoch: 1 });
    const afterA = await rowOf(a);
    assertEquals(afterA.key_epoch, 1);
    assertEquals(afterA.rekey_requested, false);
    assertEquals((afterA.peer as { ephemeral_public_key: string }).ephemeral_public_key, bNew.ephemeral_public_key);

    // Not a member: the same 404 as a chat that does not exist.
    const { a: stranger } = await freshMatch();
    assertEquals((await matchCall(stranger, "POST", `/chats/${chat}/rekey`, await rekeyHalf(stranger, chat, 2))).status, 404);
  },
});

// ── Reissue tails (panel 2026-09-22, rekey) ────────────────────────────────────
Deno.test({
  name: "agreeing to new keys clears what waited under the old ones",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const { a, b, chat } = await openChat();
    // b writes while a is away: the box waits for a, under the old keys.
    const sent = await matchCall(b, "POST", `/chats/${chat}/messages`, { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(sent.status, 202, JSON.stringify(sent.body));
    const waiting = async () => (await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM pending_deliveries WHERE chat = $1`, [chat]))[0].n;
    assertEquals(await waiting(), 1);
    await matchCall(a, "POST", `/chats/${chat}/rekey`, await rekeyHalf(a, chat, 1));
    assertEquals(await waiting(), 1, "a request alone must not throw anything away");
    await matchCall(b, "POST", `/chats/${chat}/rekey`, await rekeyHalf(b, chat, 1));
    assertEquals(await waiting(), 0, "boxes under the old keys outlived the reissue");
    reset();
  },
});

Deno.test({
  name: "a pair whose conversation ended for both gets a new one, not the dead one",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const { a, b, chat } = await openChat();
    // Over for both, and the sweeper has not come yet: the row is still there.
    await database.queryOrThrow(`UPDATE chat_participants SET gone_at = now() WHERE chat_id = $1`, [chat]);
    await database.queryOrThrow(`DELETE FROM matches WHERE chat_id = $1`, [chat]);
    reset();
    const mine = await seedPhrase(a.identity_id, "снова у реки");
    const theirs = await seedPhrase(b.identity_id, "снова у залива");
    // b's like from openChat still stands, so a's like on b's new phrase is
    // already mutual: the match forms there.
    const again = await like(a, theirs);
    const made = stateOf(again) === "matched" ? again : await like(b, mine);
    assertEquals(stateOf(made), "matched", `the pair could not match again after their conversation ended: ${JSON.stringify(made.body)}`);
    const id = (made.body as { match_id: string }).match_id;
    await consent(a, id);
    const agreed = await consent(b, id);
    const fresh = (agreed.body as { chat_id: string }).chat_id;
    assert(fresh && fresh !== chat, "the pair was put back into the conversation that had ended for both");
    const [live] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM chat_participants WHERE chat_id = $1 AND gone_at IS NULL`, [fresh]);
    assertEquals(live.n, 2);
    reset();
  },
});

// ── Small tails of the 21–22.09 panels, with a database ────────────────────────
Deno.test({
  name: "the queue's x-total-count counts the whole queue, not the page of 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 201 waiting phrases of a brand of their own: one author each, as the
    // one-waiting-per-author index requires.
    const brand = `tail-${crypto.randomUUID().slice(0, 8)}`;
    await database.queryOrThrow(
      `WITH ids AS (SELECT gen_random_uuid() AS id FROM generate_series(1, 201))
       , who AS (INSERT INTO identities (id, name, age, identity_public_key) SELECT id, 'x', 30, 'k' FROM ids RETURNING id)
       INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius)
       SELECT gen_random_uuid(), $1, id, 'в очереди', 'alone', 'und', 60.17, 24.94, 1000 FROM who`,
      [brand]);
    const moderator = await panelAs("moderator", brand);
    const queue = await moderator("GET", "/admin/feed-queue");
    assertEquals((queue.body as unknown[]).length, 200);
    assertEquals(queue.headers.get("x-total-count"), "201", "the count was the page, not the queue");
  },
});

Deno.test({
  name: "a waiting phrase whose author is gone still shows in the queue, marked",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const [row] = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius)
       VALUES (gen_random_uuid(), 'gone-brand', NULL, 'автора нет', 'alone', 'und', 60.17, 24.94, 1000) RETURNING id`);
    // A brand of its own: the 200-long page of the platform queue is someone else's test.
    const moderator = await panelAs("moderator", "gone-brand");
    const seen = ((await moderator("GET", "/admin/feed-queue")).body as Array<Record<string, unknown>>)
      .find((i) => i.id === row.id);
    assert(seen, "an authorless waiting phrase is invisible to the moderator");
    assertEquals(seen.name_state, "gone");
  },
});

Deno.test({
  name: "registration refuses a name with characters nobody can see",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const answer = await call("POST", "/identities", {
      headers: { "x-api-key": KEY_ID },
      body: {
        sign_pub: auth.bytesToBase64url(spki),
        wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
        name: "Ан\u200bя",
        age: 30,
        auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
        share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
        recovery_lookup_id: crypto.randomUUID(),
      },
    });
    assertEquals(answer.status, 400, JSON.stringify(answer.body));
  },
});

Deno.test({
  name: "PATCH /identities/me: the pause stops a new name; [] clears languages; null clears a bound",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const who = await author();
    assertEquals((await patchMe(who, { languages: ["ru", "en"], filter_age_min: 30 })).status, 200);
    assertEquals((await patchMe(who, { languages: [] })).status, 200);
    assertEquals((await profileOf(who.identity_id)).languages, [], "[] did not clear the languages");
    assertEquals((await patchMe(who, { filter_age_min: null })).status, 200);
    assertEquals((await profileOf(who.identity_id)).filter_age_min, null, "null did not clear the bound");
    // Five refusals in the hour: the queue's pause, and a name is text for the queue.
    await database.queryOrThrow(
      `UPDATE identity_stats SET rejected_at_recent = ARRAY[now(), now(), now(), now(), now()] WHERE identity = $1`,
      [who.identity_id]);
    const paused = await patchMe(who, { name: "Анна" });
    assertEquals(paused.status, 429, JSON.stringify(paused.body));
    assertEquals((paused.body as { error: { code: string } }).error.code, "paused");
    // The pause is about text for the queue, not the rest of the profile.
    assertEquals((await patchMe(who, { languages: ["ru"] })).status, 200);
    reset();
  },
});

// ── The inbox cursor (step-7 panel #5; protocol §6: ?after, {items, next}) ─────
Deno.test({
  name: "the inbox pages past a hundred with a cursor, and a foreign cursor is refused",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const me = await author();
    // 101 offers to talk, each with a partner of its own, a microsecond apart.
    await database.queryOrThrow(
      `WITH n AS (SELECT g, gen_random_uuid() AS partner, gen_random_uuid() AS match FROM generate_series(1, 101) g)
       , who AS (INSERT INTO identities (id, name, age, identity_public_key) SELECT partner, 'п' || g, 30, 'k' FROM n)
       , m AS (INSERT INTO matches (id, pair_key, created_at, expires_at)
               SELECT match, 'page-' || match, now() - g * interval '1 microsecond', now() + interval '1 hour' FROM n)
       INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
       SELECT match, $1::uuid, gen_random_uuid(), 'моя', 'alone' FROM n
       UNION ALL
       SELECT match, partner, gen_random_uuid(), 'его ' || g, 'alone' FROM n`,
      [me.identity_id]);
    const page = async (after?: string) =>
      await signedCall(me.pair.privateKey, me.session_id, "GET", `/inbox${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    const first = await page();
    const firstBody = first.body as { items: Array<{ id: string }>; next?: string };
    assertEquals(firstBody.items.length, 100);
    assert(firstBody.next, "a full page gave no cursor to the next one");
    const second = await page(firstBody.next);
    const secondBody = second.body as { items: Array<{ id: string }>; next?: string };
    assertEquals(secondBody.items.length, 1, "the second page did not hold the one left");
    assertEquals(secondBody.next, undefined, "the last page offered a cursor");
    const ids = new Set([...firstBody.items, ...secondBody.items].map((i) => i.id));
    assertEquals(ids.size, 101, "a row was repeated or lost between pages");
    assertEquals((await page("not-a-cursor")).status, 400);
    reset();
  },
});

Deno.test({
  name: "the inbox cursor crosses from offers to conversations without losing a row",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const { a, chat } = await openChat();
    const second = await openChat();
    // a in a second conversation too: move b's chat of the second pair onto a.
    await database.queryOrThrow(
      `UPDATE chat_participants SET identity = $1 WHERE chat_id = $2 AND identity = $3`,
      [a.identity_id, second.chat, second.a.identity_id]);
    // Exactly a page of offers to talk before them.
    await database.queryOrThrow(
      `WITH n AS (SELECT g, gen_random_uuid() AS partner, gen_random_uuid() AS match FROM generate_series(1, 100) g)
       , who AS (INSERT INTO identities (id, name, age, identity_public_key) SELECT partner, 'п' || g, 30, 'k' FROM n)
       , m AS (INSERT INTO matches (id, pair_key, created_at, expires_at)
               SELECT match, 'cross-' || match, now() - g * interval '1 microsecond', now() + interval '1 hour' FROM n)
       INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
       SELECT match, $1::uuid, gen_random_uuid(), 'моя', 'alone' FROM n
       UNION ALL
       SELECT match, partner, gen_random_uuid(), 'его ' || g, 'alone' FROM n`,
      [a.identity_id]);
    const page = async (after?: string) => (await signedCall(a.pair.privateKey, a.session_id, "GET",
      `/inbox${after ? `?after=${encodeURIComponent(after)}` : ""}`)).body as { items: Array<{ id: string; kind: string }>; next?: string };
    const first = await page();
    assertEquals(first.items.length, 100);
    assert(first.items.every((i) => i.kind === "match"), "the first page mixed runs");
    assert(first.next, "a page of offers with conversations behind it gave no cursor");
    const rest = await page(first.next);
    assertEquals(rest.items.map((i) => i.kind), ["chat", "chat"], "the conversations did not follow the offers");
    assertEquals(new Set(rest.items.map((i) => i.id)), new Set([chat, second.chat]));
    assertEquals(rest.next, undefined);
    reset();
  },
});

// ── Support requests (protocol §4.10, schema support_requests; screen 14) ──────
const nonce16 = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));
const support = (who: { pair: CryptoKeyPair; session_id: string }, method: string, path: string, body?: unknown) =>
  signedCall(who.pair.privateKey, who.session_id, method, path, body, { "x-api-key": KEY_ID });

Deno.test({
  name: "a request gets a random number at once, lists as one's own, and a repeat of its nonce is the same request",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const nonce = nonce16();
    const sent = await support(me, "POST", "/support", { body: "не приходит код", email: "me@example.org", nonce });
    assertEquals(sent.status, 201, JSON.stringify(sent.body));
    const no = (sent.body as { public_no: string }).public_no;
    assert(/^[0-9A-HJKMNP-TV-Z]{10}$/.test(no), `not ten Crockford characters: ${no}`);
    const again = await support(me, "POST", "/support", { body: "не приходит код", email: "me@example.org", nonce });
    assertEquals([again.status, (again.body as { public_no: string }).public_no], [201, no], `a repeated nonce made a second request: ${again.status} ${JSON.stringify(again.body)}`);
    const list = await support(me, "GET", "/support");
    assertEquals(list.status, 200);
    const mine = list.body as Array<Record<string, unknown>>;
    assertEquals(mine.length, 1);
    assertEquals(mine[0].public_no, no);
    assertEquals([mine[0].body, mine[0].answer, mine[0].answer_seen], ["не приходит код", null, false]);
    // Another person's list does not show it.
    const other = await author();
    assertEquals(((await support(other, "GET", "/support")).body as unknown[]).length, 0);
    // Too long, empty, and no nonce.
    assertEquals((await support(me, "POST", "/support", { body: "а".repeat(2001), nonce: nonce16() })).status, 400);
    assertEquals((await support(me, "POST", "/support", { body: "   ", nonce: nonce16() })).status, 400);
    assertEquals((await support(me, "POST", "/support", { body: "без nonce" })).status, 400);
  },
});

Deno.test({
  name: "the fourth request in a day is 429 with the storefront's support address",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    for (let i = 0; i < 3; i++) {
      assertEquals((await support(me, "POST", "/support", { body: `обращение ${i}`, nonce: nonce16() })).status, 201);
    }
    const fourth = await support(me, "POST", "/support", { body: "четвёртое", nonce: nonce16() });
    assertEquals(fourth.status, 429, JSON.stringify(fourth.body));
    assert((fourth.body as { error: { message: string } }).error.message.includes("support@alpha.test"),
      "the refusal did not name where to write instead");
  },
});

Deno.test({
  name: "an answer's dot goes out only for its owner; a stranger's or a made-up number is 204 and changes nothing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const no = ((await support(me, "POST", "/support", { body: "вопрос", nonce: nonce16() })).body as { public_no: string }).public_no;
    await database.queryOrThrow(`UPDATE support_requests SET answer = 'ответ', answered_at = now() WHERE public_no = $1`, [no]);
    const stranger = await author();
    assertEquals((await support(stranger, "POST", `/support/${no}/seen`)).status, 204);
    const seenAfterStranger = await database.queryOrThrow<{ answer_seen: boolean }>(
      `SELECT answer_seen FROM support_requests WHERE public_no = $1`, [no]);
    assertEquals(seenAfterStranger[0].answer_seen, false, "a stranger put out someone else's dot");
    assertEquals((await support(me, "POST", "/support/0000000000/seen")).status, 204);
    assertEquals((await support(me, "POST", `/support/${no}/seen`)).status, 204);
    const seen = await database.queryOrThrow<{ answer_seen: boolean }>(
      `SELECT answer_seen FROM support_requests WHERE public_no = $1`, [no]);
    assertEquals(seen[0].answer_seen, true);
  },
});

Deno.test({
  name: "a frozen session may write one request a day and sees no list",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    await database.queryOrThrow(
      `UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
    const first = await support(me, "POST", "/support", { body: "заблокировали", nonce: nonce16() });
    assertEquals(first.status, 201, JSON.stringify(first.body));
    const [row] = await database.queryOrThrow<{ from_frozen: boolean }>(
      `SELECT from_frozen FROM support_requests WHERE public_no = $1`, [(first.body as { public_no: string }).public_no]);
    assertEquals(row.from_frozen, true);
    assertEquals((await support(me, "POST", "/support", { body: "ещё раз", nonce: nonce16() })).status, 429);
    assertEquals((await support(me, "GET", "/support")).status, 401, "a frozen session was shown the list");
  },
});

Deno.test({
  name: "closing an identity cuts its support requests loose, as screen 14 promises",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const no = ((await support(me, "POST", "/support", { body: "закрываюсь", nonce: nonce16() })).body as { public_no: string }).public_no;
    await database.queryOrThrow(`UPDATE identities SET closed_at = now() WHERE id = $1`, [me.identity_id]);
    const { sweepIdentities } = await import("../src/lib/identity_sweeper.ts");
    await sweepIdentities();
    const [row] = await database.queryOrThrow<{ identity: string | null }>(
      `SELECT identity FROM support_requests WHERE public_no = $1`, [no]);
    assertEquals(row.identity, null, "a closed identity is still tied to its support request");
  },
});

Deno.test({
  name: "support: the fourth answers with Retry-After; only a PIN-frozen session with no live sibling may write",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    for (let i = 0; i < 3; i++) await support(me, "POST", "/support", { body: `обращение ${i}`, nonce: nonce16() });
    const fourth = await support(me, "POST", "/support", { body: "четвёртое", nonce: nonce16() });
    assertEquals(fourth.status, 429);
    const after = Number(fourth.headers.get("retry-after"));
    assert(after > 0 && after <= 24 * 3600, `no usable Retry-After on the 429: ${fourth.headers.get("retry-after")}`);

    // Frozen by a transfer: support is not open to it (screen 14; chat spec §8.2).
    const moved = await author();
    await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [moved.session_id]);
    assertEquals((await support(moved, "POST", "/support", { body: "перенесли", nonce: nonce16() })).status, 401,
      "a session frozen by a transfer wrote to support");

    // Frozen by the PIN limit, but the identity has another live session: that one writes, not this.
    const twice = await author();
    await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [twice.session_id]);
    await database.queryOrThrow(
      `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key) VALUES (gen_random_uuid(), $1, 'k', 'w')`,
      [twice.identity_id]);
    assertEquals((await support(twice, "POST", "/support", { body: "есть живая", nonce: nonce16() })).status, 401,
      "a frozen session wrote to support while the identity had a live one");
  },
});

Deno.test({
  name: "a support request is kept a year from created_at, and not a day longer",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const old = ((await support(me, "POST", "/support", { body: "давнее", nonce: nonce16() })).body as { public_no: string }).public_no;
    const recent = ((await support(me, "POST", "/support", { body: "недавнее", nonce: nonce16() })).body as { public_no: string }).public_no;
    await database.queryOrThrow(`UPDATE support_requests SET created_at = now() - interval '1 year 1 day' WHERE public_no = $1`, [old]);
    await database.queryOrThrow(`UPDATE support_requests SET created_at = now() - interval '364 days' WHERE public_no = $1`, [recent]);
    const { sweepSupport } = await import("../src/lib/support_sweeper.ts");
    const swept = await sweepSupport();
    assert(swept >= 1, "the sweeper deleted nothing");
    const left = await database.queryOrThrow<{ public_no: string }>(
      `SELECT public_no FROM support_requests WHERE public_no = ANY($1::text[])`, [[old, recent]]);
    assertEquals(left.map((r) => r.public_no), [recent], "a request outlived its year, or one inside it went");
  },
});

Deno.test({
  name: "a person who stepped away can still write to support (owner's decision of 2026-09-22)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    await database.queryOrThrow(
      `UPDATE identities SET stepped_away_until = now() + interval '1 day' WHERE id = $1`, [me.identity_id]);
    const sent = await support(me, "POST", "/support", { body: "я отошёл, но нужна помощь", nonce: nonce16() });
    assertEquals(sent.status, 201, JSON.stringify(sent.body));
    // Only writing: the list stays behind the step-away like every other route.
    assertEquals((await support(me, "GET", "/support")).status, 409);
  },
});

// ── The team's daily digest of support requests (chat spec §13) ────────────────
Deno.test({
  name: "the support digest counts per storefront — new, waiting, from a frozen session — and carries no request text",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const secret = `тайна-${crypto.randomUUID()}`;
    const sent = await support(me, "POST", "/support", { body: secret, nonce: nonce16() });
    assertEquals(sent.status, 201);
    const [row] = await database.queryOrThrow<{ brand: string | null }>(
      `SELECT brand FROM support_requests WHERE public_no = $1`, [(sent.body as { public_no: string }).public_no]);
    assertEquals(row.brand, "alpha", "the request did not keep the storefront it came through");
    const frozenOne = await author();
    await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [frozenOne.session_id]);
    assertEquals((await support(frozenOne, "POST", "/support", { body: "заморожен", nonce: nonce16() })).status, 201);

    const { supportDigest } = await import("../src/lib/support_sweeper.ts");
    const digest = await supportDigest();
    const alpha = digest.find((d) => d.brand === "alpha");
    assert(alpha, "no line for the storefront");
    assert(alpha.new >= 2 && alpha.waiting >= 2 && alpha.frozen >= 1, JSON.stringify(alpha));

    const { supportDigestBlocks } = await import("../src/lib/mailer.ts");
    const letter = JSON.stringify(supportDigestBlocks(alpha));
    assert(!letter.includes(secret), "the digest carried the text of a request");
    assert(letter.includes(String(alpha.new)) && letter.includes(String(alpha.frozen)), "the digest did not carry its numbers");
  },
});

// Watchdog С3's other half (docs/watchdogs_RU.md): tombstones of jobs other
// than prune_dsa_records, which has its own urgent letter, go as a line in the
// same daily digest — to every face, even one with no requests that day
// (loop, 2026-09-24; open.tsv watchdogs.jobs.unbuilt).
Deno.test({
  name: "the daily digest names jobs that gave up, and goes out for them alone",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const kind = `test_job_${crypto.randomUUID().slice(0, 8)}`;
    await database.queryOrThrow(
      `INSERT INTO jobs (kind, payload, run_at, attempts, locked_until) VALUES ($1, '{}'::jsonb, now(), 8, 'infinity')`, [kind]);
    try {
      const { supportDigest } = await import("../src/lib/support_sweeper.ts");
      const digest = await supportDigest();
      const quiet = await database.queryOrThrow<{ key: string }>(
        `SELECT key FROM brands WHERE key NOT IN (SELECT DISTINCT brand FROM support_requests WHERE brand IS NOT NULL) LIMIT 1`);
      if (quiet[0]) {
        assert(digest.some((d) => d.brand === quiet[0].key), "a face with no requests got no digest though a job gave up");
      }
      const line = digest[0];
      assert(line.tombstones?.some((t) => t.kind === kind && t.count === 1), `the digest does not name the job: ${JSON.stringify(line.tombstones)}`);
      const { supportDigestBlocks } = await import("../src/lib/mailer.ts");
      assert(JSON.stringify(supportDigestBlocks(line)).includes(kind), "the letter does not name the job that gave up");
    } finally {
      await database.queryOrThrow(`DELETE FROM jobs WHERE kind = $1`, [kind]);
    }
  },
});

Deno.test("the support digest does not send the team to a panel page that does not exist", async () => {
  const { supportDigestBlocks } = await import("../src/lib/mailer.ts");
  const letter = JSON.stringify(supportDigestBlocks({ new: 1, waiting: 1, frozen: 0 }));
  const { match } = await import("../src/lib/router.ts");
  if (letter.includes("panel")) {
    assert(match("GET", "/admin/support"), "the digest points at the panel, and the panel has no support page");
  }
});

// ── Support, the team's side (protocol §4.10a) ────────────────────────────────
Deno.test({
  name: "the team reads its own brand's requests without the author, answers once or again, and a viewer cannot",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const text = `нужна помощь ${crypto.randomUUID().slice(0, 6)}`;
    const no = ((await support(me, "POST", "/support", { body: text, nonce: nonce16() })).body as { public_no: string }).public_no;
    const moderator = await panelAs("moderator", "alpha");
    const list = await moderator("GET", "/admin/support");
    assertEquals(list.status, 200, JSON.stringify(list.body));
    const row = (list.body as Array<Record<string, unknown>>).find((r) => r.public_no === no);
    assert(row, "the brand's moderator does not see the request");
    assertEquals(row.body, text);
    assert(!JSON.stringify(row).includes(me.identity_id), "the author's identity reached the panel");
    const stranger = await panelAs("moderator", "some-other-brand");
    assertEquals(((await stranger("GET", "/admin/support")).body as unknown[]).find((r) => (r as { public_no: string }).public_no === no), undefined);
    assertEquals((await stranger("POST", `/admin/support/${row.id}/answer`, { answer: "чужое" })).status, 404);
    assertEquals((await (await panelAs("viewer"))("GET", "/admin/support")).status, 403);
    assertEquals((await moderator("POST", `/admin/support/${row.id}/answer`, { answer: "а".repeat(4001) })).status, 400);

    assertEquals((await moderator("POST", `/admin/support/${row.id}/answer`, { answer: "попробуйте ещё раз" })).status, 200);
    await support(me, "POST", `/support/${no}/seen`);
    // A second answer lights the dot again (§13).
    assertEquals((await moderator("POST", `/admin/support/${row.id}/answer`, { answer: "и вот ещё" })).status, 200);
    const mine = ((await support(me, "GET", "/support")).body as Array<Record<string, unknown>>).find((r) => r.public_no === no)!;
    assertEquals([mine.answer, mine.answer_seen], ["и вот ещё", false]);
  },
});

// ── GET /likes (depth-client §4.10, screen 25): a liked phrase leaves the feed ──
const feedIds = async (who: { pair: CryptoKeyPair; session_id: string }) => {
  const r = await signedCall(who.pair.privateKey, who.session_id, "GET", "/feed?lat=60.17&lon=24.94&radius=1000");
  assertEquals(r.status, 200, JSON.stringify(r.body));
  return (r.body as { items: Array<{ id: string }> }).items.map((i) => i.id);
};
const likesOf = async (who: { pair: CryptoKeyPair; session_id: string }, after?: string) => {
  const r = await signedCall(who.pair.privateKey, who.session_id, "GET", after ? `/likes?after=${after}` : "/likes");
  assertEquals(r.status, 200, JSON.stringify(r.body));
  return r.body as { items: Array<{ id: string; state: string; text: string; liked_at: number }>; next: string | null };
};

Deno.test({ name: "a liked phrase leaves my feed, not anybody else's, and waits in my likes", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const c = await author();
  await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  assert((await feedIds(a)).includes(theirs), "the fixture phrase is not in the feed to begin with");

  assertEquals(stateOf(await like(a, theirs)), "liked");
  assertEquals((await feedIds(a)).includes(theirs), false, "a liked phrase stayed in the liker's feed");
  assert((await feedIds(c)).includes(theirs), "a like took the phrase out of somebody else's feed");
  const list = await likesOf(a);
  assertEquals(list.items.map((i) => [i.id, i.state, i.text]), [[theirs, "liked", "гуляю у залива"]]);
  assertEquals((await likesOf(c)).items.length, 0, "another person's likes leaked into this list");
  reset();
});

Deno.test({ name: "a like that became a match is listed as matched, on both sides", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?", "company");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  await like(a, theirs);
  assertEquals(stateOf(await like(b, mine)), "matched");
  assertEquals((await likesOf(a)).items.map((i) => [i.id, i.state]), [[theirs, "matched"]]);
  assertEquals((await likesOf(b)).items.map((i) => [i.id, i.state]), [[mine, "matched"]]);
  reset();
});

Deno.test({ name: "a like taken back returns the phrase to the feed, and a block takes it out of the list", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const c = await author();
  await seedPhrase(a.identity_id, "кто на набережную?");
  const fromB = await seedPhrase(b.identity_id, "гуляю у залива");
  const fromC = await seedPhrase(c.identity_id, "ищу компанию на пробежку");
  await like(a, fromB);
  await like(a, fromC);
  assertEquals((await likesOf(a)).items.map((i) => i.id), [fromC, fromB], "not newest like first");

  await signedCall(a.pair.privateKey, a.session_id, "DELETE", `/feed/${fromB}/like`);
  assert((await feedIds(a)).includes(fromB), "a like taken back did not return the phrase to the feed");
  assertEquals((await likesOf(a)).items.map((i) => i.id), [fromC]);

  await signedCall(c.pair.privateKey, c.session_id, "POST", "/blocks", { feed: await seedPhrase(a.identity_id, "ещё одна"), nonce: nonce() });
  assertEquals((await likesOf(a)).items.length, 0, "a phrase of somebody who blocked me stayed in my likes");
  reset();
});

Deno.test({ name: "the likes list pages by the time of the like, and refuses a cursor it did not give", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const ids: string[] = [];
  for (let i = 0; i < 32; i++) {
    const id = await seedPhrase(b.identity_id, `фраза ${i}`);
    ids.push(id);
    // Straight into the table: the like rules are tested above, and 32 likes
    // through the route would spend the hour's allowance.
    await database.queryOrThrow(
      `INSERT INTO likes (liker_identity, feed_message_id, created_at) VALUES ($1, $2, now() - ($3 || ' seconds')::interval)`,
      [a.identity_id, id, String(100 - i)],
    );
  }
  const first = await likesOf(a);
  assertEquals(first.items.length, 30);
  assert(first.next, "a full page came back without a cursor");
  const second = await likesOf(a, first.next!);
  const seen = [...first.items, ...second.items].map((i) => i.id);
  assertEquals(seen.length, 32, "the second page lost or repeated likes");
  assertEquals(new Set(seen).size, 32);
  assertEquals(seen[0], ids[31], "the newest like is not first");
  assertEquals(second.next, null, "a short page still offered a cursor");

  for (const junk of ["yesterday", `9999999999999999999_${crypto.randomUUID()}`, `1_${"-".repeat(36)}`]) {
    const bad = await signedCall(a.pair.privateKey, a.session_id, "GET", `/likes?after=${junk}`);
    assertEquals(bad.status, 400, `the cursor ${junk} was not refused as a bad cursor`);
  }
  reset();
});

// The feed's own lesson (routes/feed.ts): a cursor that loses the microseconds
// drops rows at a page boundary. Thirty-two likes inside one millisecond, apart
// by microseconds, must all come back once across two pages (data lens, 23.09.2026).
Deno.test({ name: "likes inside one millisecond page without losing one", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const ids: string[] = [];
  for (let i = 0; i < 32; i++) ids.push(await seedPhrase(b.identity_id, `в одну миллисекунду ${i}`));
  // One statement, so one now(): row by row, each insert had its own
  // transaction's clock and the likes spread over several milliseconds,
  // which let a millisecond cursor pass this test (seen 23.09.2026).
  await database.queryOrThrow(
    `INSERT INTO likes (liker_identity, feed_message_id, created_at)
     SELECT $1, id, date_trunc('milliseconds', now()) + (n * 10) * interval '1 microsecond'
       FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, n)`,
    [a.identity_id, ids],
  );
  const first = await likesOf(a);
  const second = await likesOf(a, first.next!);
  const seen = [...first.items, ...second.items].map((i) => i.id);
  assertEquals(new Set(seen).size, 32, `likes were lost or repeated across the page boundary: ${seen.length} seen`);
  reset();
});

// Density reads what the feed would deliver (routes/feed.ts): what the viewer
// liked or hid is gone from their feed, so it is gone from their density too —
// and only from theirs (review panel 23.09.2026).
Deno.test({ name: "density leaves out what the viewer liked or hid, and only for them", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const here = { lat: -33.87, lon: 151.21 };
  const { quantise } = await import("../src/lib/feed_geo.ts");
  const at = quantise(here, 1000);
  const a = await author();
  const b = await author();
  const c = await author();
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
  // A's own live phrase, which a like needs, is elsewhere: in this circle it
  // would keep A's density at "few" whatever A liked.
  await seedPhrase(a.identity_id, "своя фраза А");
  const liked = await put(b.identity_id, "фраза для лайка");
  const hidden = await put(b.identity_id, "фраза для скрытия");
  const density = async (who: typeof a) => {
    const got = await signedCall(who.pair.privateKey, who.session_id, "GET",
      `/feed/density?lat=${here.lat}&lon=${here.lon}&radius=1000`);
    assertEquals(got.status, 200, JSON.stringify(got.body));
    return (got.body as { step: string }).step;
  };
  const before = await density(a);
  assert(before !== "none", "the fixture phrases are not in A's density to begin with");
  assertEquals(stateOf(await like(a, liked)), "liked");
  await signedCall(a.pair.privateKey, a.session_id, "POST", "/hidden", { feed: hidden });
  assertEquals(await density(a), "none", "density still counts what A liked or hid");
  assertEquals(await density(c), before, "A's like and hide changed somebody else's density");
  reset();
});

// ── Stepping away (chat §8.2, protocol §4.9) ─────────────────────────────────────
const awayNonce = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));

Deno.test({
  name: "stepping away takes one's phrases and given likes, marks one's conversations, and closes the product",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, chat } = await openChat();
    const c = await author();
    const theirs = await seedPhrase(c.identity_id, "ищу компанию на пробежку");
    assertEquals(stateOf(await like(a, theirs)), "liked");
    assertEquals(await likeCount(theirs), 1);
    const [before] = await database.queryOrThrow<{ likes_received: number }>(
      `SELECT likes_received FROM identity_stats WHERE identity = $1`, [c.identity_id]);
    const given = async () => Number((await database.queryOrThrow<{ likes_given: number }>(
      `SELECT likes_given FROM identity_stats WHERE identity = $1`, [a.identity_id]))[0].likes_given);
    const givenBefore = await given();
    assert(givenBefore >= 2, "the fixture gave fewer likes than it meant to");

    const t0 = Math.floor(Date.now() / 1000);
    const away = await matchCall(a, "POST", "/away", { span: "short", nonce: awayNonce() });
    assertEquals(away.status, 200, JSON.stringify(away.body));
    const until = (away.body as { until: number }).until;
    assert(Math.abs(until - (t0 + 20 * 60)) <= 5, `the short span is not twenty minutes: ${until - t0}s`);

    const count = async (sql: string, arg: string) =>
      Number((await database.queryOrThrow<{ n: string }>(sql, [arg]))[0].n);
    assertEquals(await count(`SELECT count(*)::text AS n FROM feed_messages WHERE author_identity = $1`, a.identity_id), 0,
      "one's phrases survived the step away");
    assertEquals(await count(`SELECT count(*)::text AS n FROM likes WHERE liker_identity = $1`, a.identity_id), 0,
      "one's given likes survived the step away");
    assertEquals(await likeCount(theirs), 0, "the liked phrase kept the count of a like that is gone");
    const [after] = await database.queryOrThrow<{ likes_received: number }>(
      `SELECT likes_received FROM identity_stats WHERE identity = $1`, [c.identity_id]);
    assertEquals(Number(after.likes_received), Number(before.likes_received) - 1, "the author's received count did not move back");
    assertEquals(await given(), givenBefore - 2, "one's own given count did not move back by the likes taken");
    assert(await count(`SELECT count(*)::text AS n FROM feed_messages WHERE author_identity = $1`, b.identity_id) > 0,
      "the other side's phrases went with one's own");
    const [mark] = await database.queryOrThrow<{ away_marked: boolean }>(
      `SELECT away_marked FROM chat_participants WHERE chat_id = $1 AND identity = $2`, [chat, a.identity_id]);
    assertEquals(mark.away_marked, true, "the conversation was not marked away");

    // Nothing of the product while away, but the profile and the way back.
    const inbox = await matchCall(a, "GET", "/inbox");
    assertEquals(inbox.status, 409);
    assertEquals((inbox.body as { error: { code: string } }).error.code, "stepped_away");
    assertEquals((await matchCall(a, "GET", "/identities/me")).status, 200);
    assertEquals((await matchCall(a, "DELETE", "/away")).status, 204);
    assertEquals((await matchCall(a, "GET", "/inbox")).status, 200, "coming back did not open the product again");
  },
});

// The answer to a step away can be lost on the way back, and the client sends
// the same request again. Protocol §2: a repeated nonce answers what the first
// answered and does nothing again. The guard in front of the route refused
// anyone away before the nonce was ever looked at, so the repeat — of the one
// request that makes one away — got 409 stepped_away instead (loop quorum,
// 2026-09-24).
Deno.test({
  name: "a repeated step away, same nonce, answers what the first answered and does nothing again",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a } = await freshMatch();
    const nonce = awayNonce();
    const first = await matchCall(a, "POST", "/away", { span: "hour", nonce });
    assertEquals(first.status, 200, JSON.stringify(first.body));
    const until = async () => (await database.queryOrThrow<{ until: Date }>(
      `SELECT stepped_away_until AS until FROM identities WHERE id = $1`, [a.identity_id]))[0].until.getTime();
    const untilBefore = await until();

    const before = await replays("POST /away");
    const again = await matchCall(a, "POST", "/away", { span: "hour", nonce });
    assertEquals(await replays("POST /away"), before + 1, "the repeat is not counted as a repeat");
    assertEquals(again.status, 200, `the repeat was refused: ${JSON.stringify(again.body)}`);
    assertEquals(again.body, first.body, "the repeat answered something other than the first");
    assertEquals(await until(), untilBefore, "the repeat moved the time one comes back");
  },
});

Deno.test({
  name: "stepping away puts out a match that has not become a conversation, for the other side too",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, id } = await freshMatch();
    assertEquals((await matchCall(a, "POST", "/away", { span: "hour", nonce: awayNonce() })).status, 200);
    const theirs = (await matchCall(b, "GET", "/inbox")).body as { items: Array<{ id: string }> };
    assertEquals(theirs.items.find((i) => i.id === id), undefined, "the match stayed in the other side's inbox");
    assertEquals((await consent(b, id)).status, 404, "the other side could still agree to a match that is out");
  },
});

Deno.test({
  name: "a step away needs a span it knows and a nonce",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    for (const body of [{ span: "night", nonce: awayNonce() }, { span: "short" }, { span: "short", nonce: "x" }]) {
      assertEquals((await matchCall(me, "POST", "/away", body)).status, 400, `accepted ${JSON.stringify(body)}`);
    }
  },
});

// The profile lists one's own live phrases (protocol §4.11): the step away's
// price is counted from it, so it has to hold exactly what a step away takes.
Deno.test({
  name: "the profile lists one's own live phrases, waiting ones included, and nobody else's",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const me = await author();
    const other = await author();
    const live = await seedPhrase(me.identity_id, "живая фраза");
    await seedPhrase(other.identity_id, "чужая фраза");
    const waiting = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published)
       VALUES ($1, 'xor', $2, 'ждёт очереди', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94)`,
      [waiting, me.identity_id],
    );
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, 'истёкшая', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94,
               now() - interval '5 hours', now() - interval '1 hour')`,
      [crypto.randomUUID(), me.identity_id],
    );
    const profile = async () =>
      ((await matchCall(me, "GET", "/identities/me")).body as { phrases: Array<{ id: string; expires_at?: number }> }).phrases;
    const list = await profile();
    assertEquals(list.map((p) => p.id).sort(), [live, waiting].sort(), "the profile's phrases are not exactly one's own live ones");
    assert(typeof list.find((p) => p.id === live)?.expires_at === "number", "a published phrase came without its end");
    assertEquals(list.find((p) => p.id === waiting)?.expires_at, undefined, "a phrase waiting for the queue came with an end");
    assertEquals((await matchCall(me, "POST", "/away", { span: "short", nonce: awayNonce() })).status, 200);
    assertEquals((await profile()).length, 0, "the profile still lists phrases a step away took");
  },
});

// Lock order (review panel of the step away, 23.09.2026, data lens): the verdict
// and the consent used to take their row first and the counters second, the
// opposite of the like, the step away and the profile. A transaction that holds
// the counters and then wants the row — as a step away does — deadlocked with
// them. Both must now finish, one after the other.
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test({ name: "the verdict waits on the author's counters before the phrase, and does not deadlock", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me = await author();
  const waiting = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published)
     VALUES ($1, 'xor', $2, 'ждёт вердикта', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94)`,
    [waiting, me.identity_id],
  );
  const { publishPhrase } = await import("../src/lib/feed_verdict.ts");
  // The holder says when it has the counters, rather than a pause that a slow
  // run could outlast into a false green (panel, data lens).
  let gotCounters!: () => void;
  const counters = new Promise<void>((r) => (gotCounters = r));
  const holder = database.transaction(async (run) => {
    await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [me.identity_id]);
    gotCounters();
    await pause(300);
    await run(`SELECT 1 FROM feed_messages WHERE id = $1 FOR UPDATE`, [waiting]);
  });
  await counters;
  const verdict = publishPhrase(waiting);
  const [held, decided] = await Promise.allSettled([holder, verdict]);
  assertEquals(held.status, "fulfilled", `the counter holder died: ${JSON.stringify(held)}`);
  assertEquals(decided.status, "fulfilled", `the verdict died: ${JSON.stringify(decided)}`);
  assertEquals((decided as PromiseFulfilledResult<{ applied: boolean }>).value.applied, true);
});

Deno.test({ name: "consent waits on the pair's counters before the match, and does not deadlock", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await freshMatch();
  // The other side first: the consent that opens the chat is the one that
  // writes counters, so that is the one to race.
  assertEquals((await consent(b, id)).status, 200);
  let gotCounters!: () => void;
  const counters = new Promise<void>((r) => (gotCounters = r));
  const holder = database.transaction(async (run) => {
    await run(
      `SELECT 1 FROM identity_stats WHERE identity IN (SELECT identity FROM match_participants WHERE match_id = $1)
        ORDER BY identity FOR UPDATE`,
      [id],
    );
    gotCounters();
    await pause(300);
    await run(`SELECT 1 FROM matches WHERE id = $1 FOR UPDATE`, [id]);
  });
  await counters;
  const agreed = consent(a, id);
  const [held, answered] = await Promise.allSettled([holder, agreed]);
  assertEquals(held.status, "fulfilled", `the counter holder died: ${JSON.stringify(held)}`);
  assertEquals(answered.status, "fulfilled");
  assertEquals((answered as PromiseFulfilledResult<{ status: number }>).value.status, 200,
    "the consent answered something else than a consent — a deadlock is a 503");
});

// "About to go" (§8.11, depth-client §4.4.1; owner 23.09.2026: a flag, not a
// time): the last 65 minutes of someone else's phrase come as soon: true, in
// the feed and in the likes, and the remaining time itself never does.
Deno.test({ name: "a phrase in its last 65 minutes is marked soon, and its end is never sent", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const here = { lat: 35.68, lon: 139.69 };
  const { quantise } = await import("../src/lib/feed_geo.ts");
  const at = quantise(here, 1000);
  const viewer = await author();
  const writer = await author();
  await seedPhrase(viewer.identity_id, "своя живая, для лайка");
  const put = async (text: string, left: string) => {
    const id = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'xor', $2, $3, 'alone', 'und', $4, $5, 1000, $6, $7, now(), now() + $8::interval)`,
      [id, writer.identity_id, text, here.lat, here.lon, at.lat, at.lon, left],
    );
    return id;
  };
  const going = await put("скоро уйдёт", "30 minutes");
  const staying = await put("ещё поживёт", "3 hours");
  const feed = await signedCall(viewer.pair.privateKey, viewer.session_id, "GET",
    `/feed?lat=${here.lat}&lon=${here.lon}&radius=1000`);
  const items = (feed.body as { items: Array<Record<string, unknown>> }).items;
  assertEquals(items.find((i) => i.id === going)?.soon, true, "a phrase in its last hour is not marked soon");
  assertEquals(items.find((i) => i.id === staying)?.soon, undefined, "a phrase with hours left is marked soon");
  assert(items.every((i) => !("expires_at" in i)), "the feed sent someone else's end as a time");
  // Nor its start: the span is fixed, so a start to the second is the end to the
  // second (§8.11; the owner's decision of 2026-09-24).
  assert(items.every((i) => !("created_at" in i)), "the feed sent someone else's start, and with it the end");
  assertEquals(stateOf(await like(viewer, going)), "liked");
  const likes = (await signedCall(viewer.pair.privateKey, viewer.session_id, "GET", "/likes")).body as
    { items: Array<Record<string, unknown>> };
  assertEquals(likes.items.find((i) => i.id === going)?.soon, true, "the likes do not say a liked phrase is about to go");
  assert(likes.items.every((i) => !("expires_at" in i)), "the likes sent someone else's end as a time");
  assert(likes.items.every((i) => !("created_at" in i)), "the likes sent someone else's start, and with it the end");
  reset();
});
