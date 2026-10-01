// The match of an offer (chat spec §8.5, S7; lib/offer_match.ts, db/062): a like
// on a phrase with a discount makes the match at once, without a like back, and
// only when both names stand. What this file proves: the one-sided match and
// its rows, the wait for the liker's name and its settlement, that the author's
// name gates it too, that the pair's live match, live chat or block stops it,
// and that the like on an offer is spent rather than taken back.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "offer-match-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "offer-match-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "offer-match-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { settleOfferLikes } = await import("../src/lib/offer_match.ts");
const { reset } = await import("../src/lib/rate_limit.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/likes.ts");

const KEY_ID = "ak_pub_offermatchtest0001";
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
        "x-origin-token": "offer-match-origin-token",
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

type Person = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function signedCall(who: Person, method: string, path: string, body?: unknown) {
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

async function person(age = 30): Promise<Person> {
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
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall({ ...created, pair }, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

// A live phrase as the feed leaves it; with a discount it is a neighbour's offer.
async function seed(identity: string, text: string, opts: { discount?: string; mode?: string; hours?: number } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at, discount_value, conditions)
     VALUES ($1, 'xor', $2, $3, $4, 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now(), now() + ($5 || ' hours')::interval, $6, $7)`,
    [id, identity, text, opts.mode ?? "alone", String(opts.hours ?? 3), opts.discount ?? null, opts.discount ? "самовывоз" : null],
  );
  return id;
}
const like = (who: Person, phrase: string) => signedCall(who, "POST", `/feed/${phrase}/like`);
const setName = (identity: string, state: string) =>
  database.queryOrThrow(
    `UPDATE identities SET name_state = $2, name_pending = CASE WHEN $2 = 'pending' THEN 'Анна' END WHERE id = $1`,
    [identity, state],
  );
async function matchOf(a: string, b: string) {
  const { pairKey } = await import("../src/lib/offer_match.ts");
  const rows = await database.queryOrThrow<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM matches WHERE pair_key = $1 AND expires_at > now()`, [await pairKey(a, b)],
  );
  return rows[0] ?? null;
}
const participants = (matchId: string) =>
  database.queryOrThrow<{ identity: string; message_id: string | null; text_snapshot: string | null; mode: string }>(
    `SELECT identity, message_id, text_snapshot, mode FROM match_participants WHERE match_id = $1`, [matchId],
  );
const statMatches = async (identity: string) =>
  Number((await database.queryOrThrow<{ matches: number }>(`SELECT matches FROM identity_stats WHERE identity = $1`, [identity]))[0].matches);

Deno.test("a like on an offer makes the match at once, with no phrase on the liker's side", async () => {
  reset();
  const neighbour = await person();
  const taker = await person();
  const offer = await seed(neighbour.identity_id, "отдам две табуретки", { discount: "100%", mode: "company" });
  // The taker has no phrase of their own: on an ordinary phrase that is a
  // refusal (§8.4); on an offer the like counts and makes the match.
  const liked = await like(taker, offer);
  assertEquals(liked.status, 200, JSON.stringify(liked.body));
  assertEquals(liked.body.state, "matched", `no match from the offer: ${JSON.stringify(liked.body)}`);
  const made = await matchOf(neighbour.identity_id, taker.identity_id);
  assert(made, "the match row is not there");
  assertEquals(liked.body.match_id, made.id);

  const rows = Object.fromEntries((await participants(made.id)).map((r) => [r.identity, r]));
  assertEquals(rows[taker.identity_id].message_id, null, "the one who came to the offer has a phrase");
  // The reason is one for both (§8.5): the liker's row shows the offer too.
  assertEquals(rows[taker.identity_id].text_snapshot, "отдам две табуретки");
  assertEquals(rows[taker.identity_id].mode, "company", "the liker's row does not carry the offer's mode");
  assertEquals(rows[neighbour.identity_id].message_id, offer);
  assertEquals(rows[neighbour.identity_id].text_snapshot, "отдам две табуретки");
  // The match lives as long as the offer.
  const [phrase] = await database.queryOrThrow<{ expires_at: Date }>(`SELECT expires_at FROM feed_messages WHERE id = $1`, [offer]);
  assertEquals(made.expires_at.getTime(), phrase.expires_at.getTime(), "the match's term is not the offer's");
  assertEquals(await statMatches(taker.identity_id), 1);
  assertEquals(await statMatches(neighbour.identity_id), 1);

  // Spent, not taken back (§8.4, screen 25), and GET /likes says matched.
  const back = await signedCall(taker, "DELETE", `/feed/${offer}/like`);
  assertEquals(back.body.state, "spent");
  const list = await signedCall(taker, "GET", "/likes");
  assertEquals(list.status, 200, JSON.stringify(list.body));
  const card = (list.body.items as Array<{ id: string; state: string; offer?: unknown }>).find((i) => i.id === offer);
  assert(card, "the offer is not in the liker's list");
  assertEquals(card.state, "matched");
  assert(card.offer, "the card does not say it is an offer");
  // A second like of the same pair — the neighbour's other offer — makes no
  // second match while the first lives (pair_key is unique).
  const another = await seed(neighbour.identity_id, "и стол", { discount: "50%" });
  const again = await like(taker, another);
  assertEquals(again.body.state, "liked", JSON.stringify(again.body));
  assertEquals((await matchOf(neighbour.identity_id, taker.identity_id))!.id, made.id);
  reset();
});

Deno.test("with the liker's name in the queue the like waits, and the accepted name makes the match", async () => {
  reset();
  const neighbour = await person();
  const taker = await person();
  await setName(taker.identity_id, "pending");
  const offer = await seed(neighbour.identity_id, "отдам велосипед", { discount: "100%" });
  const liked = await like(taker, offer);
  assertEquals(liked.status, 200, JSON.stringify(liked.body));
  assertEquals(liked.body, { state: "liked", name_pending: true });
  assertEquals(await matchOf(neighbour.identity_id, taker.identity_id), null, "a match was made under an unchecked name");
  // The like counted: nothing to take back, and it is not spent either — spent
  // is the match's word, and there is none.
  const [{ n }] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM likes WHERE liker_identity = $1 AND feed_message_id = $2`, [taker.identity_id, offer],
  );
  assertEquals(n, 1);
  // A refused name makes nothing either.
  await setName(taker.identity_id, "rejected");
  assertEquals(await settleOfferLikes(database.transaction, taker.identity_id), []);
  assertEquals(await matchOf(neighbour.identity_id, taker.identity_id), null);
  // The verdict accepts the name: the waiting like becomes its match.
  await setName(taker.identity_id, "accepted");
  const settled = await settleOfferLikes(database.transaction, taker.identity_id);
  assertEquals(settled.length, 1, "the waiting like did not become a match");
  const made = await matchOf(neighbour.identity_id, taker.identity_id);
  assert(made);
  assertEquals(settled[0], made.id);
  // Settling again makes nothing new.
  assertEquals(await settleOfferLikes(database.transaction, taker.identity_id), []);
  reset();
});

Deno.test("the author's name has to stand too, and a block or a live chat stops the match", async () => {
  reset();
  const neighbour = await person();
  const taker = await person();
  await setName(neighbour.identity_id, "pending");
  const offer = await seed(neighbour.identity_id, "отдам шкаф", { discount: "100%" });
  // The author's state is not the liker's business: the answer is a plain like.
  const liked = await like(taker, offer);
  assertEquals(liked.body, { state: "liked" });
  assertEquals(await matchOf(neighbour.identity_id, taker.identity_id), null, "a match was made with the author's name unchecked");
  await setName(neighbour.identity_id, "accepted");

  // A block between the two: the like does not even count.
  const blocker = await person();
  const blocked = await seed(blocker.identity_id, "отдам стул", { discount: "100%" });
  await database.queryOrThrow(
    `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [blocker.identity_id, taker.identity_id],
  );
  assertEquals((await like(taker, blocked)).body, { state: "liked" });
  assertEquals(await matchOf(blocker.identity_id, taker.identity_id), null, "a match was made over a block");

  // A live chat of the pair: the like counts and goes no further (§8.6).
  const { pairKey } = await import("../src/lib/offer_match.ts");
  const chatId = crypto.randomUUID();
  await database.queryOrThrow(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [chatId, await pairKey(neighbour.identity_id, taker.identity_id)]);
  for (const p of [neighbour, taker]) {
    await database.queryOrThrow(`INSERT INTO chat_participants (chat_id, identity) VALUES ($1, $2)`, [chatId, p.identity_id]);
  }
  assertEquals((await like(taker, offer)).body, { state: "liked" });
  assertEquals(await matchOf(neighbour.identity_id, taker.identity_id), null, "a match was made beside the pair's live chat");
  reset();
});

Deno.test("an expired offer and one's own offer make nothing", async () => {
  reset();
  const neighbour = await person();
  const taker = await person();
  const gone = await seed(neighbour.identity_id, "отдам ковёр", { discount: "100%", hours: -1 });
  assertEquals((await like(taker, gone)).body, { state: "liked" });
  assertEquals(await matchOf(neighbour.identity_id, taker.identity_id), null);
  const own = await seed(taker.identity_id, "отдам лампу", { discount: "100%" });
  assertEquals((await like(taker, own)).body, { state: "liked" });
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM match_participants WHERE identity = $1`, [taker.identity_id]);
  assertEquals(n, 0, "a match with oneself");
  reset();
});

// A waiting phrase as POST /feed leaves it for the queue: no visible_at yet.
async function waiting(identity: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, lat_published, lon_published)
     VALUES ($1, 'xor', $2, $3, 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94)`,
    [id, identity, text],
  );
  return id;
}

Deno.test("the verdict that accepts the name makes the match of the like that waited on an offer", async () => {
  reset();
  const { publishPhrase } = await import("../src/lib/feed_verdict.ts");
  const neighbour = await person();
  const taker = await person();
  await setName(taker.identity_id, "pending");
  const offer = await seed(neighbour.identity_id, "отдам кресло", { discount: "100%" });
  assertEquals((await like(taker, offer)).body, { state: "liked", name_pending: true });
  // The taker's own phrase goes through the queue with the name; the moderator
  // publishes it — and with it the name.
  const phrase = await waiting(taker.identity_id, "ищу кресло, кстати");
  const verdict = await publishPhrase(phrase);
  assertEquals(verdict.applied, true, JSON.stringify(verdict));
  assertEquals(verdict.nameAccepted, true, "the verdict did not say the name was accepted");
  const made = await matchOf(neighbour.identity_id, taker.identity_id);
  assert(made, "the waiting like did not become a match when the name passed");
  const rows = Object.fromEntries((await participants(made.id)).map((r) => [r.identity, r]));
  assertEquals(rows[taker.identity_id].message_id, null);
  // A verdict on a phrase whose author's name already stood settles nothing new.
  const second = await publishPhrase(await waiting(taker.identity_id, "ещё одна"));
  assertEquals(second.nameAccepted, undefined);
  reset();
});

Deno.test("both agree on the offer's match: the header is the offer alone, and the author's inbox shows the offer, not an empty phrase", async () => {
  reset();
  const { HALF_DOMAIN } = await import("../src/routes/matches.ts");
  await import("../src/routes/inbox.ts");
  const neighbour = await person();
  const taker = await person();
  const offer = await seed(neighbour.identity_id, "отдам две табуретки", { discount: "100%", mode: "company" });
  const liked = await like(taker, offer);
  assertEquals(liked.body.state, "matched", JSON.stringify(liked.body));
  const matchId = liked.body.match_id as string;

  // The author's inbox before anyone agreed: the reason shown is the offer.
  const inbox = await signedCall(neighbour, "GET", "/inbox");
  assertEquals(inbox.status, 200, JSON.stringify(inbox.body));
  const item = (inbox.body.items as Array<{ id: string; phrase?: { text: string; mode: string } }>).find((i) => i.id === matchId);
  assert(item, "the offer's match is not in the author's inbox");
  assertEquals(item.phrase?.text, "отдам две табуретки", "the author's inbox shows an empty phrase for the offer's match");
  assertEquals(item.phrase?.mode, "company");

  const half = async (who: Person) => {
    const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", eph.publicKey));
    const prefix = new TextEncoder().encode(HALF_DOMAIN + matchId + "\n");
    const bytes = new Uint8Array(prefix.length + spki.length);
    bytes.set(prefix); bytes.set(spki, prefix.length);
    const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
    return { ephemeral_public_key: auth.bytesToBase64url(spki), ephemeral_signature: auth.bytesToBase64url(signature) };
  };
  const first = await signedCall(taker, "POST", `/matches/${matchId}/consent`, await half(taker));
  assertEquals(first.body.state, "waiting", JSON.stringify(first.body));
  // My consent is the node's, not the client's memory (P10).
  const consentOf = async (who: Person) => {
    const got = await signedCall(who, "GET", "/inbox");
    return (got.body.items as Array<{ id: string; my_consent?: string }>).find((i) => i.id === matchId)?.my_consent;
  };
  assertEquals(await consentOf(taker), "waiting", "the inbox forgets that I already agreed");
  assertEquals(await consentOf(neighbour), "none", "the inbox says I agreed before I did");
  // Q9 (§8.5, owner 18.09.2026): the second's "not now" is told to the one
  // who agreed and waits — «предложение ушло»; taken back, the wait returns.
  // The one who declined sees nothing of it: the row is hidden on its side.
  const declined = await signedCall(neighbour, "POST", `/matches/${matchId}/decline`);
  assertEquals(declined.status, 204);
  assertEquals(await consentOf(taker), "gone", "the waiting side is not told the offer went");
  assertEquals(await consentOf(neighbour), undefined, "a declined match stays in the decliner's inbox");
  const undone = await signedCall(neighbour, "DELETE", `/matches/${matchId}/decline`);
  assertEquals(undone.status, 204);
  assertEquals(await consentOf(taker), "waiting", "the decline taken back does not return the wait");
  assertEquals(await consentOf(neighbour), "none");
  const second =await signedCall(neighbour, "POST", `/matches/${matchId}/consent`, await half(neighbour));
  assertEquals(second.body.state, "agreed", JSON.stringify(second.body));
  const chatId = second.body.chat_id as string;
  assertEquals(await consentOf(taker), undefined, "an agreed match stays a match row instead of becoming the chat");
  const starters = await database.queryOrThrow<{ position: number; text_snapshot: string; mode: string; liked_by: string }>(
    `SELECT position, text_snapshot, mode, liked_by FROM chat_starters WHERE chat_id = $1 ORDER BY position`, [chatId],
  );
  assertEquals(starters.length, 1, `the header has ${starters.length} starters: ${JSON.stringify(starters)}`);
  assertEquals(starters[0].text_snapshot, "отдам две табуретки");
  assertEquals(starters[0].mode, "company");
  assertEquals(starters[0].liked_by, taker.identity_id, "the offer is shown as liked by someone other than the one who came to it");
  reset();
});

// W13-OM · open.tsv offer.match.authorname: the likes left on this identity's
// offers while ITS name waited. settleOfferLikes() took only the likes it left
// itself (liker_identity), so the author's accepted name made no match of the
// likes on his offers, and such a like stayed "liked" for good (verifier P5).
Deno.test("the author's accepted name makes the match of the likes that waited on his offers", async () => {
  reset();
  const author = await person();
  const taker = await person();
  const other = await person();
  await setName(author.identity_id, "pending");
  const offer = await seed(author.identity_id, "отдам комод", { discount: "100%" });
  assertEquals((await like(taker, offer)).body, { state: "liked" });
  assertEquals((await like(other, offer)).body, { state: "liked" });
  assertEquals(await matchOf(author.identity_id, taker.identity_id), null, "a match was made with the author's name unchecked");
  // Settling the author before the verdict makes nothing.
  assertEquals(await settleOfferLikes(database.transaction, author.identity_id), []);
  // The verdict accepts the author's name: both waiting likes become matches.
  await setName(author.identity_id, "accepted");
  const settled = await settleOfferLikes(database.transaction, author.identity_id);
  assertEquals(settled.length, 2, "the likes on the author's offers did not become matches when his name passed");
  const withTaker = await matchOf(author.identity_id, taker.identity_id);
  const withOther = await matchOf(author.identity_id, other.identity_id);
  assert(withTaker && withOther);
  assertEquals(new Set(settled), new Set([withTaker.id, withOther.id]));
  // The liker's side is the one that came to the offer: no phrase of its own.
  const rows = Object.fromEntries((await participants(withTaker.id)).map((r) => [r.identity, r]));
  assertEquals(rows[taker.identity_id].message_id, null);
  assertEquals(rows[author.identity_id].message_id, offer);
  assertEquals(await statMatches(author.identity_id), 2);
  // Settling again makes nothing new.
  assertEquals(await settleOfferLikes(database.transaction, author.identity_id), []);
  reset();
});
