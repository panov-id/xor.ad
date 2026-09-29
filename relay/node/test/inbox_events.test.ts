// What happened since the last visit, read from the tables at GET /inbox
// (chat spec §8.12, step 8 of §13 without the games; P3). Nothing is written
// for it: a match, a consent, an opened chat and a queued reply are the rows
// they already are, and the inbox counts them against the moment the client
// names in ?since. Run through scripts/run-relay-database-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "inbox-events-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "inbox-events-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "inbox-events-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { endingSoon, parseSince, SOON_SHARE } = await import("../src/lib/inbox_events.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/likes.ts");
await import("../src/routes/matches.ts");
await import("../src/routes/chats.ts");
await import("../src/routes/inbox.ts");

const KEY_ID = "ak_pub_inboxeventstest01";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

// ── The pure parts ─────────────────────────────────────────────────────────────

Deno.test("since is unix seconds in digits, absent means everything, anything else is refused", () => {
  assertEquals(parseSince(null), null, "no since is not 'everything'");
  assertEquals(parseSince("1790000000"), 1790000000);
  assertEquals(parseSince("0"), 0);
  for (const bad of ["", "-1", "1.5", "1790000000000", "2026-09-26", "now"]) {
    assertEquals(parseSince(bad), undefined, `"${bad}" was taken for a moment`);
  }
});

Deno.test("a conversation is ending soon in the last fifth of its own span, and not once it is over", () => {
  assertEquals(SOON_SHARE, 5);
  const now = 1_790_000_000;
  // A 10-minute span: soon in the last 2 minutes.
  assert(endingSoon(now + 119, 10, now), "119 s left of 10 min is not soon");
  assert(endingSoon(now + 120, 10, now), "exactly the last fifth is not soon");
  assert(!endingSoon(now + 121, 10, now), "121 s left of 10 min is soon");
  // A 260-minute span: the last 52 minutes.
  assert(endingSoon(now + 52 * 60, 260, now));
  assert(!endingSoon(now + 53 * 60, 260, now));
  assert(!endingSoon(now, 10, now), "a conversation ending this second is soon");
  assert(!endingSoon(now - 5, 10, now), "an ended conversation is soon");
});

// ── Against the tables ─────────────────────────────────────────────────────────

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;
type Who = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "inbox-events-origin-token",
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signed(who: Who, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: { "x-identity-session": who.session_id, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
  });
}

async function author(): Promise<Who> {
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
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const who = { ...created, pair };
  const confirmed = await signed(who, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return who;
}

async function seedPhrase(identity: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'xor', $2, $3, 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94, now(), now() + interval '3 hours')`,
    [id, identity, text],
  );
  return id;
}

// Two people like each other's phrases: a match (§8.5).
async function freshMatch() {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await author();
  const b = await author();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  await signed(a, "POST", `/feed/${theirs}/like`);
  const back = await signed(b, "POST", `/feed/${mine}/like`);
  assertEquals((back.body as { state?: string }).state, "matched", `the setup did not make a match: ${JSON.stringify(back.body)}`);
  return { a, b, id: (back.body as { match_id: string }).match_id };
}

// The ephemeral half of §8.13, signed over "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI.
async function halfFor(who: Who, matchId: string) {
  const key = auth.bytesToBase64url(new Uint8Array(await crypto.subtle.exportKey(
    "spki", ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair).publicKey)));
  const prefix = new TextEncoder().encode("xor.ephemeral.v1\n" + matchId + "\n");
  const raw = auth.base64urlToBytes(key)!;
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix); bytes.set(raw, prefix.length);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
  return { ephemeral_public_key: key, ephemeral_signature: auth.bytesToBase64url(signature) };
}
const consent = async (who: Who, matchId: string) => signed(who, "POST", `/matches/${matchId}/consent`, await halfFor(who, matchId));

type Events = { new_matches: number; waiting_for_you: number; new_chats: number; pending_messages: number; ending_soon: number; extra_likes: number };
type Page = { items: Array<Record<string, unknown>>; events: Events; since?: number };
async function inbox(who: Who, since?: number): Promise<Page> {
  const answer = await signed(who, "GET", since === undefined ? "/inbox" : `/inbox?since=${since}`);
  assertEquals(answer.status, 200, `the inbox refused: ${JSON.stringify(answer.body)}`);
  return answer.body as Page;
}
const nowSeconds = () => Math.floor(Date.now() / 1000);
const ciphertext = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(64)));

const test = (name: string, fn: () => Promise<void>) => Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });

test("a new offer to talk, and the other side's agreement, are events since the last visit and not before it (P3)", async () => {
  const before = nowSeconds() - 1;
  const { a, b, id } = await freshMatch();
  // A visit after the match and before the consent below: a whole second
  // later than the match's row, since `since` is in seconds.
  const later = nowSeconds() + 1;
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const fresh = await inbox(a, before);
  assertEquals(fresh.since, before, "the answer does not echo the moment it counted from");
  assertEquals(fresh.events.new_matches, 1, "a match made after the visit is not a new match");
  assertEquals(fresh.events.waiting_for_you, 0, "nobody agreed yet and the inbox says somebody is waiting");
  const row = fresh.items.find((i) => i.id === id);
  assert(row, "the match is not in the inbox");
  assertEquals(row.arrived_since, true, "the row does not say it arrived since the visit");
  assertEquals(row.answered_since, false);

  const seen = await inbox(a, later);
  assertEquals(seen.events.new_matches, 0, "a match older than the visit is counted as new");
  assertEquals(seen.items.find((i) => i.id === id)?.arrived_since, false, "the row says it arrived after a visit that came later");

  const everything = await inbox(a);
  assert(!("since" in everything), "no since was given and the answer names one");
  assertEquals(everything.events.new_matches, 1, "without since, a live match is not new");

  await consent(b, id);
  const answered = await inbox(a, later);
  assertEquals(answered.events.new_matches, 0);
  assertEquals(answered.events.waiting_for_you, 1, "the other side agreed after the visit and it is not an event");
  assertEquals(answered.items.find((i) => i.id === id)?.answered_since, true, "the row does not say the other side answered since the visit");
  assertEquals(answered.items.find((i) => i.id === id)?.waiting_for_you, true);
  // For the one who agreed, nothing waits: the event is the other side's.
  assertEquals((await inbox(b, before)).events.waiting_for_you, 0, "one's own consent is counted as somebody waiting for oneself");
  // A visit after the agreement: the offer still waits for me, but that is
  // no longer news — the event is dated, the state is not.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const afterAll = await inbox(a, nowSeconds() + 1);
  assertEquals(afterAll.events.waiting_for_you, 0, "an agreement older than the visit is counted as an event");
  assertEquals(afterAll.items.find((i) => i.id === id)?.answered_since, false, "the row says the other side answered since a later visit");
  assertEquals(afterAll.items.find((i) => i.id === id)?.waiting_for_you, true, "the state went with the event");
});

test("a match row tells what is left of both phrases — the other's end to its match partner only, and my own phrase as mine (§8.11, N1)", async () => {
  const { a, b, id } = await freshMatch();
  const ends = async (identity: string) => Number((await database.queryOrThrow<{ e: string }>(
    `SELECT floor(extract(epoch from expires_at))::bigint::text AS e FROM feed_messages WHERE author_identity = $1`, [identity]))[0].e);
  const [endA, endB] = [await ends(a.identity_id), await ends(b.identity_id)];
  type Row = { phrase: { text: string; expires_at?: number }; my_phrase?: { text: string; mode: string; expires_at?: number } };

  const rowA = (await inbox(a)).items.find((i) => i.id === id) as unknown as Row;
  assertEquals(rowA.phrase.text, "гуляю у залива");
  assertEquals(rowA.phrase.expires_at, endB, "the other side's phrase does not carry its end to its match partner");
  assertEquals(rowA.my_phrase, { text: "кто на набережную?", mode: "alone", expires_at: endA }, "my own phrase in the match is not mine, or not with my end");

  const rowB = (await inbox(b)).items.find((i) => i.id === id) as unknown as Row;
  assertEquals(rowB.my_phrase?.text, "гуляю у залива", "the other side's row names somebody else's phrase as its own");
  assertEquals(rowB.my_phrase?.expires_at, endB);
  assertEquals(rowB.phrase.expires_at, endA);
});

test("an opened conversation, replies queued for this session and a term in its last fifth are events (P3)", async () => {
  const { a, b, id } = await freshMatch();
  await consent(a, id);
  // A visit a whole second before the chat opens, and one right after.
  const visit = nowSeconds();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const agreed = await consent(b, id);
  const afterwards = nowSeconds() + 1;
  const chat = (agreed.body as { chat_id: string }).chat_id;
  assert(chat, `the second consent did not open a chat: ${JSON.stringify(agreed.body)}`);

  const opened = await inbox(a, 0);
  assertEquals(opened.events.new_chats, 1, "a chat that opened after the visit is not a new chat");
  assertEquals(opened.events.pending_messages, 0);
  assertEquals(opened.events.ending_soon, 0, "a chat just opened is ending soon");
  const row = opened.items.find((i) => i.id === chat);
  assert(row, "the chat is not in the inbox");
  assertEquals(row.opened_since, true);
  assertEquals(row.pending_messages, 0);
  assertEquals(row.ending_soon, false);
  assert(typeof row.last_activity_at === "number" && row.last_activity_at > 1_700_000_000, "the row has no last activity in unix seconds");
  assert(!("unread" in row), "the node claims to know what was read");
  assertEquals((await inbox(a, visit)).events.new_chats, 1, "a chat opened a second after the visit is not new");
  assertEquals((await inbox(a, afterwards)).events.new_chats, 0, "a chat opened before the visit is counted as new");
  assertEquals((await inbox(a, afterwards)).items.find((i) => i.id === chat)?.opened_since, false, "the row says it opened after a visit that came later");

  // Two replies from b wait in a's queue; b's own queue is empty (§8.8).
  for (let i = 0; i < 2; i++) {
    const sent = await signed(b, "POST", `/chats/${chat}/messages`, { local_id: crypto.randomUUID(), ciphertext: ciphertext() });
    assertEquals(sent.status, 202, `the reply was refused: ${JSON.stringify(sent.body)}`);
  }
  const waiting = await inbox(a, 0);
  assertEquals(waiting.events.pending_messages, 2, "two queued replies are not two pending messages");
  assertEquals(waiting.items.find((i) => i.id === chat)?.pending_messages, 2, "the row does not count its own queued replies");
  assertEquals((await inbox(b, 0)).events.pending_messages, 0, "the sender's own replies are counted as waiting for the sender");

  // The term (one's own span, 60 minutes by default) is moved into its last
  // fifth by hand: the clock is not waited for.
  await database.queryOrThrow(
    `UPDATE chat_participants SET last_own_message_at = now() - (idle_ttl_minutes * interval '1 minute') * 0.85
      WHERE chat_id = $1 AND identity = $2`,
    [chat, a.identity_id],
  );
  const soon = await inbox(a, 0);
  assertEquals(soon.events.ending_soon, 1, "a term in its last fifth is not ending soon");
  assertEquals(soon.items.find((i) => i.id === chat)?.ending_soon, true, "the row does not say its term is ending soon");
  // The other side's term is its own: b's row is not ending soon.
  assertEquals((await inbox(b, 0)).events.ending_soon, 0, "one side's term made the other side's row ending soon");
});

// The match of an offer (§8.5, db/062; P5 → P3b): a like on my offer makes the
// match at once and the one who came has no phrase in it. My inbox names it
// as interest in my offer, with the offer whole; theirs is an ordinary match
// whose phrase is the offer. Both rows count as new since the last visit.
test("a like on my offer is interest in it in my inbox, with the offer, and a match in theirs (P3b)", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const before = nowSeconds() - 1;
  const neighbour = await author();
  const taker = await author();
  const offerId = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at, discount_value, conditions)
     VALUES ($1, 'xor', $2, 'отдам две табуретки', 'company', 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now(), now() + interval '3 hours', '100%', 'самовывоз')`,
    [offerId, neighbour.identity_id],
  );
  const liked = await signed(taker, "POST", `/feed/${offerId}/like`);
  assertEquals(liked.status, 200, JSON.stringify(liked.body));
  const { state, match_id: matchId } = liked.body as { state: string; match_id?: string };
  assertEquals(state, "matched", `the like on the offer made no match: ${JSON.stringify(liked.body)}`);
  assert(matchId, "the match has no id");

  // The offer's author: interest, with the offer as the reason.
  const mine = await inbox(neighbour, before);
  const interest = mine.items.find((i) => i.id === matchId);
  assert(interest, "the offer's match is not in the author's inbox");
  assertEquals(interest.kind, "offer_interest", "the author's inbox does not name the match as interest in the offer");
  assertEquals(interest.offer, { id: offerId, text: "отдам две табуретки", mode: "company", discount_value: "100%", conditions: "самовывоз" },
    "the offer is not carried whole");
  // The reason is one for both (P5): the phrase on the author's row is the offer too.
  assertEquals(interest.phrase, { text: "отдам две табуретки", mode: "company" }, "the author's row does not carry the offer as its phrase");
  assertEquals(interest.name, "Аня");
  assertEquals(interest.waiting_for_you, false);
  assertEquals(interest.arrived_since, true, "interest that arrived after the visit is not new");
  assertEquals(mine.events.new_matches, 1, "interest in the offer is not counted among new matches");

  // The one who came: an ordinary match whose phrase is the offer, and no offer block.
  const theirs = await inbox(taker, before);
  const match = theirs.items.find((i) => i.id === matchId);
  assert(match, "the offer's match is not in the taker's inbox");
  assertEquals(match.kind, "match", "the taker's own inbox names the match as interest in an offer");
  // With its end since N1: the offer is the match's phrase, told to its partner (§8.11).
  const { expires_at: offerEnd, ...offerPhrase } = match.phrase as { text: string; mode: string; expires_at?: number };
  assertEquals(offerPhrase, { text: "отдам две табуретки", mode: "company" }, "the taker does not see the offer as the match's phrase");
  assert(typeof offerEnd === "number" && offerEnd > nowSeconds(), "the taker is not told what is left of the offer's phrase");
  assert(!("offer" in match), "the taker was given the offer block");
  assertEquals(theirs.events.new_matches, 1);

  // The offer gone from the feed: the row stays interest, the discount goes with the phrase.
  await database.queryOrThrow(`DELETE FROM feed_messages WHERE id = $1`, [offerId]);
  const after = (await inbox(neighbour, before)).items.find((i) => i.id === matchId);
  assert(after, "the match left the inbox with the offer's phrase");
  assertEquals(after.kind, "offer_interest");
  assertEquals(after.offer, { id: offerId, text: "отдам две табуретки", mode: "company" }, "a gone offer still shows a discount, or lost its text");
});

test("since that is not a moment is refused, and a stranger's inbox has no events (P3)", async () => {
  const me = await author();
  for (const bad of ["now", "-1", "1.5", "99999999999"]) {
    const answer = await signed(me, "GET", `/inbox?since=${bad}`);
    assertEquals(answer.status, 400, `since=${bad} was accepted: ${JSON.stringify(answer.body)}`);
    assertEquals((answer.body as { error: { code: string } }).error.code, "invalid_body");
  }
  const empty = await inbox(me, 0);
  assertEquals(empty.items.length, 0);
  assertEquals(empty.events, { new_matches: 0, waiting_for_you: 0, new_chats: 0, pending_messages: 0, ending_soon: 0, extra_likes: 0 });
});
