// Live check of «back» in app/: the feed card (Feed.tsx openCard/closeCard/onPop, App.tsx popstate guard), Me → Move,
// and the away screen (router.ts seatScreen: /me, /away with its until).
// Run by scripts/back-walk.sh (build + preview :4174 + stand dev :5174 in containers, no network out).
// The node is a stub (same routes as scripts/design/measure-app.mjs nodeStub, trimmed to registration + feed).
import { chromium } from "@playwright/test";

const PREVIEW = process.env.PREVIEW_URL ?? "http://localhost:4174";
// The dev server is the stand build (VITE_STAND=1): it reads the grace from sessionStorage "xor-grace-ms" (app/src/vault.ts).
const DEV = process.env.DEV_URL ?? "http://localhost:5174";
const PIN = "483915";
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|sessions|away|statements|inbox|likes|matches)(\/|$)/;
const DOCS = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
const phrase = (n) => ({ id: `ph-${n}`, text: `Walk phrase number ${n}`, mode: "walk", lang: "en", like_count: n });
const ITEMS = [phrase(1), phrase(2), phrase(3)];

const results = [];
const check = (ok, text) => { results.push({ ok, text }); console.log(`${ok ? "PASS" : "FAIL"} ${text}`); };

// awayIn: seconds from the first profile read to the step away's end (null: no step away).
async function open(browser, { base = PREVIEW, graceMs, awayIn = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US" });
  if (graceMs !== undefined) await ctx.addInitScript((g) => { sessionStorage.setItem("xor-grace-ms", String(g)); }, graceMs);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    // registerFull types groups 2 and 4 of this paper code (measure-app.mjs does the same)
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", want = "K7QM2XWDPE4R9FTE";
    const real = crypto.getRandomValues.bind(crypto); let used = false;
    crypto.getRandomValues = (a) => {
      if (!used && a instanceof Uint8Array && a.length === 16) { used = true; for (let i = 0; i < 16; i++) a[i] = alphabet.indexOf(want[i]); return a; }
      return real(a);
    };
  });
  let share = null, until = null;
  await ctx.route("**/*", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
    const key = `${req.method()} ${u.pathname}`;
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (key === "GET /legal/manifest") return json(200, { documents: DOCS });
    if (key === "POST /identities") { share = JSON.parse(req.postData()).share; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
    if (key === "POST /vault/share") return json(200, { share });
    if (key === "GET /feed") return json(200, { items: ITEMS, next: null });
    if (key === "GET /identities/me") {
      if (awayIn !== null && until === null) until = Math.floor(Date.now() / 1000) + awayIn;
      return json(200, { identity_id: "id-stub", name: "Alex", ...(until ? { stepped_away_until: until } : {}) });
    }
    if (key === "GET /statements") return json(200, []);
    if (key === "POST /matches/m1/consent") return json(200, { state: "waiting" });
    if (key === "GET /likes") return json(200, { items: [{ kind: "phrase", id: "p1", text: "Who has a ladder?", mode: "alone", like_count: 4, state: "liked", liked_at: 0 }], next: null });
    if (key === "GET /inbox") return json(200, { items: [{ kind: "match", id: "m1", name: "Nino", age: 27, waiting_for_you: false, state: "proposed", phrase: { text: "Backgammon tonight?", mode: "alone" } }, { kind: "chat", id: "c1", name: "Nino", age: 27, state: "open", chat_expires_at: Math.floor(Date.now() / 1000) + 1800 }], events: {} });
    if (key === "DELETE /away") { until = null; return route.fulfill({ status: 204 }); }
    if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
    if (key === "POST /legal/accept") return json(200, {});
    console.log(`UNEXPECTED ${key}`); return route.abort();
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`pageerror: ${e}`));
  await page.goto(base + "/", { waitUntil: "load" });
  return { ctx, page };
}

async function registerFull(page, { land = "feed" } = {}) {
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-screen="register-1"]');
  await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
  await page.click('[data-testid="next"]'); await page.waitForSelector('[data-screen="register-2"]');
  await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
  await page.click('[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FTE");
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector(`[data-screen="${land}"]`, { timeout: 20000 });
  if (land === "feed") await page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
}

const tile = (page, n) => page.locator(`[data-testid="card"][data-id="ph-${n}"] .fd-open`);
const cardOpen = (page) => page.locator('[data-screen="card"]').count();
const onFeed = async (page) => (await page.locator('[data-screen="feed"]').count()) === 1 && new URL(page.url()).pathname === "/feed";
const depth = (page) => page.evaluate(() => history.length);
const state = (page) => page.evaluate(() => JSON.stringify(history.state));
const settle = (page) => page.waitForTimeout(300);   // popstate is async after history.back()

const browser = await chromium.launch();
try {
  // 1. open a card → system Back → the feed, card closed, still /feed
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    const before = await depth(page);
    await tile(page, 1).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-1"]');
    const pushed = await depth(page);
    await page.goBack(); await settle(page);
    check(pushed === before + 1 && (await cardOpen(page)) === 0 && (await onFeed(page)), `1 open → Back → feed (history ${before}→${pushed}, card ${await cardOpen(page)}, state ${await state(page)})`);
    // 1b. the card's own «back» button does the same and leaves no entry with a card
    await tile(page, 2).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-2"]');
    await page.click('[data-screen="card"] [data-testid="back"]'); await settle(page);
    check((await cardOpen(page)) === 0 && (await onFeed(page)) && !(await state(page)).includes('"card"'), `1b card's back button → feed, state ${await state(page)}`);
    // 1c. two cards in a row (regression of the mount cleanup): A → Back → B → Back → feed
    await tile(page, 1).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-1"]');
    await page.goBack(); await settle(page);
    await tile(page, 3).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-3"]');
    await page.goBack(); await settle(page);
    check((await cardOpen(page)) === 0 && (await onFeed(page)), `1c two cards in a row, each closed by Back → feed (card ${await cardOpen(page)})`);
    await ctx.close();
  }
  // 2. double tap on a tile → one entry; a single Back closes the card
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    const before = await depth(page);
    // dispatch both clicks in one task: the second lands before React redraws (the race openCard guards)
    await tile(page, 1).evaluate((b) => { b.click(); b.click(); });
    await page.waitForSelector('[data-screen="card"][data-id="ph-1"]');
    const after = await depth(page);
    await page.goBack(); await settle(page);
    check(after === before + 1 && (await cardOpen(page)) === 0 && (await onFeed(page)), `2 double tap → +1 entry (${before}→${after}), one Back closes (card ${await cardOpen(page)})`);
    await ctx.close();
  }
  // 3. reload on an open card → feed without a card; Back opens nothing
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await tile(page, 2).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-2"]');
    await page.reload(); await page.waitForSelector('[data-screen="feed"], [data-screen="unlock"]', { timeout: 20000 });
    // inside the 30 s grace the reload lands on the feed; outside it the PIN is asked
    if (await page.locator('[data-screen="unlock"]').count()) {
      check(false, "3 reload asked the PIN (grace missed) — rerun faster or type the PIN here");
    } else {
      await page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
      const afterReload = await state(page);
      check((await cardOpen(page)) === 0 && !afterReload.includes('"card"'), `3a reload on a card → feed, no card, state ${afterReload}`);
      await page.goBack(); await settle(page);
      check((await cardOpen(page)) === 0, `3b Back after the reload opens no card (url ${new URL(page.url()).pathname}, state ${await state(page)})`);
    }
    await ctx.close();
  }
  // 3c. reload on an open card OUTSIDE the grace (stand: 1.5 s) → the PIN → the feed; Back opens no old card
  {
    const { ctx, page } = await open(browser, { base: DEV, graceMs: 1500 }); await registerFull(page);
    await tile(page, 2).click(); await page.waitForSelector('[data-screen="card"][data-id="ph-2"]');
    const onCard = await state(page);
    await page.waitForTimeout(2500);   // past the stand's 1.5 s grace
    await page.reload(); await page.waitForSelector('[data-screen="feed"], [data-screen="unlock"]', { timeout: 20000 });
    const asked = (await page.locator('[data-screen="unlock"]').count()) === 1;
    const atUnlock = await state(page);
    check(asked, `3c-1 reload past the grace asks the PIN (state on the card ${onCard}, at unlock ${atUnlock})`);
    if (asked) {
      await page.fill('[data-testid="unlock-pin"]', PIN); await page.click('[data-testid="unlock"]');
      await page.waitForSelector('[data-screen="feed"]', { timeout: 20000 });
      await page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
      const afterPin = await state(page);
      check((await cardOpen(page)) === 0 && !afterPin.includes('"card"'), `3c-2 after the PIN: feed, no card, state ${afterPin}`);
      await page.goBack(); await settle(page);
      check((await cardOpen(page)) === 0, `3c-3 Back after the PIN opens no old card (url ${new URL(page.url()).pathname}, state ${await state(page)}, card ${await cardOpen(page)})`);
    }
    await ctx.close();
  }
  // 7. right after the registration, Back from the feed: the gates behind (/ , /register) must not draw the splash over a seated identity
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen").catch(() => "(none)");
    check(at !== "splash" && at !== "register", `7 Back from the feed after the registration draws no gate (screen ${at}, url ${new URL(page.url()).pathname}, state ${await state(page)})`);
    await ctx.close();
  }
  // 7b. Back pressed again and again after the registration: never a gate drawn while the page is still the app's
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    const seen = [];
    for (let n = 1; n <= 4; n++) {
      const r = await page.goBack({ timeout: 3000 }).catch(() => "none");
      await settle(page);
      const url = page.url();
      const at = url.startsWith("http://localhost") ? await page.locator("main[data-screen]").first().getAttribute("data-screen").catch(() => "(none)") : "(left the app)";
      seen.push(`${n}:${at}@${url.startsWith("http://localhost") ? new URL(url).pathname : url}${r === null ? " (no entry)" : ""}`);
    }
    check(!seen.some((x) => /:(splash|register)@/.test(x)), `7b four Backs after the registration draw no gate (${seen.join(", ")})`);
    await ctx.close();
  }
  // 4. Me → Move → Back: Me again, not the feed (App.tsx toMove pushes i: 1; popstate → seatScreen("/me"))
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.click('[data-testid="tab-me"]'); await page.waitForSelector('[data-screen="me"]');
    await page.click('[data-testid="me-move"]'); await page.waitForSelector('[data-screen="departure"]');
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(at === "me" && new URL(page.url()).pathname === "/me", `4 Me → Move → Back lands on Me (screen ${at}, url ${new URL(page.url()).pathname}, state ${await state(page)})`);
    await ctx.close();
  }
  // 8. the talks tab (App.tsx tab: replaces the entry, as Me): /inbox, and Back from it draws no gate over the seat
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-screen="inbox"]');
    await page.locator('[data-testid="chat"]').first().waitFor({ timeout: 10000 });
    check(new URL(page.url()).pathname === "/inbox", `8a the talks tab opens the inbox at ${new URL(page.url()).pathname}, state ${await state(page)}`);
    await page.goBack({ timeout: 3000 }).catch(() => null); await settle(page);
    const url = page.url();
    const at = url.startsWith("http://localhost") ? await page.locator("main[data-screen]").first().getAttribute("data-screen").catch(() => "(none)") : "(left the app)";
    check(at !== "splash" && at !== "register", `8b Back from the inbox draws no gate (screen ${at}, url ${url.startsWith("http://localhost") ? new URL(url).pathname : url})`);
    await ctx.close();
  }
  // 9. inbox → «Offers» → what I am in on → Back: the inbox again (App.tsx toLikes pushes i: 1; popstate → seatScreen("/inbox"))
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-screen="inbox"]');
    await page.click('[data-testid="open-likes"]'); await page.waitForSelector('[data-screen="likes"]');
    await page.locator('[data-testid="liked-card"]').first().waitFor({ timeout: 10000 });
    const onLikes = new URL(page.url()).pathname;
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(onLikes === "/likes" && at === "inbox" && new URL(page.url()).pathname === "/inbox", `9 inbox → Offers (${onLikes}) → Back lands on the inbox (screen ${at}, url ${new URL(page.url()).pathname})`);
    await page.click('[data-testid="open-likes"]'); await page.waitForSelector('[data-screen="likes"]');
    await page.click('[data-testid="likes-back"]'); await page.waitForSelector('[data-screen="inbox"]', { timeout: 10000 }).catch(() => null);
    const at2 = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(at2 === "inbox" && new URL(page.url()).pathname === "/inbox", `9b likes' own back button → the inbox (screen ${at2}, url ${new URL(page.url()).pathname})`);
    await ctx.close();
  }
  // 10. inbox → a face → the match → Back: the inbox (App.tsx toMatch pushes i: 1 with the row; popstate → seatScreen("/inbox"))
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-screen="inbox"]');
    await page.locator('[data-testid="open-match"]').first().click(); await page.waitForSelector('[data-screen="match"]', { timeout: 10000 }).catch(() => null);
    const onMatch = new URL(page.url()).pathname, rowIn = (await state(page)).includes('"row"');
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(onMatch === "/match" && rowIn && at === "inbox" && new URL(page.url()).pathname === "/inbox", `10 inbox → a face (${onMatch}, row in the entry ${rowIn}) → Back lands on the inbox (screen ${at}, url ${new URL(page.url()).pathname})`);
    await page.goForward(); await settle(page);
    const again = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(again === "match", `10b Forward brings the match back from its entry (screen ${again}, url ${new URL(page.url()).pathname})`);
    await ctx.close();
  }
  // 11. the match → «Let's talk» (the other has not said yes) → the wait in place → its back and the system Back: the inbox
  {
    const { ctx, page } = await open(browser); await registerFull(page);
    await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-screen="inbox"]');
    await page.locator('[data-testid="open-match"]').first().click(); await page.waitForSelector('[data-screen="match"]');
    await page.click('[data-testid="talk"]'); await page.waitForSelector('[data-screen="match-waiting"]', { timeout: 10000 }).catch(() => null);
    const waitUrl = new URL(page.url()).pathname;
    await page.click('[data-testid="waiting-back"]').catch(() => null); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(waitUrl === "/match" && at === "inbox" && new URL(page.url()).pathname === "/inbox", `11 match → Let's talk → the wait (${waitUrl}) → its back → the inbox (screen ${at}, url ${new URL(page.url()).pathname})`);
    await page.goForward(); await settle(page);
    const fwd = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    await page.goBack(); await settle(page);
    const back = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(fwd === "match-waiting" && back === "inbox", `11b after my yes, Forward onto /match is the wait (screen ${fwd}), then Back: the inbox again (screen ${back})`);
    await ctx.close();
  }
  // 5. the away screen (until an hour on) → Back: still the away screen
  {
    const { ctx, page } = await open(browser, { awayIn: 3600 }); await registerFull(page, { land: "away" });
    const before = await state(page);
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen").catch(() => "(none)");
    check(at === "away", `5 /away → Back stays on away while until is ahead (screen ${at}, url ${new URL(page.url()).pathname}, state before ${before}, after ${await state(page)})`);
    await ctx.close();
  }
  // 6. a lapsed until → the feed: 6a the screen's own clock; 6b an /away entry walked onto after the until lapsed (seatScreen)
  {
    const { ctx, page } = await open(browser, { awayIn: 8 }); await registerFull(page, { land: "away" });
    const leftAt = Date.now();
    await page.waitForSelector('[data-screen="feed"]', { timeout: 20000 }).catch(() => null);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    check(at === "feed" && new URL(page.url()).pathname === "/feed", `6a until lapsed: the away screen leaves to the feed by itself (screen ${at}, after ${Math.round((Date.now() - leftAt) / 1000)} s)`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { awayIn: 3600 }); await registerFull(page, { land: "away" });
    const entry = JSON.parse(await state(page));
    // an /away entry whose until is already past, under the current one: Back walks onto it (as after a long sleep)
    await page.evaluate((e) => { history.replaceState({ ...e, until: Math.floor(Date.now() / 1000) - 60 }, "", "/away"); history.pushState({ gate: "away", i: 1, until: e.until }, "", "/away"); }, entry);
    await page.goBack(); await settle(page);
    const at = await page.locator("main[data-screen]").first().getAttribute("data-screen");
    const url = new URL(page.url()).pathname;
    check(at === "feed" && url === "/feed", `6b Back onto an /away entry with a lapsed until opens the feed, the address too (screen ${at}, url ${url}, state ${await state(page)})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
const bad = results.filter((r) => !r.ok).length;
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
