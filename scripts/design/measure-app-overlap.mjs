// Measures OVERLAPS in the real rendered app/ shell (the dev stand http://localhost:5174, container xor-local-app): on every reachable screen
// at 390, 834, 1440 and 1920 wide it takes the visible leaf blocks (text, buttons, inputs, images) and lists every pair that is not
// ancestor/descendant and intersects by more than 2 px on both axes. Ignored: anything inside .layer-sheet, .layer-base or .dim (the layers' own stacking).
// The node is stubbed in the browser (ctx.route), so the run writes nothing to the stand's real node and the data is the same every time.
// Run by scripts/measure-app-overlap.sh inside the Playwright image on the stand's network; the exports below are reused by measure-app-motion.mjs.
//
// Output line:  OVERLAP <screen> @<width>  A=<a>  B=<b>  <w>x<h>px   (a tag marks a block that is position fixed/sticky: "[fixed]")
// Also per scene and width: CLIPPED (a visible element runs past an ancestor that clips sideways), SCROLL-X (page or panel wider than it shows), NAV-MISSING (width >= 1024, app shell only: no visible nav with 4 tab buttons);
// the rules mirror snap-svg.mjs. Exit 1 when any hit is found.
// Break test (always run first): two leaf blocks of the splash are forced onto one spot by an injected style, the run must see them, then the style is removed and must see none.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
// R-TAB6-6: open chat keys in the shell stub (scripts/design/measure-app-overlap.mjs). The node's side of depth/core/seal.ts
// wrapDirectionKeys: two fresh AES-256 direction keys wrapped under the session's wrap_pub (POST /identities), so the app's own
// unwrapConversation opens the talk; and a real P-256 long key for the peers, so safetyCode has a point to read.
const b64u = (b) => Buffer.from(b).toString("base64url");
const ECDH = { name: "ECDH", namedCurve: "P-256" };
export const PEER_SPKI = b64u(await crypto.subtle.exportKey("spki", (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])).publicKey));
const TALK_KEYS = new Map();   // chat id → [low→high, high→low], the last wrap's (R-TAB6-7)
export async function wrapFor(wrapPub, chatId, epoch) {
  const fresh = await crypto.subtle.generateKey(ECDH, false, ["deriveKey"]);
  const freshSpki = new Uint8Array(await crypto.subtle.exportKey("spki", fresh.publicKey));
  const other = await crypto.subtle.importKey("spki", Buffer.from(wrapPub, "base64url"), ECDH, false, []);
  const ikm = await crypto.subtle.deriveKey({ name: "ECDH", public: other }, fresh.privateKey, { name: "HKDF" }, false, ["deriveKey"]);
  const enc = new TextEncoder();
  const w = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(chatId), info: enc.encode("xor.wrap.v1") }, ikm, { name: "AES-GCM", length: 256 }, false, ["wrapKey"]);
  const parts = [freshSpki];
  const dir = [];
  for (const info of ["low→high", "high→low"]) {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const box = new Uint8Array(await crypto.subtle.wrapKey("raw", key, w, { name: "AES-GCM", iv, additionalData: enc.encode(`xor.wrap.v1\n${chatId}\n${epoch}\n${info}\n`) }));
    parts.push(iv, box);
    dir.push(key);
  }
  TALK_KEYS.set(chatId, dir);
  return b64u(Buffer.concat(parts));
}
// A line from the peer as depth/core/seal.ts Conversation.seal makes it: nonce ‖ AES-GCM(text, aad = the line's id), under the
// peer's direction key (direction(peer, me): ids sorted, §8.13)
export async function sealFrom(chatId, peer, me, text, id) {
  const [lowHigh, highLow] = TALK_KEYS.get(chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, peer < me ? lowHigh : highLow, new TextEncoder().encode(text)));
  return b64u(Buffer.concat([iv, box]));
}
const TALK_LINES = ["Backgammon tonight?", "The board is at mine, by the window", "Bring the dice, mine are lost"];

export const DEV = process.env.DEV_URL ?? "http://localhost:5174";
const OUT = process.env.OUT ?? "/out/measure-overlap.txt";
const TOL = 2;
export const WIDTHS = (process.env.WIDTHS ?? "390,834,1440,1920").split(",").map(Number);
const PIN = "483915";
export const feedSel = '[data-screen="feed"]';

// ── the node, stubbed ──
const NODE_PATH = /^\/(adv|o|identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away|tables|matches|chats|offers|sessions|support)(\/|$)/;
const DOCS = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
const FOUR = { d4: 2, d3: 1, e3: 2, c2: 1, d2: 2, e2: 1, b1: 1, c1: 2, d1: 1, e1: 1 };
const tonight = () => { const d = new Date(); d.setHours(23, 0, 0, 0); return d.toISOString(); };
function inboxRows() {
  const now = Math.floor(Date.now() / 1000), at = (h, m) => Math.floor(Date.UTC(2026, 9, 18, h, m) / 1000);
  const offer = (id, name, age, fresh) => ({ kind: "match", id, name, age, phrase: { text: "…", mode: "alone" }, waiting_for_you: false, state: "proposed", arrived_since: fresh });
  const keys = (peer) => ({ me: "id-stub", key_epoch: 1, rekey_requested: false, peer: { key_epoch: 1, identity_id: `id-${peer}`, identity_public_key: PEER_SPKI } });
  const talk = (id, name, age, left, last, more = {}) => ({ kind: "chat", id, name, age, state: "open", chat_expires_at: now + left * 60 - 5, my_span: 60, last_activity_at: last, ...keys(name.toLowerCase()), ...more });
  return [
    { ...offer("m1", "Nino", 27, true), phrase: { text: "Backgammon tonight?", mode: "alone" }, my_phrase: { text: "Bakery open after ten?", mode: "alone" } }, offer("m2", "Dato", 30, false), offer("m3", "Ana", 25, false),
    talk("c1", "Nino", 27, 38, at(21, 4), { pending_messages: 1 }), talk("c2", "Levan", 34, 52, at(20, 10)), talk("c3", "Mariam", 29, 12, at(18, 32)),
    talk("c4", "Giorgi", 41, 0, at(17, 5), { state: "ended", chat_expires_at: now - 60 }),
  ];
}
export const CARDS = [
  { id: "w-bg", text: "Backgammon in the yard tonight?", mode: "company", lang: "en", like_count: 12, liked: true },
  { id: "w-ladder", text: "Who has a ladder? The persimmons are ripe.", mode: "alone", lang: "en", like_count: 4 },
  { id: "w-table", kind: "table", game: "grid", set: "four", name: "Evening at the yard", playing: 2, free_seats: 2, watching: 3, like_count: 0 },   // a table between the phrases (tablet_834_Feed)
  { id: "w-offer", kind: "offer", text: "On the second dozen", mode: "alone", lang: "en", like_count: 3, offer: { discount_value: "20%", conditions: "Dine in only", venue_name: "Khinkali Bar" } },
  { id: "w-cat", text: "Lost a grey cat near the bakery — Barsik", mode: "alone", lang: "en", like_count: 1 },
  { id: "w-choir", text: "Choir on Thursday, flat 12. Any voice!", mode: "party", lang: "en", like_count: 9 },
];
const tableView = (id) => ({
  id, class: "grid", set: "four", seat: 1, is_playing: true, playing: 2, watching: 0, name: "Evening at the yard", like_count: 0, lines: [ // R-TAB16-2 item 3: the talk at the table shows on the 1440+ sheets
    { id: "l1", seat: 2, kind: "line", text: "Good evening! Ready?", created_at: 1 },
    { id: "l2", seat: 1, kind: "line", text: "Ready, your move", created_at: 2 },
    { id: "l3", seat: 2, kind: "sticker", sticker: "hi", created_at: 3 }],
  seats: [{ seat: 1, name: "Alex", role: "playing" }, { seat: 2, name: "Nino", role: "playing" }],
  board: { seq: 7, state: { grid: { cells: Object.fromEntries(Object.entries(FOUR).map(([c, seat]) => [c, { seat, piece: "O" }])), claim: null, rules: "four" } }, turn: 1, score: {}, expires_at: Math.floor(Date.now() / 1000) + 100, pending: null },
});
/** The stub. opts.feedDelay: ms the GET /feed answer is held; opts.signedIn/linkOk: the cabinet's session. */
export function nodeStub(opts = {}) {
  const s = { share: null, pinAuth: null, signedIn: !!opts.signedIn, linkOk: true, likeMatched: false, takedown: 204, calls: [], unexpected: [], feedDelay: opts.feedDelay ?? 0, venues: [], offers: [] };
  s.venues = [{ id: "v2", name: "Khinkali Bar", address: "5 Rustaveli Ave", verification_status: "verified", verified_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), envelope_expires_at: null, place: { lat: 41.7, lon: 44.79, area_radius: 1000 } }];
  s.offers = [{ id: "o1", venue_id: "v2", offer_text: "On the second dozen", discount_value: "20%", conditions: null, promo_code: null, external_url: null, status: "active", visits: 14, complaints: 0, created_at: new Date().toISOString(), expires_at: tonight() },
    { id: "o2", venue_id: "v2", offer_text: "Free tea with khachapuri", discount_value: "100%", conditions: null, promo_code: null, external_url: null, status: "expired", visits: 3, complaints: 1, created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), expires_at: new Date(Date.now() - 86_400_000).toISOString() }];
  const prepare = async (ctx) => {
    await ctx.addInitScript(() => {
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", want = "K7QM2XWDPE4R9FTE";
      const real = crypto.getRandomValues.bind(crypto); let used = false;
      crypto.getRandomValues = (a) => { if (!used && a instanceof Uint8Array && a.length === 16) { used = true; for (let i = 0; i < 16; i++) a[i] = alphabet.indexOf(want[i]); return a; } return real(a); };
      try { localStorage.setItem("place.v1", JSON.stringify({ lat: 41.69, lon: 44.8, name: "Sololaki" })); } catch {}
    });
    // R-TAB6-7: the talk's room (client.openRoomWith, ws /chat): the peer's lines, sealed, for the chat whose ticket was asked last
    await ctx.routeWebSocket(/\/chat(\?|$)/, async (ws) => {
      const chat = s.roomChat, row = inboxRows().find((r) => r.id === chat);
      for (let i = 0; i < 50 && !TALK_KEYS.has(chat); i++) await new Promise((r) => setTimeout(r, 100));   // the wrap is asked beside the ticket
      if (!row || !TALK_KEYS.has(chat)) return;
      let seq = 0;
      for (const [n, text] of TALK_LINES.entries()) {
        const id = `${chat}-l${n}`;
        ws.send(JSON.stringify({ type: "message", seq: ++seq, data: { id, ciphertext: await sealFrom(chat, row.peer.identity_id, row.me, text, id), created_at: Math.floor(Date.now() / 1000) - 600 + n * 60 } }));
      }
    });
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; s.calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => { try { return JSON.parse(req.postData() ?? "{}"); } catch { return {}; } };
      if (u.pathname.startsWith("/adv/")) {
        if (key === "GET /adv/me") return s.signedIn ? json(200, { email: "hello@puri.ge", email_confirmed: true, brand: "sosed" }) : json(401, { error: { code: "unauthenticated" } });
        if (key === "POST /adv/sign-in" || key === "POST /adv/signup") return route.fulfill({ status: 204 });
        if (key === "POST /adv/session") { if (s.linkOk) { s.signedIn = true; return route.fulfill({ status: 204 }); } return json(401, { error: { code: "link_spent" } }); }
        if (key === "GET /adv/venues") return s.signedIn ? json(200, { items: s.venues }) : json(401, {});
        if (key === "GET /adv/offers") return json(200, { items: s.offers });
        if (key === "GET /adv/complaints") return json(200, { items: [] });
        s.unexpected.push(key); return route.abort();
      }
      if (key === "GET /legal/manifest") return json(200, { documents: DOCS });
      if (key === "POST /legal/accept") return json(200, {});
      if (key === "POST /identities") { s.share = body().share; s.wrapPub = body().wrap_pub; s.pinAuth = null; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") { const auth = body().auth; if (s.pinAuth === null) { s.pinAuth = auth; return json(200, { share: s.share }); } return auth === s.pinAuth ? json(200, { share: s.share }) : json(409, { error: { code: "pin_mismatch", attempts_left: 9 } }); }
      if (key === "GET /feed") { if (s.feedDelay) await new Promise((r) => setTimeout(r, s.feedDelay)); return json(200, { items: CARDS, next: null }); }
      if (key === "POST /feed") return json(200, { state: "published", id: "w-new" });
      if (key === "GET /feed/density") return json(200, { step: "tens" });
      if (/^DELETE \/feed\/[^/]+$/.test(key)) return route.fulfill({ status: s.takedown });
      // both in: the like answers a match, whose row is in the inbox as «Nino» (inboxRows m1)
      if (/^POST \/feed\/[^/]+\/like$/.test(key)) return json(200, s.likeMatched ? { state: "matched", match_id: "m1" } : {});
      if (key === "POST /hidden") return json(200, { id: "h-1" });
      // w4_hidden, w4_blocked: what I hid and whom I blocked; a return or a lift answers 204 as the node does (SEC-14)
      if (key === "GET /hidden") return json(200, [{ id: "h-1", kind: "phrase", text: "Lost a grey cat near the bakery — Barsik" }, { id: "h-2", kind: "phrase", text: "Power out on Asatiani again?" }, { id: "h-3", kind: "phrase", text: "Who walks a dog at six?" }, { id: "h-4", kind: "phrase", text: "Free chairs by the entrance" }]);
      if (key === "GET /blocks") return json(200, [{ id: "b-1", since: Math.floor(Date.UTC(2026, 9, 9, 12) / 1000) }]);
      if (/^DELETE \/(hidden|blocks)\/[^/]+$/.test(key)) return route.fulfill({ status: 204 });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      // step away (client.stepAway): the node answers the moment it ends (R-TAB5-3, away at 1440)
      // R-TAB8-2: the move as the relay node keeps it (transfer.ts): invite -> waiting; a claim from the other device
      // (its own page on this stub) leaves its sealed envelope -> claimed; approve -> approved; reject -> rejected
      if (key === "POST /sessions/invite") { s.move = { id: body().lookup_id, state: "waiting", envelope: null }; return json(200, { expires_in: 120 }); }
      if (key === "POST /sessions/claim") { const b = body(); if (!s.move || s.move.id !== b.lookup_id) return json(404, { error: { code: "not_found" } }); s.move.state = "claimed"; s.move.envelope = b.envelope; return json(200, {}); }
      if (req.method() === "GET" && /^\/sessions\/[^/]+$/.test(u.pathname)) return s.move ? json(200, { state: s.move.state, ...(s.move.envelope ? { claim_envelope: s.move.envelope } : {}) }) : json(404, { error: { code: "not_found" } });
      if (/^\/sessions\/[^/]+\/approve$/.test(u.pathname)) { if (s.move) s.move.state = "approved"; return json(200, { state: "approved" }); }
      if (/^\/sessions\/[^/]+\/reject$/.test(u.pathname)) { if (s.move) s.move.state = "rejected"; return json(200, {}); }
      if (key === "DELETE /away") return route.fulfill({ status: 204 });
      if (key === "POST /away") return json(200, { until: Math.floor(Date.now() / 1000) + 3600 });
      if (key === "GET /identities/me") return json(200, { identity_id: "id-stub", name: "Alex", name_state: "accepted", age: 32, phrases: [], filter_age_min: 25, filter_age_max: 35 });
      if (key === "GET /statements") return json(200, { items: [{ id: "st1", restriction: "hidden", facts: "Your phrase was hidden because it names a person.", ground_kind: "contractual", ground_text: "Community guidelines, section 3", automated_used: false, created_at: Math.floor(Date.now() / 1000) - 3600 }] });
      if (key === "GET /inbox") return json(200, { items: inboxRows(), events: {} });
      if (key === "GET /likes") return json(200, { items: [{ id: "w-bg", text: "Backgammon in the yard tonight?", like_count: 12, state: "liked", liked_at: Math.floor(Date.now() / 1000) - 600 }, { id: "w-cat", text: "Lost a grey cat near the bakery — Barsik", like_count: 1, state: "matched", liked_at: Math.floor(Date.now() / 1000) - 7200 }], next: null });
      if (key === "GET /limits") return json(200, { phrase_length: 128, chat_ciphertext_chars: 8000 });
      // R-TAB6-6: a talk's keys open (the wrap is made under this session's wrap_pub, as the peer's device would); the rest of /chats stays down
      const ck = /^\/chats\/([^/]+)\/keys$/.exec(u.pathname);
      if (ck && req.method() === "GET" && ck[1] === "c2") return json(404, { error: { code: "no_wrap" } });   // Levan: this device holds no keys (chat-keys)
      if (ck && req.method() === "GET" && s.wrapPub) return json(200, { epoch: 1, current_epoch: 1, wrapped_key: await wrapFor(s.wrapPub, decodeURIComponent(ck[1]), 1) });
      if (ck && req.method() === "PUT") return json(200, {});
      const cx = /^\/chats\/([^/]+)\/(ticket|messages|received)$/.exec(u.pathname);
      if (cx && req.method() === "POST" && cx[2] === "ticket") { s.roomChat = decodeURIComponent(cx[1]); return json(200, { ticket: `t-${s.roomChat}` }); }
      if (cx && req.method() === "POST" && cx[2] === "messages") return json(202, { local_id: body().local_id ?? "l-1", accepted: true });   // the node takes a line with 202 (keys.ts flush)
      if (cx && req.method() === "POST" && cx[2] === "received") return route.fulfill({ status: 204 });
      // R-TAB6-8: a chat's game (depth/core/chat_games.ts). Mariam (c3) has a four-in-a-row board under way, my turn (the sheet's
      // w3_chat-game position); elsewhere none until proposed, then my proposal waits for the peer
      const gm = /^\/chats\/([^/]+)\/game(\/answer)?$/.exec(u.pathname);
      if (gm) {
        const chat = decodeURIComponent(gm[1]);
        s.games ??= { c3: { class: "grid", set: "four", your_seat: 2, pending: null, board: { seq: 9, turn: 2, score: {}, expires_at: null,
          state: { grid: { claim: null, rules: "four", cells: Object.fromEntries(Object.entries({ d4: 1, d3: 2, e3: 1, c2: 2, d2: 1, e2: 2, b1: 2, c1: 1, d1: 2, e1: 2 }).map(([id, seat]) => [id, { seat, piece: "O" }])) } } } },
          c1: { class: "grid", set: "chess", your_seat: 2, board: null, pending: { id: "p-c1", kind: "game", class: "grid", set: "chess", mine: false } } };   // Nino offers chess (chat-game-offer)
        if (gm[2]) { const b = body(); if (b.answer === "decline") delete s.games[chat]; return route.fulfill({ status: 204 }); }   // the peer's offer answered
        if (req.method() === "POST") { const b = body(); s.games[chat] = { class: b.class, set: b.set, your_seat: 1, board: null, pending: { id: `p-${chat}`, kind: "game", class: b.class, set: b.set, mine: true } }; return route.fulfill({ status: 204 }); }
        if (req.method() === "DELETE") { delete s.games[chat]; return route.fulfill({ status: 204 }); }
        return s.games[chat] ? json(200, s.games[chat]) : json(404, { error: { code: "no_game" } });
      }
      if (u.pathname.startsWith("/chats/")) return json(503, { error: "unavailable" });
      if (/^POST \/matches\/[^/]+\/consent$/.test(key)) return json(200, { state: "waiting" });
      if (key === "GET /tables") return json(200, { items: [1, 2, 3].map((n) => ({ id: `t${n}`, game: "grid", set: "four", playing: 2, free_seats: n === 3 ? 1 : 0, watching: n - 1, like_count: n, name: ["Evening at the yard", "Four in a row", "Late game"][n - 1] })), next: null, mine: [{ id: "t1", game: "grid", set: "four", playing: 2, free_seats: 0, watching: 0, like_count: 0, name: "Evening at the yard" }] });
      const t = /^\/tables\/(t\d+)(\/.*)?$/.exec(u.pathname);
      if (t && req.method() === "GET" && !t[2]) return json(200, tableView(t[1]));
      if (t && t[2] === "/ticket") return json(503, { error: { code: "unavailable" } });
      if (key === "GET /away") return json(200, {});
      s.unexpected.push(key); return route.abort();
    });
  };
  return { s, prepare };
}

export async function openPage(browser, width, { prepare, reducedMotion = "reduce", locale = "en-US" } = {}) {
  const h = width === 390 ? 844 : width === 834 ? 1194 : width === 1920 ? 1080 : 900;
  const ctx = await browser.newContext({ viewport: { width, height: h }, locale, isMobile: width < 768, hasTouch: width < 768, reducedMotion });
  await ctx.addInitScript(() => { try { localStorage.setItem("lang-asked", "1"); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  if (prepare) await prepare(ctx, page);
  return { ctx, page, errors };
}
export async function settle(page) {
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}
export async function register(page) {
  await page.goto(DEV + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="start"]'); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-screen="register-1"]');
  await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
  await page.click('[data-testid="next"]'); await page.waitForSelector('[data-screen="register-2"]');
  await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
  await page.click('[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
}
export async function confirmPaper(page) {
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FTE");
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector(feedSel, { timeout: 20000 });
}

// ── the measure, in the page ──
const IN_PAGE = `(tol) => {
  const IGNORE = ".layer-sheet, .layer-base, .dim";
  const vw = innerWidth, vh = innerHeight;
  const label = (e) => {
    const t = (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24);
    const cls = typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/)[0] : "";
    return e.tagName.toLowerCase() + (e.dataset && e.dataset.testid ? "[" + e.dataset.testid + "]" : cls) + (t ? '"' + t + '"' : "");
  };
  const clipOf = (e) => {   // the box left after the ancestors that clip (overflow not visible), and the viewport
    let r = { l: 0, t: 0, r: vw, b: vh };
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const b = p.getBoundingClientRect();
        if (cs.overflowX !== "visible") { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
        if (cs.overflowY !== "visible") { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
      }
    }
    return r;
  };
  const visible = (e) => {
    for (let p = e; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.01) return false;
      if (p.hasAttribute("hidden")) return false;
    }
    return true;
  };
  const isFixed = (e) => { for (let p = e; p; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
  const unit = new Set();   // leaf blocks: buttons / inputs / images are one block each; other elements with text of their own
  const walk = (root) => {
    for (const e of root.querySelectorAll("*")) {
      if (e.matches(IGNORE) || e.closest('.layer-base[data-under="true"], [inert]')) continue;   // the layers themselves are no blocks; the base under an open sheet is covered by it and the dim
      if (e.closest("button, a[role=button], select, textarea, [role=button]") && !e.matches("button, a[role=button], select, textarea, [role=button]")) continue;
      const tag = e.tagName.toLowerCase();
      if (["script", "style", "link", "meta", "head", "title", "path", "g", "defs", "use", "circle", "rect", "line", "polyline", "polygon", "ellipse", "tspan", "br", "option"].includes(tag)) continue;
      if (["button", "input", "textarea", "select", "img", "canvas", "video", "svg"].includes(tag) || e.matches("[role=button]")) {
        if (tag === "svg" && e.closest("button, [role=button]")) continue;
        if (tag === "input" && ["hidden"].includes(e.type)) continue;
        unit.add(e); continue;
      }
      for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { unit.add(e); break; }
    }
  };
  walk(document.body);
  const blocks = [];
  for (const e of unit) {
    if (!visible(e)) continue;
    let r;
    if (["button", "input", "textarea", "select", "img", "canvas", "video", "svg"].includes(e.tagName.toLowerCase()) || e.matches("[role=button]")) { const b = e.getBoundingClientRect(); r = { l: b.left, t: b.top, r: b.right, b: b.bottom }; }
    else {   // the ink of the element's own text nodes
      let l = 1e9, t = 1e9, rr = -1e9, bb = -1e9;
      for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const g = document.createRange(); g.selectNodeContents(n); for (const q of g.getClientRects()) { if (!q.width || !q.height) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); rr = Math.max(rr, q.right); bb = Math.max(bb, q.bottom); } }
      if (l > rr) continue; r = { l, t, r: rr, b: bb };
    }
    const c = clipOf(e);
    r = { l: Math.max(r.l, c.l), t: Math.max(r.t, c.t), r: Math.min(r.r, c.r), b: Math.min(r.b, c.b) };
    if (r.r - r.l <= 0 || r.b - r.t <= 0) continue;
    blocks.push({ e, r, name: label(e), fixed: isFixed(e) });
  }
  const out = [];
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l), h = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
    if (w > tol && h > tol) out.push({ A: a.name + (a.fixed ? "[fixed]" : ""), B: b.name + (b.fixed ? "[fixed]" : ""), w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
  }
  return { count: blocks.length, pairs: out };
}`;
export const measureOverlap = (page) => page.evaluate(`(${IN_PAGE})(${TOL})`);

// ── clipped sideways, scroll-x, nav: the same rules as snap-svg.mjs (data-clipped L/R, data-scroll-x, data-nav); snap-svg.mjs runs on import, so its page code is mirrored here ──
const IN_PAGE_EDGES = `() => {
  const sel = (e) => { const cls = typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/)[0] : ""; return e.tagName.toLowerCase() + (e.dataset && e.dataset.testid ? "[" + e.dataset.testid + "]" : "") + cls; };
  const vis = (e) => { for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.01 || p.hasAttribute("hidden")) return false; } return true; };
  // a static box still holds absolute descendants (is their containing block) when one of these is set (CSS Transforms, Filter Effects, Containment)
  const holdsAbs = (cs) => cs.transform !== "none" || cs.translate !== "none" || cs.rotate !== "none" || cs.scale !== "none" || cs.perspective !== "none"
    || cs.filter !== "none" || (cs.backdropFilter ?? "none") !== "none" || /paint|layout|strict|content/.test(cs.contain) || /transform|filter|perspective|translate|rotate|scale/.test(cs.willChange)
    || (cs.containerType ?? "normal") !== "normal";
  const clipAncestors = (e) => {
    const out = [];
    let abs = false;   // the box below is absolute: a static ancestor is not its containing block and does not clip it (CSS 2.1 §11.1.1)
    for (let p = e; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const skip = p !== e && abs && cs.position === "static" && !holdsAbs(cs);
      if (p !== e && !skip && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) out.push({ p, sx: false, scy: cs.overflowY === "auto" || cs.overflowY === "scroll" });
      if (!skip) abs = cs.position === "absolute";
      if (cs.position === "fixed") break;
    }
    return out;
  };
  const sides = (e, box) => {
    let f = "", doneX = false;
    for (const { p } of clipAncestors(e)) {
      const b = p.getBoundingClientRect();
      if (!doneX) { if (box.l < b.left - 1) f += "L"; if (box.r > b.right + 1) f += "R"; }
    }
    return f;
  };
  const hits = [], scrollAt = [];
  const SKIP = ["script", "style", "link", "meta", "head", "title", "br", "option", "path", "g", "defs", "use", "circle", "rect", "line", "polyline", "polygon", "ellipse", "tspan", "clippath", "mask", "lineargradient", "radialgradient", "stop", "text"];
  const paints = (cs) => { const c = (v) => { const m = v.match(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/); return !!m && !(m[4] !== undefined && Number(m[4]) === 0); }; return c(cs.backgroundColor); };
  for (const e of [document.documentElement, ...document.body.querySelectorAll("*")]) {
    const tag = e.tagName.toLowerCase();
    if (SKIP.includes(tag)) continue;
    if (e.closest("svg") && tag !== "svg") continue;
    if (e !== document.documentElement && !vis(e)) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && (e === document.documentElement || cs.overflowX === "auto" || cs.overflowX === "scroll")) scrollAt.push(sel(e) + " " + e.scrollWidth + ">" + e.clientWidth);
    if (e === document.documentElement) continue;
    const b = e.getBoundingClientRect();
    if (b.width >= 0.5 && b.height >= 0.5) {
      const bw = parseFloat(cs.borderTopWidth) || 0, bc = bw > 0 && cs.borderTopStyle !== "none";
      const control = ["button", "input", "textarea", "select", "img", "canvas", "video"].includes(tag);
      const clipper = cs.overflowX !== "visible" || cs.overflowY !== "visible";
      if (tag === "svg" || paints(cs) || bc || control || clipper || cs.backgroundImage !== "none") {
        const f = sides(e, { l: b.left, r: b.right });
        if (f) hits.push(sel(e) + " " + f);
      }
    }
    if (tag === "svg") continue;
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const lines = [];
      for (const w of n.textContent.matchAll(/\\S+/g)) {
        const g = document.createRange(); g.setStart(n, w.index); g.setEnd(n, w.index + w[0].length);
        const q = [...g.getClientRects()].filter((x) => x.width && x.height)[0]; if (!q) continue;
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.t - q.top) < q.height / 2) { last.s += " " + w[0]; last.r = Math.max(last.r, q.right); }
        else lines.push({ s: w[0], l: q.left, t: q.top, r: q.right });
      }
      for (const L of lines) { const f = sides(e, { l: L.l, r: L.r }); if (f) hits.push(sel(e) + ' "' + L.s.slice(0, 20) + '" ' + f); }
    }
  }
  const navs = [...document.querySelectorAll("nav")].filter((n) => vis(n) && n.getBoundingClientRect().width > 0 && [...n.querySelectorAll('button[data-testid^="tab-"]')].filter(vis).length >= 4);
  return { clipped: [...new Set(hits)], scrollAt, nav: navs.length > 0 };
}`;
export const measureEdges = (page) => page.evaluate(`(${IN_PAGE_EDGES})()`);

// ── the walk ──
const lines = [], unreachable = [], summary = [], edgeHits = [];
let navScope = false;   // true once the app shell with its tabs is reached (after the paper code is confirmed); the splash and the register steps have no nav by design
const log = (s) => { lines.push(s); console.log(s); };
async function measure(page, screen, width) {
  await settle(page);
  const r = await measureOverlap(page);
  summary.push({ screen, width, blocks: r.count, pairs: r.pairs.length, pairList: r.pairs });
  log(`SCREEN ${screen} @${width}: ${r.count} blocks, ${r.pairs.length} overlaps`);
  for (const p of r.pairs) log(`OVERLAP ${screen} @${width}  A=${p.A}  B=${p.B}  ${p.w}x${p.h}px`);
  const ed = await measureEdges(page);
  const hit = (kind, what) => { edgeHits.push({ kind, screen, width, what }); log(`${kind} ${screen} @${width}  ${what}`); };
  for (const c of ed.clipped.slice(0, 12)) hit("CLIPPED", c);
  if (ed.clipped.length > 12) hit("CLIPPED", `... and ${ed.clipped.length - 12} more`);
  if (ed.scrollAt.length) hit("SCROLL-X", ed.scrollAt.slice(0, 3).join("; "));
  if (navScope && width >= 1024 && !ed.nav) hit("NAV-MISSING", "no visible nav with 4 tab buttons");
}
// one step of the walk: a failure is an unreachable screen at this width, listed, the run goes on
async function at(page, screen, width, fn) {
  try { await fn(); await measure(page, screen, width); return true; }
  catch (e) { const m = String(e.message ?? e), why = (m.split("\n")[0] + " " + (m.match(/(\S+ intercepts pointer events|element is not visible|element is not stable|waiting for [^\n]*)/)?.[0] ?? "")).slice(0, 200); unreachable.push(`${screen} @${width}: ${why}`); log(`UNREACHABLE ${screen} @${width}: ${why}`); return false; }
}
const T = { timeout: 8000 };
// a covered control (another block takes the pointer) is clicked by script and said: that is itself a finding
const click = async (page, sel) => {
  try { await page.click(sel, { timeout: 2500 }); }
  catch (e) {
    const m = String(e.message), by = m.match(/<([^>]*)>[^\n]*?from <([^>]*)>[^\n]*intercepts/) ?? m.match(/<([^>]{0,80})[^\n]*intercepts pointer events/);
    if (!(await page.locator(sel).first().count())) throw e;
    await page.locator(sel).first().evaluate((el) => el.click());
    log(`COVERED ${sel} is under another block (pointer goes to ${by ? by[0].slice(0, 110) : "?"}); clicked by script`);
  }
};
const wait = (page, sel) => page.waitForSelector(sel, T);
// back to a tab's home: the row/marker `ready` is on the page; else a back button, else the tab, up to 5 tries
const HUB = { theme: "profile", lang: "profile", filter: "visibility", hidden: "visibility", blocked: "visibility", pin: "security", reissue: "security", reset: "security" };   // the Me row inside the hub that holds it (Hubs.tsx); the rest sit on Me itself
const home = async (page, t, ready) => {
  for (let k = 0; k < 5; k++) {
    if (await page.locator(ready).first().isVisible().catch(() => false)) return;
    const back = page.locator('.me-back:visible, [data-testid$="-back"]:visible, [data-testid="back"]:visible').first();
    if (await back.isVisible().catch(() => false)) await back.click({ timeout: 2000 }).catch(() => {});
    else await page.click(`[data-testid="tab-${t}"]`, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(350);
  }
};
const tab = async (page, t) => { await click(page, `[data-testid="tab-${t}"]`); };

async function walkWidth(browser, w) {
  const stub = nodeStub();
  const o = await openPage(browser, w, { prepare: stub.prepare, reducedMotion: "reduce" });
  const { page } = o;
  await page.goto(DEV + "/", { waitUntil: "load" });
  await at(page, "splash", w, () => wait(page, '[data-testid="start"]'));
  // the paper-code gate (w4_restore): from the splash, a code and a PIN half typed, as the sheet draws it; back to the splash
  if (await at(page, "restore", w, async () => {
    await click(page, '[data-testid="restore"]'); await wait(page, '[data-screen="restore"]');
    await page.fill('[data-testid="restore-code"]', "K7QM2XWDPL4R"); await page.fill('[data-testid="restore-pin"]', "1234");
  })) { await page.click('[data-testid="restore-back"]', T).catch(() => page.goBack()); await wait(page, '[data-testid="start"]').catch(() => {}); }
  const regOk = await (async () => {
    try {
      await click(page, '[data-testid="start"]'); await wait(page, '[data-screen="register-1"]');
      await at(page, "register-1", w, async () => {});
      await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
      await click(page, '[data-testid="next"]'); await wait(page, '[data-screen="register-2"]');
      await at(page, "register-2", w, async () => {});
      await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
      await click(page, '[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
      await at(page, "register-3", w, async () => {});
      await confirmPaper(page); navScope = true; return true;
    } catch (e) { unreachable.push(`register flow @${w}: ${String(e.message).split("\n")[0].slice(0, 140)}`); log(`UNREACHABLE register flow @${w}: ${String(e.message).split("\n")[0]}`); return false; }
  })();
  if (regOk) {
    await at(page, "feed", w, () => wait(page, '[data-testid="cards"] [data-testid="card"]'));
    // the card
    if (await at(page, "card", w, async () => { await click(page, '[data-testid="cards"] [data-testid="card"] .fd-open'); await wait(page, '[data-screen="card"]'); })) { await page.click('[data-testid="back"]', T).catch(() => page.goBack()); await wait(page, feedSel).catch(() => {}); }
    // the header's search (a filter over the loaded phrases), its empty answer, the menu (a sheet: reachable only), a table between the phrases
    await at(page, "feed (table between phrases)", w, async () => { await wait(page, '[data-testid="cards"] [data-testid="table-card"]'); await wait(page, '[data-testid="nearby"]'); });
    if (await at(page, "feed (search typed)", w, async () => { await click(page, '[data-testid="feed-search-open"]'); await page.fill('[data-testid="feed-search"]', "cat"); await page.waitForTimeout(150); })) {
      await at(page, "feed (search: none)", w, async () => { await page.fill('[data-testid="feed-search"]', "zzz"); await wait(page, '[data-testid="search-none"]'); });
      await click(page, '[data-testid="feed-search-open"]');   // closes the search, the query goes
    }
    if (w < 834) {
      if (await at(page, "feed (menu)", w, async () => { await click(page, '[data-testid="feed-menu"]'); await wait(page, '[data-testid="feed-menu-sheet"]'); })) { await click(page, '[data-testid="menu-likes"]').catch(() => {}); await page.waitForTimeout(500); await page.goBack().catch(() => {}); await wait(page, feedSel).catch(() => {}); }
    }
    // the card, both in (w1_card-matched): the like answers a match, the offer's note names Nino, «Talk» takes to the talks
    stub.s.likeMatched = true;
    if (await at(page, "card-matched", w, async () => {
      await click(page, '[data-testid="cards"] [data-testid="card"]:not(:has([data-lit])) .fd-open'); await wait(page, '[data-screen="card"]');
      await click(page, '[data-testid="like"]'); await wait(page, '[data-testid="matched"]'); await page.waitForFunction(() => /Nino/.test(document.querySelector('[data-testid="matched"]')?.textContent ?? ""), null, T); await wait(page, '[data-testid="talk"]');
    })) { await page.click('[data-testid="back"]', T).catch(() => page.goBack()); await wait(page, feedSel).catch(() => {}); }
    stub.s.likeMatched = false;
    // the composer
    const comp = await at(page, "composer", w, async () => {
      const rail = page.locator('[data-testid="rail-say"]'), fab = page.locator('[data-testid="write"]');
      if (await rail.isVisible().catch(() => false)) await rail.click(T); else await fab.click(T);
      await wait(page, '[data-screen="composer"]');
      await page.fill('[data-testid="text"]', "Backgammon in the yard tonight?");
    });
    if (comp) {
      // sent: the feed again with the phrase over the list and its «take down»; taken down, the line goes
      if (await at(page, "feed (my phrase sent)", w, async () => { await click(page, '[data-testid="send"]'); await wait(page, '[data-testid="sent"]'); await wait(page, '[data-testid="takedown"]'); })) {
        await click(page, '[data-testid="takedown"]'); await page.waitForSelector('[data-testid="sent"]', { state: "detached", timeout: 8000 }).catch(() => { unreachable.push(`takedown @${w}: the sent line stayed`); log(`UNREACHABLE takedown @${w}: the sent line stayed`); });
      } else { await page.click('[data-testid="composer-back"]', T).catch(() => page.goBack()); await wait(page, feedSel).catch(() => {}); }
    }
    // talks: the inbox (at 1440 and up with the pane beside it), a chat, a match, likes
    await at(page, "talks", w, async () => { await tab(page, "chats"); await wait(page, '[data-testid="open-chat"]'); });
    if (await at(page, "chat", w, async () => { await page.locator('[data-testid="open-chat"]').first().click(T); await wait(page, '[data-screen="chat"], [data-testid="chat-pane"]'); })) { await page.goBack().catch(() => {}); await page.waitForTimeout(400); }
    await tab(page, "chats").catch(() => {});
    if (await at(page, "match", w, async () => { await page.locator('[data-testid="open-match"]').first().click(T); await wait(page, '[data-screen="match"]'); })) { await page.goBack().catch(() => {}); await page.waitForTimeout(400); }
    if (await at(page, "likes", w, async () => { await tab(page, "chats").catch(() => {}); await click(page, '[data-testid="open-likes"]'); await wait(page, '[data-screen="likes"]'); })) { await page.goBack().catch(() => {}); await page.waitForTimeout(400); }
    // tables
    await at(page, "tables", w, async () => { await tab(page, "tables"); await wait(page, '[data-screen="tables"]'); await wait(page, '[data-testid="tables"]'); });
    if (await at(page, "table", w, async () => { await page.locator('[data-testid="table-open"]').first().click(T); await wait(page, '[data-screen="table"]'); })) { await page.click('[data-testid="table-back"]', T).catch(() => page.goBack()); await wait(page, '[data-screen="tables"]').catch(() => {}); }
    if (await at(page, "new-table", w, async () => { await click(page, '[data-testid="new-table"]'); await wait(page, '[data-screen="new-table"]'); })) { await page.click('[data-testid="new-table-back"]', T).catch(() => page.goBack()); await page.waitForTimeout(400); }
    // me and its subpages
    await home(page, "me", '[data-testid="tab-me"]');
    await at(page, "me", w, async () => { await tab(page, "me"); await wait(page, '[data-screen="me"] .k-me-head'); });
    for (const sub of ["name", "theme", "lang", "filter", "pin", "reissue", "away", "place", "legal", "statements", "hidden", "blocked", "reset"]) {
      const name = sub === "name" ? "me-name" : `me-${sub}`;
      const hub = HUB[sub] ? `me-hub-${HUB[sub]}` : null;
      await home(page, "me", `[data-screen="me"] [data-testid="${hub ?? name}"]`);
      const ok = await at(page, `me/${sub}`, w, async () => { if (hub) { await click(page, `[data-testid="${hub}"]`); await page.waitForTimeout(350); } await click(page, `[data-testid="${name}"]`); await page.waitForTimeout(350); if (await page.locator('[data-screen="me"] [data-testid="' + name + '"]').count() && sub !== "name") throw new Error("the row still shows: no subpage opened"); });
      if (ok && sub === "reissue") {
        // w4_reissue-1 and -2: the current code typed (the stub's fixed code, checked on the device), then the new code's plate and its two groups typed back
        await at(page, "me/reissue-1 (code typed)", w, async () => { await page.fill('[data-testid="reissue-current"]', "K7QM2XWDPE4R9FTE"); await page.waitForTimeout(150); });
        await at(page, "me/reissue-2", w, async () => { await click(page, '[data-testid="reissue-next"]'); await wait(page, '[data-screen="reissue-2"]'); await page.waitForTimeout(350); });
        await at(page, "me/reissue-2 (groups typed)", w, async () => { const gi = page.locator('[data-testid="reissue-groups"] input'); await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FTE"); await page.waitForTimeout(150); });
      }
      if (ok && sub === "place") {
        await at(page, "place (qr)", w, async () => { await page.getByTestId("place-qr-open").click(T).catch(async () => { await page.getByRole("button", { name: /QR/i }).first().click(T); }); await page.waitForTimeout(400); });
      }
    }
    await home(page, "me", '[data-screen="me"] [data-testid="me-hub-security"]');
    await at(page, "departure (move)", w, async () => { await click(page, '[data-testid="me-hub-security"]'); await page.waitForTimeout(350); await click(page, '[data-testid="me-move"]'); await wait(page, '[data-screen="departure"]'); });
  }
  navScope = false;
  if (o.errors.length) log(`NOTE @${w}: page errors: ${o.errors.slice(0, 3).join(" | ")}`);
  if (stub.s.unexpected.length) log(`NOTE @${w}: unexpected node calls aborted: ${[...new Set(stub.s.unexpected)].join(", ")}`);
  await o.ctx.close();
  // the place chooser, the away screen and the advertiser's cabinet are their own pages
  const cs = nodeStub({ signedIn: false });
  const c = await openPage(browser, w, { prepare: cs.prepare });
  await at(c.page, "cabinet sign-in", w, async () => { await c.page.goto(DEV + "/adv", { waitUntil: "load" }); await wait(c.page, '[data-testid="adv-email"]'); });
  await at(c.page, "cabinet sent", w, async () => { await c.page.fill('[data-testid="adv-email"]', "hello@puri.ge"); await click(c.page, '[data-testid="adv-send"]'); await wait(c.page, '[data-testid="adv-sent"]'); });
  await at(c.page, "cabinet expired", w, async () => { cs.s.linkOk = false; await c.page.goto(DEV + `/adv/enter#${"0".repeat(64)}`, { waitUntil: "load" }); await wait(c.page, '[data-testid="adv-expired"]'); cs.s.linkOk = true; });
  await at(c.page, "cabinet venues", w, async () => { cs.s.signedIn = true; await c.page.goto(DEV + "/adv", { waitUntil: "load" }); await wait(c.page, '[data-testid="venue"]'); });
  await at(c.page, "cabinet add venue", w, async () => { await click(c.page, '[data-testid="venue-add-open"]'); await wait(c.page, '[data-testid="venue-add"]'); });
  await at(c.page, "cabinet offers", w, async () => { await c.page.goto(DEV + "/adv", { waitUntil: "load" }); await wait(c.page, '[data-testid="venue"]'); await click(c.page, '[data-testid="offers-open"]'); await wait(c.page, '[data-testid="adv-offer"]'); });
  await at(c.page, "cabinet new offer", w, async () => { await click(c.page, '[data-testid="offer-new"]'); await wait(c.page, '[data-testid="offer-text"]'); });
  await c.ctx.close();
}

// ── the break test: two real blocks of the splash forced onto one spot, then released ──
async function breakTest(browser) {
  const o = await openPage(browser, 390, { prepare: nodeStub().prepare });
  const { page } = o;
  await page.goto(DEV + "/", { waitUntil: "load" }); await wait(page, '[data-testid="start"]'); await settle(page);
  const base = (await measureOverlap(page)).pairs.length;
  // the injected style pins the first two leaf blocks of the screen (the hero's first text and the start button) to one place
  await page.evaluate(() => {
    const a = document.querySelector('[data-screen] h1, [data-screen] p'), b = document.querySelector('[data-testid="start"]');
    for (const [el, id] of [[a, "bt-a"], [b, "bt-b"]]) el.setAttribute("data-bt", id);
    const st = document.createElement("style"); st.id = "bt-style";
    st.textContent = '[data-bt]{position:fixed !important;left:20px !important;top:300px !important;margin:0 !important;transform:none !important;animation:none !important}';
    document.head.appendChild(st);
  });
  await page.waitForTimeout(150);
  const red = await measureOverlap(page);
  const seen = red.pairs.filter((p) => p.w > 2 && p.h > 2 && red.pairs.length > base);
  await page.evaluate(() => { document.getElementById("bt-style")?.remove(); document.querySelectorAll("[data-bt]").forEach((e) => e.removeAttribute("data-bt")); });
  await page.waitForTimeout(150);
  const green = (await measureOverlap(page)).pairs.length;
  await o.ctx.close();
  const ok = red.pairs.length > base && green === base;
  log(`BREAK TEST splash@390: clean=${base} overlaps; injected style (two blocks pinned to one spot) -> ${red.pairs.length} (${red.pairs.length > base ? "RED, seen" : "NOT SEEN"}): ${red.pairs.slice(0, 2).map((p) => `${p.A} x ${p.B} ${p.w}x${p.h}px`).join("; ")}; style removed -> ${green} (${green === base ? "GREEN" : "STILL RED"})`);
  return ok;
}

async function main() {
  const browser = await chromium.launch();
  const bt = await breakTest(browser);
  for (const w of WIDTHS) { log(`== width ${w}`); await walkWidth(browser, w); }
  await browser.close();
  const all = summary.flatMap((s) => s.pairList.map((p) => ({ ...p, screen: s.screen, width: s.width, area: p.w * p.h })));
  log("== SUMMARY");
  log(`screens x widths measured: ${summary.length} (${[...new Set(summary.map((s) => s.screen))].length} screens x ${WIDTHS.join("/")})`);
  log(`overlaps total: ${all.length}  (of them touching a fixed/sticky block: ${all.filter((p) => /\[fixed\]/.test(p.A + p.B)).length})`);
  log("top 10 by area:");
  all.sort((a, b) => b.area - a.area).slice(0, 10).forEach((p, i) => log(`  ${i + 1}. ${p.screen} @${p.width}  A=${p.A}  B=${p.B}  ${p.w}x${p.h}px`));
  log(`unreachable (${unreachable.length}):`); unreachable.forEach((u) => log("  " + u));
  log(`break test: ${bt ? "red then green: OK" : "FAILED"}`);
  for (const k of ["CLIPPED", "SCROLL-X", "NAV-MISSING"]) log(`${k} total: ${edgeHits.filter((h) => h.kind === k).length}`);
  log(`edge hits total: ${edgeHits.length}`);
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(bt && edgeHits.length === 0 ? 0 : 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
