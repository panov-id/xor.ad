// Redesign package: every screen of one brand, at one width and one locale, against the LIVE local stands
// (not a throwaway one), with their seeded Limassol data. Run by scripts/design/capture-redesign.sh. Per screen:
// <screen>.png, <screen>.html (document.documentElement.outerHTML), <screen>.json (boxes of every visible
// element). Walk after scripts/design/shoot-web.mjs. A screen that does not open is a line in failed.tsv.
import { chromium } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BRAND = process.env.BRAND === "neighbro" ? "neighbro" : "sosed";
const URL_ = process.env.WEB_URL ?? (BRAND === "neighbro" ? "http://localhost:4183" : "http://localhost:4173");
const ADV = process.env.ADV_URL ?? (BRAND === "neighbro" ? "https://localhost:4184" : "https://localhost:4174");
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const OFFER_CODE = process.env.OFFER_CODE ?? "";
const OUT = process.env.OUT ?? "/out";             // .../<date>
const CTRL = process.env.CTRL ?? OUT;            // files answered by capture-redesign.sh (statement.*, envelope.*)
const WIDTHS = (process.env.SHOOT_WIDTHS || "1440").split(",").map(Number).filter((w) => w > 0);
const LOCALES = (process.env.SHOOT_LOCALES || "en,ru").split(",");
const LIMASSOL = { lat: 34.6823, lon: 33.0464, name: "Limassol", cc: "CY", source: "point" };
const PIN = "123456";
// CAP_ONLY="Splash,Register-1,..." (other locales): walk to the last named screen, shoot only the named ones and
// check overflow (overflow.tsv). CAP_STEPS=cabinet: the venue cabinet only, no walk of the app.
const ONLY = process.env.CAP_ONLY ? new Set(process.env.CAP_ONLY.split(",")) : null;
const CABINET_ONLY = process.env.CAP_STEPS === "cabinet";
const T = 30000;

// One child per locale x width: a width is a real context (isMobile/hasTouch only under 768).
if (!process.env.CAP_CHILD) {
  let bad = 0;
  for (const loc of LOCALES) for (const w of WIDTHS) {
    console.log(`== ${BRAND} ${loc} ${w}`);
    const r = spawnSync(process.execPath, [process.argv[1]], { stdio: "inherit", env: { ...process.env, CAP_CHILD: "1", CAP_LOCALE: loc, CAP_WIDTH: String(w) } });
    if (r.status !== 0) bad = 1;
  }
  process.exit(bad);
}
const LOC = process.env.CAP_LOCALE;
const W = Number(process.env.CAP_WIDTH);
const RU = LOC === "ru";
const DIR = `${OUT}/${BRAND}/${LOC}/${W}`;
mkdirSync(DIR, { recursive: true });
const NA = RU ? "Аня" : "Anna", NB = RU ? "Борис" : "Boris", NV = RU ? "Вера" : "Vera";
// The widths and brands run as parallel processes that start in the same millisecond: the mark names the
// width and brand too, or two runs post the same phrase and a card opens the other run's copy (16.10.2026).
const run = `${Date.now().toString(36)}${W}${BRAND[0]}`;
const aText = RU ? `гуляю у набережной Лимассола, если кто рядом ${run}` : `walking along the Limassol promenade, anyone near? ${run}`;
const bText = RU ? `иду на старый порт за кофе ${run}` : `heading to the old port for coffee ${run}`;
const rows = [];

const browser = await chromium.launch();
// Every walk its own addresses: the node counts registrations per address (10 an hour).
const base = 1 + Math.floor(Math.random() * 250), base2 = Math.floor(Math.random() * 250);
let ip = 1;
async function person(baseUrl = URL_) {
  const context = await browser.newContext({
    baseURL: baseUrl, ignoreHTTPSErrors: true, reducedMotion: "reduce",
    viewport: { width: W, height: W >= 768 ? 900 : 812 }, deviceScaleFactor: 2,
    isMobile: W < 768, hasTouch: W < 768, locale: LOC === "en" ? "en-US" : LOC === "ru" ? "ru-RU" : LOC,
    extraHTTPHeaders: { "x-origin-token": "web-test-origin-token", "x-client-ip": `198.18.${base}.${(base2 + ip++) % 250 + 1}` },
  });
  await context.addInitScript(([brand, place]) => {
    try {
      localStorage.setItem(`theme:${brand}`, "light");
      localStorage.setItem("lang-asked", "1"); localStorage.setItem("wizard-seen", "1");
      localStorage.setItem("place.v1", JSON.stringify(place));
      sessionStorage.setItem("xor-grace-ms", "0");
    } catch { /* none */ }
  }, [BRAND, LIMASSOL]);
  return context.newPage();
}

const screen = (page, name) => page.locator(`[data-screen="${name}"]`);
const id = (page, t) => page.getByTestId(t);
async function seen(locator) { await locator.first().waitFor({ state: "visible", timeout: T }); }

// Boxes of every visible element: geometry in page coordinates, the type and the paint.
function collect() {
  const out = [];
  const sx = scrollX, sy = scrollY;
  for (const el of document.documentElement.querySelectorAll("body, body *")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK"].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    out.push({
      tag: el.tagName.toLowerCase(), testid: el.getAttribute("data-testid"), screen: el.getAttribute("data-screen"),
      id: el.id || null, classes: typeof el.className === "string" ? el.className : el.getAttribute("class"),
      x: +(r.x + sx).toFixed(1), y: +(r.y + sy).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
      color: cs.color, background: cs.backgroundColor, backgroundImage: cs.backgroundImage === "none" ? null : cs.backgroundImage.slice(0, 120),
      borderRadius: cs.borderRadius, border: cs.borderTopWidth === "0px" ? null : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      boxShadow: cs.boxShadow === "none" ? null : cs.boxShadow.slice(0, 120),
      padding: cs.padding, margin: cs.margin, text: (own || (el.children.length === 0 ? (el.textContent ?? "").trim() : "")).slice(0, 80),
    });
  }
  return { url: location.pathname + location.search, viewport: [innerWidth, innerHeight], scroll: [sx, sy], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], count: out.length, boxes: out };
}

// Elements whose content is wider than their box (and do not scroll on purpose), and a page wider than the viewport.
function overflowing() {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) out.push({ tag: "html", testid: null, sw: de.scrollWidth, cw: innerWidth, overflow: "page", text: "" });
  for (const el of document.querySelectorAll("body, body *")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
    out.push({ tag: el.tagName.toLowerCase(), testid: el.getAttribute("data-testid"), sw: el.scrollWidth, cw: el.clientWidth, overflow: cs.overflowX, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50) });
  }
  return out;
}

async function shoot(page, name) {
  if (ONLY && !ONLY.has(name)) return;
  if (ONLY) {
    const found = await page.evaluate(overflowing);
    if (found.length === 0) appendFileSync(`${OUT}/overflow.tsv`, [BRAND, LOC, W, name, "none", "", "", "", ""].join("\t") + "\n");
    for (const f of found) appendFileSync(`${OUT}/overflow.tsv`, [BRAND, LOC, W, name, f.tag, f.testid ?? "", `${f.sw}>${f.cw}`, f.overflow, f.text.replace(/\t/g, " ")].join("\t") + "\n");
  }
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const themes = LOC === "en" || W === 1440 ? ["light", "dark"] : ["light"];
  for (const theme of themes) {
    await page.evaluate(([brand, t]) => { localStorage.setItem(`theme:${brand}`, t); document.documentElement.dataset.theme = t; }, [BRAND, theme]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const stem = `${DIR}/${name}${theme === "dark" ? ".dark" : ""}`;
    await page.screenshot({ path: `${stem}.png`, fullPage: true });
    writeFileSync(`${stem}.html`, await page.evaluate(() => "<!doctype html>\n" + document.documentElement.outerHTML));
    writeFileSync(`${stem}.json`, JSON.stringify(await page.evaluate(collect), null, 1));
  }
  await page.evaluate(([brand]) => { localStorage.setItem(`theme:${brand}`, "light"); document.documentElement.dataset.theme = "light"; }, [BRAND]);
}

async function step(name, page, reach) {
  try {
    await reach();
    await shoot(page, name);
    if (!ONLY || ONLY.has(name)) rows.push([name, "ok", ""]);
    console.log(`  ok  ${name}`);
  } catch (e) {
    const why = String(e.message ?? e).split("\n")[0].slice(0, 200);
    if (!ONLY || ONLY.has(name)) rows.push([name, "not opened", why]);
    console.log(`  --  ${name}: ${why}`);
  }
}

async function like(page) {
  if (BRAND === "neighbro") await id(page, "heart").click(); // one tap places it (owner, 14.10)
  else await id(page, "like").click();
}
async function home(page) {
  await page.goto("/");
  await seen(screen(page, "unlock"));
  await id(page, "unlock-pin").fill(PIN);
  await id(page, "unlock").click();
  await seen(screen(page, "feed"));
  await id(page, "loading").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
}
async function register(page, name, age, shots) {
  await page.goto("/");
  await seen(screen(page, "splash"));
  if (shots) await step("Splash", page, async () => {});
  await id(page, "start").click();
  await seen(screen(page, "register-1"));
  await id(page, "name").fill(name);
  await id(page, "age").fill(age);
  await page.getByRole("checkbox").check();
  if (shots) await step("Register-1", page, async () => {});
  await id(page, "next").click();
  await seen(screen(page, "register-2"));
  await id(page, "pin").fill(PIN);
  await id(page, "pin-again").fill(PIN);
  if (shots) await step("Register-2", page, async () => {});
  await id(page, "register").click();
  await seen(page.locator('[data-screen="register-3"], [data-testid="error"]'));
  if (await id(page, "error").isVisible()) throw new Error(`registration refused: ${await id(page, "error").textContent()}`);
  if (shots) await step("Register", page, async () => {});
  const code = (await id(page, "paper-code").textContent()).trim().split(" ");
  await id(page, "paper-groups").locator("input").first().fill(code[1]);
  await id(page, "paper-groups").locator("input").last().fill(code[3]);
  await id(page, "confirm").click();
  await seen(screen(page, "feed"));
  await id(page, "loading").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
}
async function write(page, text) {
  await id(page, "write").click();
  await seen(screen(page, "composer"));
  await id(page, "text").fill(text);
  await id(page, "send").click();
  await page.locator('[data-testid="sent"][data-state="published"]').waitFor({ timeout: 15000 });
}
async function openCard(page, text) {
  await id(page, "nav-inbox").click();
  await id(page, "nav-feed").click();
  const card = id(page, "card").filter({ hasText: text });
  await seen(card);
  await card.click();
  await seen(screen(page, "card"));
}
async function toMe(page, row, screenName) {
  await home(page);
  await id(page, "tab-me").click();
  await seen(screen(page, "me"));
  if (row) { await id(page, row).click(); await seen(screen(page, screenName)); }
}

const anya = await person();
const boris = await person();
let registered = false;
if (!CABINET_ONLY) try {
  await register(anya, NA, "28", true);
  await register(boris, NB, "31", false);
  registered = true;
} catch (e) { rows.push(["Register-walk", "not opened", String(e.message ?? e).split("\n")[0].slice(0, 200)]); console.log(`  --  register: ${rows.at(-1)[2]}`); }

if (registered) {
await step("Feed", anya, async () => { await write(boris, bText); await home(anya); });
await step("Composer", anya, async () => {
  await id(anya, "write").click();
  await seen(screen(anya, "composer"));
  await id(anya, "text").fill(aText);
});
await id(anya, "send").click().catch(() => {});
await anya.locator('[data-testid="sent"][data-state="published"]').waitFor({ timeout: 15000 }).catch(() => {});
await step("Card", anya, async () => { await openCard(anya, bText); });
await step("Card-more", anya, async () => { await id(anya, BRAND === "neighbro" ? "more" : "peek").click(); await anya.waitForTimeout(300); });
if (BRAND === "neighbro") await anya.keyboard.press("Escape"); else await id(anya, "peek").click().catch(() => {});
await step("Card-liked", anya, async () => { await like(anya); await seen(id(anya, "liked")); });
await step("Likes", boris, async () => { await home(boris); await id(boris, "likes").click(); await seen(screen(boris, "likes")); });
await step("Card-matched", boris, async () => { await home(boris); await openCard(boris, aText); await like(boris); await seen(id(boris, "matched")); });
await step("Inbox", anya, async () => { await home(anya); await id(anya, "nav-inbox").click(); await seen(id(anya, "match").filter({ hasText: NB })); });
await step("Match", anya, async () => { await id(anya, "match").filter({ hasText: NB }).getByTestId("open-match").click(); await seen(screen(anya, "match")); });
await step("Match-waiting", anya, async () => { await id(anya, "talk").click(); await seen(id(anya, "waiting")); });
await step("Chat", boris, async () => {
  await home(boris);
  await id(boris, "nav-inbox").click();
  await id(boris, "match").filter({ hasText: NA }).getByTestId("open-match").click();
  await seen(screen(boris, "match"));
  await id(boris, "talk").click();
  await seen(screen(boris, "inbox"));
  await seen(id(boris, "chat"));
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await boris.locator('[data-screen="chat"][data-keys="open"]').waitFor({ timeout: T });
  await id(boris, "text").fill(RU ? "привет" : "hi").catch(() => {});
  await id(boris, "text").press("Enter").catch(() => {});
  await boris.waitForTimeout(1000);
});
await step("ChatGame", boris, async () => {
  if (!(await id(boris, "chat-menu").isVisible())) await id(boris, "chat-more").click();
  await id(boris, "game-toggle").click();
  await boris.waitForTimeout(1500);
});
await step("Me", anya, () => toMe(anya));
if (ONLY) {
  for (const r of rows) appendFileSync(`${OUT}/results.tsv`, [BRAND, LOC, W, ...r].join("\t") + "\n");
  await browser.close();
  console.log(`${rows.filter((r) => r[1] === "ok").length} ok, ${rows.filter((r) => r[1] !== "ok").length} not opened`);
  process.exit(0);
}
await step("Me-edit-name", anya, () => toMe(anya, "me-name", "edit-name"));
await step("Hidden", anya, () => toMe(anya, "me-hidden", "hidden"));
await step("Me-away", anya, () => toMe(anya, "me-away", "step-away"));
await step("Me-pin", anya, () => toMe(anya, "me-pin", "change-pin"));
await step("Departure", anya, () => toMe(anya, "me-move", "departure"));
await step("Reissue", anya, async () => {
  await toMe(anya, "me-reissue", "reissue-1").catch(async () => { await seen(anya.locator('[data-screen^="reissue-"]')); });
});
await step("Me-reset", anya, () => toMe(anya, "me-reset", "reset"));
await step("Unlock", anya, async () => { await anya.goto("/"); await seen(screen(anya, "unlock")); });

await home(anya);
for (const text of RU ? ["кто на пляж?", "ищу компанию на ужин"] : ["who is up for the beach?", "looking for dinner company"]) await write(anya, `${text} ${run}`).catch(() => {});
await step("NewTable", anya, async () => {
  await home(anya);
  await id(anya, "nav-inbox").click();
  await id(anya, "nav-tables").click();
  await seen(screen(anya, "tables"));
  await step("Tables", anya, async () => {});
  await id(anya, "new-table").click();
  await seen(screen(anya, "new-table"));
  await anya.locator('[data-testid^="new-table-game-"]').first().click();
  await id(anya, "new-table-name").fill(`${RU ? "вечер" : "evening"} ${run}`);
});
await step("Table", anya, async () => {
  await id(anya, "new-table-next").click();
  await id(anya, "new-table-go").click();
  await seen(id(anya, "table"));
});
await step("TableBoards", anya, async () => {
  await home(boris);
  await id(boris, "nav-inbox").click();
  await id(boris, "nav-tables").click();
  const card = id(boris, "table-card").filter({ hasText: `${RU ? "вечер" : "evening"} ${run}` });
  await seen(card);
  await card.click();
  await seen(id(boris, "table"));
  await id(boris, "line-input").fill(RU ? "сыграю" : "I'm in");
  await id(boris, "apply").click();
  await id(anya, "application").first().waitFor({ timeout: 15000 });
  await id(anya, "start-game").click({ timeout: 15000 });
  await id(anya, "turn").filter({ hasNotText: /партия ещё не началась|game has not started/ }).waitFor({ timeout: 15000 });
});

const vera = await person();
await step("Blocked", boris, async () => {
  const vText = `${RU ? "кто со мной на рынок" : "who is coming to the market"} ${run}`;
  await register(vera, NV, "40", false);
  await write(vera, vText);
  await home(boris);
  await openCard(boris, vText);
  await id(boris, "more").click();
  await id(boris, "block").click();
  await id(boris, "block-confirm-yes").click();
  await toMe(boris, "me-blocked", "blocked");
});

await step("Statements", anya, async () => {
  const identity = await anya.evaluate(() => new Promise((done, fail) => {
    const req = indexedDB.open("xor-vault");
    req.onerror = () => fail(req.error);
    req.onsuccess = () => {
      const get = req.result.transaction("identity").objectStore("identity").get("me");
      get.onsuccess = () => done(get.result?.identityId ?? "");
      get.onerror = () => fail(get.error);
    };
  }));
  if (!identity) throw new Error("no identity in the vault");
  // capture-redesign.sh writes one dsa_statements row for it into the live database and answers statement.done.
  rmSync(`${CTRL}/statement.done`, { force: true });
  writeFileSync(`${CTRL}/statement.want`, identity);
  for (let i = 0; i < 60 && !existsSync(`${CTRL}/statement.done`); i++) await anya.waitForTimeout(500);
  if (!existsSync(`${CTRL}/statement.done`)) throw new Error("no statement written for the identity (statement.done)");
  await anya.goto("/");
  await seen(screen(anya, "unlock"));
  await id(anya, "unlock-pin").fill(PIN);
  await id(anya, "unlock").click();
  await seen(screen(anya, "statements"));
});
}

// The venue's cabinet. One venue per brand (a fixed e-mail), made and proved on the first walk and
// found again on the others, so twenty walks do not leave twenty venues in the live database.
const venue = await person(ADV);
// A fresh address per walk: the node lets a mailbox have 6 sign-in letters an hour (ADV_MAILBOX_LIMITS,
// relay/node/src/lib/adv.ts:33), and twenty walks asked one address. The sign-up makes the account.
const email = `redesign-${BRAND}-${LOC}-${W}-${run}@example.test`;
const venueName = `${RU ? "Пекарня «Колос»" : "Kolos Bakery"} (redesign ${BRAND} ${LOC} ${W})`;
await step("Cabinet-sign-in", venue, async () => {
  await venue.goto("/adv");
  await seen(screen(venue, "adv-sign-in"));
  await id(venue, "adv-email").fill(email);
  await id(venue, "adv-contact").fill("Maria, +357 99 000000");
});
await step("Cabinet-sent", venue, async () => { await id(venue, "adv-send").click(); await seen(id(venue, "adv-sent")); });
const sentAt = Date.now() - 60000;
let signedIn = false;
await step("Cabinet-venues", venue, async () => {
  let token = "";
  for (let i = 0; i < 40 && !token; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    for (const m of found.messages ?? []) {
      if (Date.parse(m.Created) < sentAt) continue;
      const letter = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      token = /https:\/\/adv\.(?:sosed|neighbro)\.place\/enter#([0-9a-f]{64})/.exec(`${letter.Text ?? ""} ${letter.HTML ?? ""}`)?.[1] ?? "";
      if (token) break;
    }
    if (!token) await venue.waitForTimeout(500);
  }
  if (!token) throw new Error(`no sign-in letter reached ${email} (mailpit ${MAILPIT})`);
  await venue.goto(`/adv/enter#${token}`);
  await seen(screen(venue, "adv-venues"));
  signedIn = true;
  const mine = id(venue, "venue").filter({ hasText: `redesign ${BRAND} ${LOC} ${W}` });
  if (await mine.count() === 0) {
    await id(venue, "venue-name").fill(venueName);
    await id(venue, "venue-address").fill("Makariou 12, Limassol");
    await id(venue, "venue-lat").fill("34.6786");
    await id(venue, "venue-lon").fill("33.0413");
    await id(venue, "venue-add").click();
    await mine.getByTestId("venue-status").first().waitFor({ timeout: 15000 });
  }
  const confirmed = mine.getByTestId("venue-status").filter({ hasText: /^(подтверждена|confirmed)$/ });
  if (await confirmed.count() === 0) {
    const card = mine.first();
    await card.getByTestId("venue-envelope").click();
    await card.getByTestId("venue-code").waitFor({ timeout: 15000 });
      rmSync(`${CTRL}/envelope.code`, { force: true });
    writeFileSync(`${CTRL}/envelope.want`, venueName);
    for (let i = 0; i < 60 && !existsSync(`${CTRL}/envelope.code`); i++) await venue.waitForTimeout(500);
    if (!existsSync(`${CTRL}/envelope.code`)) throw new Error("no envelope code read for the venue (envelope.code)");
    const code = readFileSync(`${CTRL}/envelope.code`, "utf-8").trim();
    await card.getByTestId("venue-code").fill(code.toLowerCase().replace("-", " "));
    await card.getByTestId("venue-verify").click();
    await confirmed.first().waitFor({ timeout: 15000 });
  }
});
if (signedIn) {
  await step("Cabinet-new-offer", venue, async () => {
    await id(venue, "adv-tab-offers").click();
    await id(venue, "offer-new").click();
    await id(venue, "offer-venue").waitFor({ timeout: 15000 });
    // Run-unique text: an advertiser may not hold two live offers with one text ("duplicate", adv.ts), and the walks leave theirs live.
    await id(venue, "offer-text").fill(`${RU ? "Второй круассан за полцены" : "Second croissant half price"} ${run}`);
    await id(venue, "offer-discount").fill("−20 %");
    await id(venue, "offer-conditions").fill(RU ? "при заказе от двух" : "when ordering two");
    await id(venue, "offer-promo").fill("KOLOS20");
    await id(venue, "offer-url").fill("https://kolos.example/");
  });
  await step("Cabinet-offers", venue, async () => {
    await id(venue, "offer-preview").click();
    await id(venue, "offer-publish").click();
    await venue.locator('[data-testid="offer-published"], [data-testid="offer-refused"]').first().waitFor({ timeout: 15000 });
    if (await id(venue, "offer-refused").isVisible()) throw new Error(`publish refused: ${await id(venue, "offer-refused").textContent()}`);
    await id(venue, "offer-to-list").click();
    await seen(id(venue, "adv-offer"));
  });
} else for (const n of ["Cabinet-new-offer", "Cabinet-offers"]) { rows.push([n, "not opened", "cabinet sign-in did not complete"]); console.log(`  --  ${n}`); }

const stranger = await person();
if (!CABINET_ONLY) {
if (OFFER_CODE) await step("Offer", stranger, async () => {
  await stranger.goto(`/o/${OFFER_CODE}`);
  await seen(screen(stranger, "offer-exit"));
  await stranger.waitForTimeout(500);
}); else { rows.push(["Offer", "not opened", "no live offer code found in the database"]); }
await step("Restore", stranger, async () => { await stranger.goto("/"); await seen(screen(stranger, "splash")); await id(stranger, "restore").click(); await seen(screen(stranger, "restore")); });
await step("Arrival", stranger, async () => { await stranger.goto("/"); await seen(screen(stranger, "splash")); await id(stranger, "arrive").click(); await seen(screen(stranger, "arrival")); });
// The kit's showcase (web/src/ui/KitPreview.tsx), on the stand's build at /kit: en, narrow and wide, both themes.
if (LOC === "en" && (W === 375 || W === 1440)) await step("Kit", stranger, async () => { await stranger.goto("/kit"); await stranger.waitForLoadState("networkidle"); await stranger.waitForTimeout(500); });
}

for (const r of rows) appendFileSync(`${OUT}/results.tsv`, [BRAND, LOC, W, ...r].join("\t") + "\n");
await browser.close();
console.log(`${rows.filter((r) => r[1] === "ok").length} ok, ${rows.filter((r) => r[1] !== "ok").length} not opened`);
