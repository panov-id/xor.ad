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
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");

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

async function author() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
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

addEventListener("unload", () => {
  database.closePool();
});
