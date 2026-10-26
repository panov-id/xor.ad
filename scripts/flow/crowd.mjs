// A crowd on the local stand (scripts/flow/crowd.sh): ten people in three towns live through the sosed app (app/, the
// stand's dev server, the real local node behind it) — they register, pick their place on the map, say a phrase, like
// each other, talk when a like comes back, make tables and sit at them. Every step of every person leaves a shot, a line
// of the journal (who, step, screen, ok, ms, the node's errors, the console's errors) and the names of the animations
// that ran in the 900 ms after it; every browser leaves a video. SLOW=1 waits ~2 s between steps, so a person can watch
// from their own browser. The end: summary.txt (steps ok of all, slow answers, errors, steps with no motion, who saw
// whom) and the exit code 0 only when every step passed and the towns saw only their own phrases.
import { chromium } from "playwright";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:5174";
const OUT = process.env.OUT ?? "/out";
const SLOW = process.env.SLOW === "1";
const N = Number(process.env.PEOPLE ?? 10);
const PIN = "483915";
const RUN = Date.now().toString(36).slice(-5);
mkdirSync(`${OUT}/shots`, { recursive: true });
mkdirSync(`${OUT}/video`, { recursive: true });

// Six in Limassol (within a few hundred metres), two in Nicosia, two in Tbilisi: who sees whom is the check.
const TOWNS = [
  ["Limas", "Limassol"], ["Limas", "Limassol"], ["Limas", "Limassol"], ["Limas", "Limassol"], ["Limas", "Limassol"], ["Limas", "Limassol"],
  ["Nicos", "Nicosia"], ["Nicos", "Nicosia"], ["Tbil", "Tbilisi"], ["Tbil", "Tbilisi"],
];
const NAMES = ["Anna", "Boris", "Chloe", "Dmitri", "Elena", "Fotis", "Giorgos", "Hana", "Irakli", "Nino"];
// Ages (docs/reviews/CROWD_INTERACTION_PLAN_RU.md §2; owner 25.10: «по возрасту были кто-то меньше 21»): five under 21,
// the 20/21 edge from both sides. Who may see whom is the band of docs/chat_RU.md §8.3, applied both ways.
const AGES = [14, 16, 19, 20, 21, 34, 17, 19, 22, 28];
const band = (a) => (a <= 20 ? [Math.max(13, a - 2), a + 2] : [Math.min(21, a - 2), Infinity]);
const inBand = (a, b) => b >= band(a)[0] && b <= band(a)[1];
const mayMeet = (i, j) => TOWNS[i][1] === TOWNS[j][1] && inBand(AGES[i], AGES[j]) && inBand(AGES[j], AGES[i]);
// Each person on their own device (owner 24.10: «разное разрешение разных девайсов»): phones, tablets, laptops, a desktop.
const DEVICES = [
  ["iPhone 14", 390, 844], ["iPhone SE", 375, 667], ["Pixel 7", 412, 915], ["Galaxy S8", 360, 740], ["small phone", 320, 568],
  ["iPad mini", 768, 1024], ["iPad Pro 11", 834, 1194], ["laptop", 1280, 800], ["desktop", 1440, 900], ["full HD", 1920, 1080],
];

const journal = [];
const say = (p, text) => `${RUN} ${NAMES[p.i]}: ${text}`;
function line(rec) {
  journal.push(rec);
  appendFileSync(`${OUT}/journal.jsonl`, JSON.stringify(rec) + "\n");
  console.log(`${rec.ok ? "ok " : "BAD"} ${String(rec.who).padEnd(8)} ${rec.step.padEnd(22)} ${String(rec.ms).padStart(6)} ms  ${rec.screen ?? "-"}  ${rec.note ?? ""}`);
}

// PANEL_URL set (crowd.sh, a browser inside the stand's network): the moderator's panel after the crowd — every page of
// its menu at 1440, signed in the way the stand's e2e does (a session token from SESSION_SECRET, envelopes.spec.ts);
// each page leaves a shot and a journal line (rows seen, the node's errors, the console's errors, an error on screen).
if (process.env.PANEL_URL) {
  const PAGES = ["waitlist", "dsa-notices", "dsa-recipients", "envelopes", "support", "panel-users", "logs/client-errors",
    "logs/audit", "logs/server", "logs/pageviews", "api-keys", "secret-keys", "brands"];
  const b64 = (x) => Buffer.from(x).toString("base64url"), enc = new TextEncoder();
  const head = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64(enc.encode(JSON.stringify({ sub: "moderator@webtest.invalid", role: "moderator", brand: null, env: "test", exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET ?? "web-test-panel-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const token = `${head}.${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${body}`))))}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 960, height: 600 } } });
  await ctx.addInitScript((t) => localStorage.setItem("panel_jwt", t), token);
  const page = await ctx.newPage();
  let node = [], cons = [];
  page.on("console", (m) => { if (m.type() === "error") cons.push(m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400) node.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  let n = 0;
  for (const at of PAGES) {
    node = []; cons = [];
    const t = Date.now();
    let ok = true, note = "";
    try {
      await page.goto(`${process.env.PANEL_URL}/${at}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(2500);   // some pages poll the node: networkidle never comes
      const seen = await page.evaluate(() => ({ rows: document.querySelectorAll("tbody tr, [data-testid$='-row']").length, login: location.pathname.startsWith("/login"),
        shut: /No access/.test(document.body.innerText), err: [...document.querySelectorAll(".ant-alert-error, .ant-result-error, [role='alert']")].map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 2) }));
      ok = !seen.login && !seen.err.length && !node.length;
      note = `${seen.shut ? "no access for the moderator" : `${seen.rows} rows`}${seen.login ? ", sent to login" : ""}${seen.err.length ? `, on screen: ${seen.err.join(" | ")}` : ""}`;
    } catch (e) { ok = false; note = String(e).split("\n")[0].slice(0, 300); }
    const shot = `shots/panel-${String(++n).padStart(2, "0")}-${at.replace("/", "-")}.png`;
    await page.screenshot({ path: `${OUT}/${shot}`, fullPage: true }).catch(() => {});
    line({ who: "panel", town: "-", device: "desktop 1440 900", step: at, ok, ms: Date.now() - t, screen: at, note, anim: [], node, console: cons, shot });
  }
  await ctx.close(); await browser.close();
  const bad = journal.filter((r) => !r.ok);
  const sum = [`panel walk: ${journal.length - bad.length} of ${journal.length} pages ok`, ...journal.map((r) => `  ${r.ok ? "ok " : "BAD"} ${r.step}: ${r.note}${r.node.length ? `; node ${r.node.join(", ")}` : ""}${r.console.length ? `; console ${r.console.slice(0, 2).join(" | ")}` : ""} (${r.shot})`)];
  writeFileSync(`${OUT}/panel-summary.txt`, sum.join("\n") + "\n");
  console.log(sum.join("\n"));
  process.exit(bad.length ? 1 : 0);
}

async function step(p, name, fn) {
  const t = Date.now();
  p.nodeErrors = []; p.consoleErrors = []; p.reloads = [];
  await p.page.evaluate(() => { window.__anim = new Set(); }).catch(() => {});
  let ok = true, note = "";
  // the tab locks after pin.lock.idle while others take their turns (screen «locked» in run flow-1025-182252): the PIN
  if (await p.page.locator('[data-screen="locked"]').count().catch(() => 0)) {
    p.locks = (p.locks ?? 0) + 1;
    await p.page.locator('[data-screen="locked"] input').first().fill(PIN).catch(() => {});
    await p.page.click('[data-testid="lock-go"]').catch(() => {});
    await p.page.waitForSelector('[data-screen="locked"]', { state: "detached", timeout: 15000 }).catch(() => {});
  }
  // the note keeps the first line for the summary; the journal keeps Playwright's whole call log (run flow-1026-070519:
  // clicks on a visible tab hung 10 s and the first line never said what held them)
  let error;
  try { note = (await fn()) ?? ""; } catch (e) { ok = false; note = String(e).split("\n")[0].slice(0, 300); error = String(e?.message ?? e).slice(0, 4000); }
  await p.page.waitForTimeout(900);
  const ms = Date.now() - t - 900;
  const screen = await p.page.evaluate(() => document.querySelector("[data-screen]")?.getAttribute("data-screen")).catch(() => null);
  const anim = await p.page.evaluate(() => [...(window.__anim ?? [])]).catch(() => []);
  const shot = `shots/${String(p.i).padStart(2, "0")}-${NAMES[p.i]}-${String(++p.n).padStart(2, "0")}-${name}.png`;
  await p.page.screenshot({ path: `${OUT}/${shot}` }).catch(() => {});
  line({ who: NAMES[p.i], town: TOWNS[p.i][1], device: DEVICES[p.i % DEVICES.length].join(" "), step: name, ok, ms, screen, note, anim, node: p.nodeErrors, console: p.consoleErrors, reloads: p.reloads, shot, error });
  if (SLOW) await p.page.waitForTimeout(2000);
  return ok;
}

async function person(browser, i) {
  const [, w, h] = DEVICES[i % DEVICES.length];
  // Each person from their own address, as different devices are in life: the stand's node believes x-client-ip under its
  // ORIGIN_TOKEN (docker-compose.web.yml, relay/node/src/lib/client_ip.ts), so the sign-up limit counts per person.
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, locale: "ru-RU",
    extraHTTPHeaders: { "x-origin-token": process.env.ORIGIN_TOKEN ?? "web-test-origin-token", "x-client-ip": `10.24.${RUN.charCodeAt(0) % 200}.${i + 1}` },
    recordVideo: { dir: `${OUT}/video`, size: { width: Math.min(w, 960), height: Math.round(h * Math.min(w, 960) / w) } } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const want = sessionStorage.getItem("crowd-code") ?? Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * 32)]).join("");
    sessionStorage.setItem("crowd-code", want);
    const real = crypto.getRandomValues.bind(crypto); let used = false;
    crypto.getRandomValues = (a) => {
      if (!used && a instanceof Uint8Array && a.length === 16) { used = true; for (let k = 0; k < 16; k++) a[k] = alphabet.indexOf(want[k]); return a; }
      return real(a);
    };
    // every animation that runs (CSS, transitions, view transitions), by name, for the journal
    window.__anim = new Set();
    const look = () => { try { for (const a of document.getAnimations()) window.__anim.add(a.animationName ?? a.transitionProperty ?? a.constructor.name); } catch {} requestAnimationFrame(look); };
    requestAnimationFrame(look);
  });
  const page = await ctx.newPage();
  const p = { i, ctx, page, n: 0, nodeErrors: [], consoleErrors: [], reloads: [], phrase: null, liked: 0, limits: [], said: {}, heard: {} };
  page.on("console", (m) => { if (m.type() === "error") p.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => p.consoleErrors.push(String(e).slice(0, 200)));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && !/\.(js|ts|tsx|css|svg|woff2)$|^\/@|node_modules|^\/geo\//.test(u.pathname)) p.nodeErrors.push(`${r.request().method()} ${u.pathname} ${r.status()}`);
  });
  return p;
}

// A tab, from wherever the person stands: a screen with no tabs (the match's wait, a chat) is left by Back first.
async function tab(p, t, screen) {
  const pg = p.page, sel = `[data-testid="tab-${t}"]:visible`;
  // The phrase opens full-screen over the feed and has no tab bar on a phone (feed.css .fd-screen, by the sheet w1_card):
  // the bar under it is still «visible» to Playwright, and the like button took 5 of 5 presses (run flow-1026-081126).
  // A person presses Back first.
  // A sheet left open (the notice's «accepted», run flow-1026-125809: 2 of 2 tours stuck under it) is closed the way a
  // person does: a tap on the dim above it (layers.tsx).
  const dim = pg.locator('.dim[data-on="true"]');
  if (await dim.count()) { await dim.first().click({ position: { x: 10, y: 10 }, timeout: 5000 }).catch(() => {}); await pg.waitForTimeout(400); }
  const card = pg.locator('[data-screen="card"] [data-testid="back"]');
  if (await card.count()) {
    await card.first().click({ timeout: 5000 }); await pg.waitForSelector('[data-screen="card"]', { state: "detached", timeout: 5000 }).catch(() => {});
  }
  // History Back from a deep screen can step past the app (about:blank), so a screen with no tabs reopens the app:
  // the session is kept, the feed with its tabs comes up.
  // A reload asks the PIN, as it should (Unlock.tsx): the person types it.
  if (!(await pg.locator(sel).count())) {
    p.reloads.push(`reload on the way to ${t}`);
    await pg.goto(BASE + "/");
    const at = await pg.waitForSelector(`${sel}, [data-testid="unlock-pin"]`, { timeout: 20000 });
    if ((await at.getAttribute("data-testid")) === "unlock-pin") {
      p.reloads.push("PIN typed"); await at.fill(PIN); await pg.click('[data-testid="unlock"]'); await pg.waitForSelector(sel, { timeout: 30000 }); }
  }
  // The rail ignores a press on the tab already current (TabBar.tsx: tab !== active), so a sub-screen of that tab (the
  // match's wait at 1440) is left by history Back first; noted, it is the app's, not the person's.
  if ((await pg.locator(`${sel}[aria-current="page"]`).count()) && !(await pg.locator(`[data-screen="${screen}"]`).count())) {
    await pg.locator(sel).first().click({ timeout: 10000 });
    if (await pg.waitForSelector(`[data-screen="${screen}"]`, { timeout: 5000 }).then(() => true, () => false)) return;
    p.reloads.push(`the current tab «${t}» did nothing: Back`);
    await pg.goBack().catch(() => {});
    if (await pg.waitForSelector(`[data-screen="${screen}"]`, { timeout: 5000 }).then(() => true, () => false)) return;
  }
  await pg.locator(sel).first().click({ timeout: 10000 });
  await pg.waitForSelector(`[data-screen="${screen}"]`, { timeout: 20000 });
}

async function register(p) {
  const pg = p.page;
  // On the host network a container starting elsewhere changes the interfaces and Chromium drops the page's modules
  // (net::ERR_NETWORK_CHANGED, a blank screen): load again, up to three times.
  for (let k = 0; ; k++) {
    await pg.goto(BASE + "/").catch(() => {});
    if (await pg.waitForSelector('[data-testid="start"]', { timeout: 15000 }).then(() => true, () => false)) break;
    if (k === 2) throw new Error("the app did not load in three tries");
  }
  await pg.click('[data-testid="start"]');
  await pg.waitForSelector('[data-screen="register-1"]');
  await pg.fill('[data-testid="name"]', NAMES[p.i]); await pg.check(".reg-check input");
  // The first person tries 12 first: the floor is 13 (Register.tsx), the form must say so and not go on.
  if (p.i === 0) {
    await pg.fill('[data-testid="age"]', "12");
    const young = await pg.locator('[data-testid="register-age-min"][data-state="young"]').count();
    const goes = await pg.locator('[data-testid="next"]').isEnabled();
    p.limits.push({ limit: "age 13", hit: !!young && !goes, note: `age 12: hint ${young ? "shown" : "not shown"}, «next» ${goes ? "enabled" : "disabled"}` });
  }
  await pg.fill('[data-testid="age"]', String(AGES[p.i]));
  await pg.click('[data-testid="next"]'); await pg.waitForSelector('[data-screen="register-2"]');
  await pg.fill('[data-testid="pin"]', PIN); await pg.fill('[data-testid="pin-again"]', PIN);
  await pg.click('[data-testid="register"]'); await pg.waitForSelector('[data-screen="register-3"]', { timeout: 120000 });
  const code = await pg.evaluate(() => sessionStorage.getItem("crowd-code"));
  const gi = pg.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill(code.slice(4, 8)); await gi.nth(1).fill(code.slice(12, 16));
  await pg.click('[data-testid="confirm"]');
  // no place on a new device: the place screen comes before the feed (App.tsx landing); the person picks it there
  const at = await pg.waitForSelector('[data-screen="feed"], [data-screen="place"]', { timeout: 30000 });
  p.firstPlace = (await at.getAttribute("data-screen")) === "place";
  if (!p.firstPlace) throw new Error("a new identity with no place landed on the feed, not on the place step");
}

async function place(p) {
  const pg = p.page;
  if (!(await pg.locator('[data-screen="place"]').count())) {
    await tab(p, "me", "me");
    await pg.locator('[data-testid="me-place"]').scrollIntoViewIfNeeded();
    await pg.click('[data-testid="me-place"]'); await pg.waitForSelector('[data-screen="place"]');
  }
  await pg.fill('[data-testid="place-search"]', TOWNS[p.i][0]);
  await pg.waitForSelector('[data-testid="place-city"]', { timeout: 20000 });
  await pg.locator('[data-testid="place-city"]').nth(0).click();
  // a small drag of the map: a few hundred metres apart inside the town
  await pg.locator('[data-testid="place-map"]').scrollIntoViewIfNeeded();
  const map = await pg.locator('[data-testid="place-map"]').boundingBox();
  const vh = pg.viewportSize().height, top = Math.max(map.y, 0), bottom = Math.min(map.y + map.height, vh);
  const cx = map.x + map.width / 2, cy = (top + bottom) / 2, d = (p.i % 3) * 12 - 12;   // inside the part on screen
  if (bottom - top < 60) throw new Error(`the map is off screen (${Math.round(top)}..${Math.round(bottom)} of ${vh})`);
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + d, cy + d, { steps: 6 }); await pg.mouse.up();
  const near = await pg.locator('[data-testid="place-near"] p').first().innerText();
  // from the first-entry step «Here» leads to the feed, from Me back to Me
  await pg.click('[data-testid="place-here"]'); await pg.waitForSelector('[data-screen="me"], [data-screen="feed"]');
  const kept = await pg.evaluate(() => JSON.parse(localStorage.getItem("place.v1") ?? "null"));
  if (!kept) throw new Error("no place kept");
  p.place = kept;
  return `${near} → ${kept.name} ${kept.lat.toFixed(4)},${kept.lon.toFixed(4)}`;
}

async function sayPhrase(p) {
  const pg = p.page;
  await tab(p, "feed", "feed");
  // the feed's pen on phones and tablets, the rail's «say something» from 1024 on (TabBar.tsx)
  await pg.locator('[data-testid="write"]:visible, [data-testid="rail-say"]:visible').first().click(); await pg.waitForSelector('[data-testid="text"]');
  p.phrase = say(p, `${["кто на кофе у моря?", "ищу партнёра на шахматы", "собака ищет друга", "кто знает хорошего мастера?", "вечером гуляю у набережной"][p.i % 5]} (${TOWNS[p.i][1]})`);
  await pg.fill('[data-testid="text"]', p.phrase);
  const sent = pg.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/feed", { timeout: 20000 });
  await pg.click('[data-testid="send"]');
  const r = await sent;
  if (r.status() >= 300) throw new Error(`POST /feed ${r.status()}`);
  await pg.waitForSelector('[data-screen="feed"]', { timeout: 20000 });
  return p.phrase;
}

async function seen(p) {
  const pg = p.page;
  await tab(p, "tables", "tables"); await tab(p, "feed", "feed");
  await pg.waitForTimeout(1500);
  p.seen = await pg.locator('[data-testid="card"] .fd-open').allInnerTexts();
  return `${p.seen.length} cards: ${p.seen.filter((t) => t.startsWith(RUN)).map((t) => t.split(":")[0].slice(RUN.length + 1)).join(", ")}`;
}

async function like(p) {
  const pg = p.page;
  const cards = pg.locator('[data-testid="card"]');
  const n = await cards.count();
  let done = 0;
  for (let k = 0; k < n && done < 3; k++) {
    const text = await cards.nth(k).locator(".fd-open").innerText();
    if (!text.startsWith(RUN) || text === p.phrase) continue;
    await cards.nth(k).locator(".fd-open").click();
    await pg.waitForSelector('[data-screen="card"]', { timeout: 10000 });
    const btn = pg.locator('[data-screen="card"] [data-testid="like"]');
    if (await btn.count()) { await btn.first().click(); done++; await pg.waitForTimeout(400); }
    await pg.click('[data-screen="card"] [data-testid="back"]').catch(async () => { await pg.goBack(); });
    await pg.waitForSelector('[data-screen="feed"]', { timeout: 10000 });
  }
  p.liked = done;
  return `liked ${done}`;
}

async function talk(p) {
  const pg = p.page;
  await tab(p, "chats", "inbox");
  await pg.waitForTimeout(1200);
  let talks = 0;
  for (let k = 0; k < 2; k++) {
    const offer = pg.locator('[data-testid="open-match"]');
    if (!(await offer.count())) break;
    await offer.first().click();
    // An offer already answered opens the waiting screen (no «talk» there): back to the inbox, it waits for the other one.
    const at = await pg.waitForSelector('[data-testid="talk"], [data-screen="match-waiting"]', { timeout: 10000 });
    if ((await at.getAttribute("data-testid")) !== "talk") { await tab(p, "chats", "inbox"); break; }
    await pg.click('[data-testid="talk"]');
    await pg.waitForTimeout(1200);
    talks++;
    if (!(await pg.locator('[data-screen="inbox"]').count())) await tab(p, "chats", "inbox");
    await pg.waitForTimeout(800);
  }
  const chats = await pg.locator('[data-testid="open-chat"]').count();
  if (chats) {
    await pg.locator('[data-testid="open-chat"]').first().click();
    // a phone opens the chat as its own screen, a tablet and wider in the pane beside the inbox
    // the field opens once the chat's keys came (a wrap for this session, put by the other side): up to 60 s
    const box = pg.locator('[data-testid="text"]:visible:not([disabled])').last();
    if (!(await box.waitFor({ timeout: 60000 }).then(() => true, () => false))) {
      // the app names it and offers new keys (Chat.tsx keys-failed): asked, the step stays red, the talk is not open yet
      // the reason on screen: keys failed here, the other side asked for new ones, or our request waits for theirs
      const why = pg.locator('[data-testid="keys-failed"]:visible, [data-testid="rekey-asked"]:visible, [data-testid="rekey-waiting"]:visible');
      if (await why.count()) { await pg.locator('[data-testid="rekey-ask"]:visible, [data-testid="rekey-agree"]:visible').first().click({ timeout: 5000 }).catch(() => {}); throw new Error(`the chat's keys did not open; the app says so and new keys were asked: «${(await why.first().innerText({ timeout: 5000 }).catch(() => "")).split("\n")[0]}»`); }
      throw new Error("the chat's keys never came: the field stayed off for 60 s, no reason on screen");
    }
    await box.fill(say(p, "привет! рад знакомству"));
    await pg.locator('[data-testid="send"]:visible').last().click();
    await pg.waitForTimeout(800);
  }
  return `said yes to ${talks} offers, chats ${chats}`;
}

// One round of talk in every open chat: read what the other side wrote, answer it by quoting its last line. A chat
// counts only from the other side (§1 of the plan): converseCheck below matches what A sent against what B read.
// Round 4 in Limassol sends a 257-character line: chat.message.length is 256 (docs/facts/limits.tsv).
async function converse(p, round) {
  const pg = p.page;
  await tab(p, "chats", "inbox");
  await pg.waitForTimeout(800);
  const ids = await pg.locator('[data-testid="chat"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  if (!ids.length) throw new Error("no chat to talk in");
  let sent = 0;
  for (const id of ids.slice(0, 3)) {
    if (!(await pg.locator('[data-screen="inbox"]').count())) await tab(p, "chats", "inbox");
    await pg.locator(`[data-testid="chat"][data-id="${id}"] [data-testid="open-chat"]`).click({ timeout: 10000 });
    const box = pg.locator('[data-testid="text"]:visible:not([disabled])').last();
    if (!(await box.waitFor({ timeout: 30000 }).then(() => true, () => false))) { p.reloads.push(`chat ${id.slice(0, 6)}: field off`); continue; }
    await pg.waitForTimeout(1200);
    const theirs = (await pg.locator('[data-testid="theirs"]:visible').allInnerTexts()).filter((t) => t.startsWith(RUN));
    (p.heard[id] ??= new Set()); for (const t of theirs) p.heard[id].add(t);
    if (round === "read") { await pg.goBack().catch(() => {}); continue; }
    const last = theirs.at(-1);
    let text = say(p, last ? `${round}: отвечаю на «${last.slice(RUN.length + 1, RUN.length + 41)}»` : `${round}: привет, как дела?`);
    if (round === 4 && TOWNS[p.i][1] === "Limassol" && sent === 0) text = say(p, "длинно ").padEnd(257, "я");
    await box.fill(text);
    const r = pg.waitForResponse((x) => x.request().method() === "POST" && /\/chats\/[^/]+\/messages$/.test(new URL(x.url()).pathname), { timeout: 15000 }).catch(() => null);
    await pg.locator('[data-testid="send"]:visible').last().click();
    const res = await r;
    if ([...text].length > 256) {
      const err = await pg.locator('[data-testid="error"]:visible, [data-testid="send-again"]:visible').first().innerText({ timeout: 3000 }).catch(() => "");
      p.limits.push({ limit: "chat.message.length 256", hit: !res || res.status() >= 400 || !!err, note: `257 chars: ${res ? `POST ${res.status()}` : "no POST"}${err ? `, on screen «${err.split("\n")[0]}»` : ", nothing on screen"}` });
    }
    (p.said[id] ??= []).push(text);
    sent++;
    await pg.waitForTimeout(500);
  }
  return `round ${round}: ${sent} of ${ids.length} chats, heard ${Object.values(p.heard).reduce((a, s) => a + s.size, 0)} lines so far`;
}

// All 12 games (depth/core/new_table.ts GAMES), at tables: a chat offers backgammon only (chat-game-logic.ts CHIP_GAME).
// One seat at a time per person, so the games go in rounds with no one in two tables; the players may meet (§8.3 band).
const ROUNDS = [
  [["dots", 0, [1]], ["durak", 2, [3, 4]], ["hangman", 8, [9]]],
  [["checkers", 0, [1]], ["poker", 2, [3, 4]], ["backgammon", 9, [8]]],
  [["chess", 1, [0]], ["dominoes", 3, [2, 4]], ["battleship", 8, [9]]],
  [["chapayev", 3, [2]], ["reversi", 5, [4]]],
  [["four", 5, [4]]],
];
const games = [];   // per table: game, maker, players, id, moves by person, lines, what went wrong

// The wizard for one game: the tile, the seats when asked, then «go»; the node's answer gives the table's id.
async function makeGame(p, g) {
  const pg = p.page;
  await tab(p, "tables", "tables");
  await pg.click('[data-testid="new-table"]'); await pg.waitForSelector('[data-testid="new-table-games"]');
  await pg.click(`[data-testid="new-table-game-${g.game}"]`);
  for (let k = 0; k < 4 && !(await pg.locator('[data-testid="new-table-go"]').count()); k++) {
    const seats = pg.locator(`[data-testid="new-table-seats-${g.players.length}"]`);
    if (await seats.count()) await seats.click().catch(() => {});
    await pg.click('[data-testid="new-table-next"]'); await pg.waitForTimeout(400);
  }
  const made = pg.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/tables", { timeout: 20000 });
  await pg.click('[data-testid="new-table-go"]');
  const r = await made;
  if (r.status() >= 300) throw new Error(`POST /tables ${r.status()}: ${(await r.text()).slice(0, 120)}`);
  g.id = (await r.json().catch(() => ({}))).id;
  if (!g.id) throw new Error("POST /tables answered with no id");
  await pg.waitForSelector('[data-screen="table"]', { timeout: 15000 }).catch(() => {});
  return `${g.game} for ${g.players.length}: table ${g.id.slice(0, 8)}`;
}

async function sitAt(p, g) {
  const pg = p.page;
  if (!g.id) throw new Error(`no ${g.game} table to sit at`);
  await tab(p, "tables", "tables");
  const row = pg.locator(`[data-id="${g.id}"] [data-testid="table-open"]`);
  // A guest who stood up stays on the list; the open list looks again every TABLES_LOOK_MS (Tables.tsx, 60 s), so the
  // new table must show up without stepping away (run flow-1026-070519: 7 of 7 «not in the list» before the look).
  if (!(await row.waitFor({ timeout: 70000 }).then(() => true, () => false))) throw new Error(`the ${g.game} table of ${NAMES[g.maker]} is not in the list`);
  const seat = pg.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/tables/${g.id}/seat`, { timeout: 15000 }).catch(() => null);
  await row.click();
  await pg.waitForSelector('[data-screen="table"]', { timeout: 15000 });
  const r = await seat;
  const refused = await pg.locator('[data-screen="table"] [data-testid="error"]').first().textContent({ timeout: 2000 }).catch(() => null);
  if (refused) throw new Error(`the table refused: «${refused}»`);
  // run flow-1025-222238: 10 of 14 seats answered 409 already_seated and the step still passed
  if (r && r.status() >= 300) throw new Error(`POST seat ${r.status()}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return `at ${g.game}: ${r ? `seat ${r.status()}` : "no POST seat"}`;
}

// Start or accept the game: the maker proposes, the others accept (Table.tsx start-game, accept-game).
async function ready(p, g) {
  const pg = p.page;
  // the wizard leaves the maker on the list (shot 00-Anna-16, run flow-1025-182252): the maker opens the own table
  if (!(await pg.locator('[data-screen="table"]').count())) {
    await tab(p, "tables", "tables");
    await pg.locator(`[data-id="${g.id}"] [data-testid="table-open"]`).click({ timeout: 10000 });
    await pg.waitForSelector('[data-screen="table"]', { timeout: 15000 });
    g.notes.push(`${NAMES[p.i]} had to open the table again`);
  }
  for (let k = 0; k < 6; k++) {
    // a guest asks into the round (app/ lost the web's «apply» until 25.10: every guest had «nothing to press»)
    const b = pg.locator('[data-testid="accept-game"]:visible, [data-testid="start-game"]:visible, [data-testid="apply"]:visible');
    if (await b.count()) { const which = await b.first().getAttribute("data-testid"); await b.first().click(); await pg.waitForTimeout(800); return which; }
    if (await pg.locator('[data-screen="table"] .tg-panel button:enabled, [data-testid="word-go"]').count()) return "the board is open";
    await pg.waitForTimeout(1000);
  }
  return `nothing to press at ${g.game}`;
}

// One try at a move: whatever the board offers (columns, edges, squares, keys, cards), a word for the hangman's setter,
// a drag for the physics board. Counted only by the node's 200 on POST /tables/:id/moves.
async function tryMove(p, g) {
  const pg = p.page;
  const moves = (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/tables/${g.id}/moves`;
  let answer = null;
  // the node's reason rides with a refusal (not_your_turn, stale_seq, illegal_move): «409» alone told nothing (run flow-1026-094507)
  let why = "";
  const watch = (r) => { if (moves(r)) { answer = r.status(); if (answer !== 200) r.json().then((j) => { why = j?.error?.code ?? ""; }, () => {}); } };
  pg.on("response", watch);
  try {
    // only the hangman's form has word-go; poker's raise form is a .tg-set too (run flow-1026-081126: 30 s waits)
    const word = pg.locator('[data-screen="table"] form.tg-set:has([data-testid="word-go"]) input');
    if (await word.count()) { await word.fill("сосед"); await pg.click('[data-testid="word-go"]'); await pg.waitForTimeout(1200); }
    // battleship first places the fleet: the placeholder is a valid fleet (boards-sea.tsx FLEET_EXAMPLE)
    const fleet = pg.locator('[data-testid="sea-fleet-input"]:enabled');
    if (await fleet.count()) { await fleet.fill(await fleet.getAttribute("placeholder")); await pg.click('[data-testid="sea-fleet-go"]'); await pg.waitForTimeout(1200); }
    // chapayev is three taps, not a drag: one's own piece, a reachable cell to aim, the same cell to flick
    // (boards-physics.tsx tap); random taps almost never hit the aim twice (runs 6-8: 3, 0 and 1 moves of 2 players)
    const mine = pg.locator('[data-testid="chapayev"] .tg-pc[data-stand="mine"]:enabled');
    for (let k = 0; k < 4 && answer === null && (await mine.count()); k++) {
      await mine.nth(Math.floor(Math.random() * (await mine.count()))).click({ timeout: 3000 }).catch(() => {});
      const reach = pg.locator('[data-testid="chapayev"] .tg-pc[data-reach]:enabled');
      const n = await reach.count();
      if (!n) continue;
      const cell = reach.nth(Math.floor(Math.random() * n));
      await cell.click({ timeout: 3000 }).catch(() => {}); await cell.click({ timeout: 3000 }).catch(() => {});
      await pg.waitForTimeout(900);
    }
    // a refused card (durak: it does not beat, 409) is not the end of the try: pick another until one is taken
    for (let k = 0; k < 10 && answer !== 200; k++) {
      if (answer !== null) { g.refused.push(`${NAMES[p.i]}: moves ${answer} ${why}`); answer = null; why = ""; }
      // the board's own buttons and those under it (BoardUnder in Table.tsx: poker's bets, durak's take and done) —
      // run flow-1026-102624: poker 0 moves of 3 players, every try 30 s, and durak's defender never took
      const btns = pg.locator('[data-screen="table"] .tg-panel button:enabled, [data-screen="table"] .tg-actions button:enabled');
      const n = await btns.count();
      if (!n) {
        const canvas = pg.locator('[data-screen="table"] .tg-panel canvas, [data-screen="table"] .tg-panel svg').first();
        const box = await canvas.boundingBox().catch(() => null);
        if (!box) break;
        await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8); await pg.mouse.down();
        await pg.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 8 }); await pg.mouse.up();
        await pg.waitForTimeout(900);
        continue;
      }
      await btns.nth(Math.floor(Math.random() * n)).click({ timeout: 3000 }).catch(() => {});
      await pg.waitForTimeout(600);
    }
  } finally { pg.off("response", watch); }
  g.moves[p.i] = (g.moves[p.i] ?? 0) + (answer === 200 ? 1 : 0);
  if (answer !== null && answer !== 200) g.refused.push(`${NAMES[p.i]}: moves ${answer} ${why}`);
  return answer === null ? "no move sent" : `move: ${answer}`;
}

async function tableTalk(p, g) {
  const pg = p.page;
  const box = pg.locator('[data-testid="line-input"]');
  if (!(await box.count())) return "no field for words (not playing)";
  const text = say(p, `за столом ${g.game}: хорошая партия`).slice(0, 128);
  const r = pg.waitForResponse((x) => x.request().method() === "POST" && new URL(x.url()).pathname === `/tables/${g.id}/lines`, { timeout: 10000 }).catch(() => null);
  await box.fill(text); await box.press("Enter");
  const res = await r;
  if (res?.status() === 200) g.lines++;
  return `line: ${res ? res.status() : "no POST"}`;
}

// Stickers past sticker.minute (6 a minute): the seventh in the same minute must be refused.
async function stickerFlood(p, g) {
  const pg = p.page, st = pg.locator('[data-testid^="sticker-"]');
  if (!(await st.count())) return "no stickers";
  const codes = [];
  const watch = (r) => { if (r.request().method() === "POST" && new URL(r.url()).pathname === `/tables/${g.id}/lines`) codes.push(r.status()); };
  pg.on("response", watch);
  for (let k = 0; k < 8; k++) { await st.nth(k % (await st.count())).click(); await pg.waitForTimeout(250); }
  await pg.waitForTimeout(1500); pg.off("response", watch);
  const err = await pg.locator('[data-screen="table"] [data-testid="error"]').first().innerText({ timeout: 1000 }).catch(() => "");
  p.limits.push({ limit: "sticker.minute 6", hit: codes.some((c) => c >= 400), note: `8 stickers: ${codes.join(" ")}${err ? `; on screen «${err.split("\n")[0]}»` : "; nothing on screen"}` });
  return `stickers ${codes.join(" ")}`;
}

async function standUp(p, g) {
  const pg = p.page;
  // The node seats a person at one table at a time (routes/tables.ts already_seated), so a seat left behind refuses the
  // next round's sit. «…» opens a sheet: wait for «stand up» in it (run flow-1025-222238: counted before the sheet rose,
  // «no stand up» 24 times of 25, everyone kept the seat).
  if (!(await pg.locator('[data-screen="table"]').count())) {
    await tab(p, "tables", "tables");
    await pg.locator(`[data-id="${g.id}"] [data-testid="table-open"]`).click({ timeout: 10000 });
    await pg.waitForSelector('[data-screen="table"]', { timeout: 15000 });
  }
  await pg.click('[data-testid="table-more"]');
  const st = pg.locator('[data-testid="table-stand"]');
  await st.waitFor({ timeout: 10000 });
  const r = pg.waitForResponse((x) => x.request().method() === "DELETE" && new URL(x.url()).pathname === `/tables/${g.id}/seat`, { timeout: 10000 }).catch(() => null);
  await st.click();
  const res = await r;
  return `stood up: ${res ? res.status() : "no DELETE"}`;
}

// tables.create.hour (4 an hour): Nino makes tables until the node says no; one more than the limit at most.
async function tableFlood(p) {
  const out = [];
  for (let k = 0; k < 5; k++) {
    const g = { game: "dots", maker: p.i, players: [p.i, p.i], moves: {}, refused: [], lines: 0, notes: [] };
    try { out.push(await makeGame(p, g)); await standUp(p, g); }
    catch (e) { const m = String(e).split("\n")[0]; p.limits.push({ limit: "tables.create.hour 4", hit: /POST \/tables 4\d\d/.test(m), note: `table ${k + 1}: ${m.slice(0, 160)}` }); return out.join("; "); }
  }
  p.limits.push({ limit: "tables.create.hour 4", hit: false, note: "five tables made, no refusal" });
  return out.join("; ");
}

// Playing alone while waiting (chat spec §6.2, owner 25.10: «ну пусть видят. А когда увидит что есть заявка, то уже вместе
// будут играть»): the maker of a dots or sea table opens the puzzle and makes one move in it; the guest reads the list as
// the node gives it (GET /tables, the card's solo); after the guest's application the maker's puzzle folds into the strip.
const SOLO = new Set(["dots", "battleship"]);
async function soloOpen(p, g) {
  const pg = p.page;
  if (!(await pg.locator('[data-screen="table"]').count())) {
    await tab(p, "tables", "tables");
    await pg.locator(`[data-id="${g.id}"] [data-testid="table-open"]`).click({ timeout: 10000 });
    await pg.waitForSelector('[data-screen="table"]', { timeout: 15000 });
  }
  await pg.waitForSelector('[data-testid="solo-open"]', { timeout: 15000 });
  const marked = pg.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/tables/${g.id}/solo`, { timeout: 15000 });
  await pg.click('[data-testid="solo-open"]');
  const r = await marked;
  if (r.status() !== 204) throw new Error(`POST /tables/:id/solo ${r.status()}`);
  await pg.waitForSelector('[data-testid="solo"]', { timeout: 10000 });
  const first = pg.locator('[data-testid^="solo-edge-"], [data-testid^="solo-cell-"]').first();
  await first.click({ force: true });
  return `puzzle open, mark 204, line «${(await pg.locator('[data-testid="solo-line"]').textContent()) ?? ""}»`;
}
async function soloSeen(p, g) {
  const pg = p.page;
  // a guest already on the list gets no new GET from the tab: the list's own look comes within TABLES_LOOK_MS (60 s)
  // (run flow-1026-110213: Nino at 1920 waited 15 s)
  const listed = pg.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/tables", { timeout: 70000 });
  await tab(p, "tables", "tables");
  const body = await (await listed).json().catch(() => ({}));
  const card = (body.items ?? []).find((c) => c.id === g.id);
  if (!card) throw new Error("the table is not in GET /tables");
  if (card.solo !== true) throw new Error(`the card says solo=${card.solo}`);
  const meta = await pg.locator(`[data-id="${g.id}"] .tb-meta`).textContent({ timeout: 10000 }).catch(() => "");
  return `card solo=true, row «${meta}»`;
}
async function soloGuest(p) {
  const pg = p.page;
  if (!(await pg.locator('[data-testid="solo-guest"]').waitFor({ timeout: 15000 }).then(() => true, () => false))) throw new Error("no «a neighbour asks» strip after the application");
  return "strip shown over the puzzle";
}

async function playGames(people) {
  const at = (i) => people.find((p) => p.i === i && p.alive);
  for (const round of ROUNDS) {
    const list = round.map(([game, maker, guests]) => ({ game, maker, players: [maker, ...guests], moves: {}, refused: [], lines: 0, notes: [] }))
      .filter((g) => g.players.every((i) => at(i)));
    games.push(...list);
    await Promise.all(list.map(async (g) => {
      const who = g.players.map(at);
      if (!(await step(who[0], `game-${g.game}-make`, () => makeGame(who[0], g)))) return;
      const solo = SOLO.has(g.game) && (await step(who[0], `game-${g.game}-solo`, () => soloOpen(who[0], g)));
      if (solo) await step(who[1], `game-${g.game}-solo-seen`, () => soloSeen(who[1], g));
      for (const p of who.slice(1)) await step(p, `game-${g.game}-sit`, () => sitAt(p, g));
      for (const p of who.slice(1)) await step(p, `game-${g.game}-ready`, () => ready(p, g));
      if (solo) await step(who[0], `game-${g.game}-solo-guest`, () => soloGuest(who[0]));
      await step(who[0], `game-${g.game}-ready`, () => ready(who[0], g));
      for (let k = 0; k < 6; k++) for (const p of who) await step(p, `game-${g.game}-move`, () => tryMove(p, g));
      for (const p of who) await step(p, `game-${g.game}-talk`, () => tableTalk(p, g));
      if (g.game === "durak") await step(who[0], "game-stickers", () => stickerFlood(who[0], g));
      for (const p of who) await step(p, `game-${g.game}-stand`, () => standUp(p, g));
    }));
  }
}

// The venue's whole path (plan §3.5.2, owner 25.10: «я отправляю код заведению и оно ставит со ссылкой … пользователь
// кликает как переходит»): the cabinet at /adv signs in by the letter (Mailpit), adds a venue at Fotis' point, orders an
// envelope; the moderator reads the code on the panel's «Envelopes to post» and marks it sent; the venue types it,
// publishes an offer with a link and a promo code; Fotis meets it in the feed; the link's exit page and its redirect
// are walked; two reports burn the link. Each letter is one line of venue[] — done or why not.
const MAILPIT = process.env.MAILPIT_URL ?? "http://mailpit:8025";
const PANEL = process.env.PANEL_APP_URL ?? "http://panel:5173";
const venue = [];
const vstep = (key, ok, note) => venue.push({ key, ok, note });

async function panelToken() {
  const b64 = (x) => Buffer.from(x).toString("base64url"), enc = new TextEncoder();
  const head = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64(enc.encode(JSON.stringify({ sub: "moderator@webtest.invalid", role: "moderator", brand: null, env: "test", exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET ?? "web-test-panel-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${head}.${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${body}`))))}`;
}

async function letterToken(to) {
  for (let k = 0; k < 40; k++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json().catch(() => ({}));
    const id = found.messages?.[0]?.ID;
    if (id) {
      const l = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const m = /\/enter#([0-9a-f]{64})/.exec(`${l.Text ?? ""} ${l.HTML ?? ""}`);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sign-in letter reached ${to}`);
}

async function venuePath(browser, people) {
  const fotis = people.find((p) => p.i === 5 && p.alive);
  const email = `venue-${RUN}@example.test`, venueName = `Кофейня ${RUN}`, text = `${RUN} третий кофе даром`;
  const cab = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ru-RU", recordVideo: { dir: `${OUT}/video`, size: { width: 960, height: 600 } } });
  const adv = await cab.newPage();
  const shot = async (pg, name) => pg.screenshot({ path: `${OUT}/shots/venue-${name}.png` }).catch(() => {});
  let redirect = null;
  try {
    await adv.goto(`${BASE}/adv`);
    await adv.fill('[data-testid="adv-email"] input, input[data-testid="adv-email"]', email);
    await adv.fill('[data-testid="adv-contact"] input, input[data-testid="adv-contact"]', "Лена, +357 99 111111");
    await adv.click('[data-testid="adv-send"]');
    await adv.goto(`${BASE}/adv/enter#${await letterToken(email)}`);
    await adv.click('[data-testid="venue-add-open"]', { timeout: 15000 });
    await adv.fill('[data-testid="venue-name-input"] input, input[data-testid="venue-name-input"]', venueName);
    await adv.fill('[data-testid="venue-address"] input, input[data-testid="venue-address"]', "Анексартисиас 7, Лимасол");
    const at = fotis?.place ?? { lat: 34.6786, lon: 33.0413 };
    await adv.fill('[data-testid="venue-point"] input, input[data-testid="venue-point"]', `${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`);
    await adv.click('[data-testid="venue-radius-1000"]').catch(() => {});
    await adv.click('[data-testid="venue-add"]');
    const row = adv.locator('[data-testid="venue"]').filter({ hasText: venueName });
    await row.waitFor({ timeout: 15000 });
    await row.locator('[data-testid="venue-envelope"]').click();
    await adv.waitForTimeout(1500); await shot(adv, "a-envelope");
    vstep("а cabinet: sign-in by letter, venue, envelope", true, `status «${await row.locator('[data-testid="venue-status"]').innerText().catch(() => "?")}»`);
  } catch (e) { vstep("а cabinet: sign-in by letter, venue, envelope", false, String(e).split("\n")[0].slice(0, 200)); await shot(adv, "a-fail"); await cab.close(); return; }

  let code = null;
  const pan = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await pan.addInitScript((t) => localStorage.setItem("panel_jwt", t), await panelToken());
    const pp = await pan.newPage();
    await pp.goto(`${PANEL}/envelopes`);
    const erow = pp.locator('[data-testid="envelope-row"], tr').filter({ hasText: venueName }).first();
    await erow.waitFor({ timeout: 20000 });
    code = (await erow.locator('[data-testid="envelope-row-code"]').innerText()).trim();
    await erow.locator('[data-testid="envelope-sent"]').click();
    await pp.waitForTimeout(1500); await pp.screenshot({ path: `${OUT}/shots/venue-b-panel.png` }).catch(() => {});
    vstep("б panel: the moderator reads the code, marks the envelope sent", !!code, `code ${code ? "read" : "missing"}`);
  } catch (e) { vstep("б panel: the moderator reads the code, marks the envelope sent", false, String(e).split("\n")[0].slice(0, 200)); }
  await pan.close();
  if (!code) { await cab.close(); return; }

  try {
    const row = adv.locator('[data-testid="venue"]').filter({ hasText: venueName });
    await row.locator('[data-testid="venue-code"] input, input[data-testid="venue-code"]').fill(code);
    await row.locator('[data-testid="venue-verify"]').click();
    await adv.waitForTimeout(2000);
    const st = await row.locator('[data-testid="venue-status"]').innerText();
    vstep("в venue types the code → verified", /подтвержд/.test(st) && !/не подтв/.test(st), `status «${st}»`);
    await adv.click('[data-testid="offers-open"]').catch(() => {});
    await adv.click('[data-testid="offer-new"]', { timeout: 10000 });
    await adv.fill('[data-testid="offer-text"] input, [data-testid="offer-text"] textarea, input[data-testid="offer-text"], textarea[data-testid="offer-text"]', text);
    await adv.fill('[data-testid="offer-discount"] input, input[data-testid="offer-discount"]', "−30 %");
    await adv.fill('[data-testid="offer-promo"] input, input[data-testid="offer-promo"]', `KOFE${RUN.toUpperCase()}`).catch(() => {});
    await adv.fill('[data-testid="offer-url"] input, input[data-testid="offer-url"]', "https://put.example/menu");
    await adv.click('[data-testid="offer-preview"]'); await adv.click('[data-testid="offer-publish"]');
    await adv.locator('[data-testid="offer-published"]').waitFor({ timeout: 15000 });
    redirect = /\/o\/(\S+)/.exec(await adv.locator('[data-testid="offer-published-link"]').innerText())?.[1] ?? null;
    await shot(adv, "g-published");
    vstep("г offer with a link and a promo code published", !!redirect, redirect ? `link /o/${redirect}` : "no link in the cabinet");
  } catch (e) { vstep("в–г verify and publish", false, String(e).split("\n")[0].slice(0, 200)); await shot(adv, "g-fail"); }

  if (fotis && redirect) {
    try {
      await tab(fotis, "feed", "feed"); await fotis.page.waitForTimeout(2000);
      const card = fotis.page.locator('[data-testid="card"]').filter({ hasText: text });
      const seenIt = await card.count();
      const hasPromo = seenIt ? await card.first().locator('text=/KOFE/').count() : 0;
      await fotis.page.screenshot({ path: `${OUT}/shots/venue-d-feed.png` }).catch(() => {});
      vstep("д Fotis meets the offer in the feed", !!seenIt, seenIt ? `card shown; promo code on it: ${hasPromo ? "yes" : "NO"}; a way to the link from the card: none in feed-card.tsx` : "not in his feed");
      const exit = await fotis.ctx.newPage();
      await exit.goto(`${BASE}/o/${redirect}`);
      const st = await exit.locator('[data-screen="offer-exit"]').getAttribute("data-state", { timeout: 15000 }).catch(() => null);
      const go = exit.waitForResponse((r) => new URL(r.url()).pathname === `/o/${redirect}/go`, { timeout: 10000 }).catch(() => null);
      await exit.click('[data-testid="go"]').catch(() => {});
      const res = await go;
      await exit.screenshot({ path: `${OUT}/shots/venue-d-exit.png` }).catch(() => {});
      vstep("д the link's exit page and the redirect", st === "ok" && !!res && res.status() < 400, `exit page ${st ?? "did not open"}; /go ${res ? res.status() : "no request"}`);
      await exit.close();
    } catch (e) { vstep("д feed and link", false, String(e).split("\n")[0].slice(0, 200)); }
  }
  vstep("е «no discount given» complaint → venue's answer → panel decision", false, "no complaint control on the offer card in app/ (feed-card.tsx); not reachable by a neighbour");
  if (redirect) {
    // ж: two people report the link (Offer.tsx «report», an identity open on the page), the third tap must get 410
    const codes = [];
    for (const p of people.filter((q) => q.alive && [4, 5].includes(q.i))) {
      const pg = await p.ctx.newPage();
      await pg.goto(`${BASE}/o/${redirect}`);
      const r = pg.waitForResponse((x) => new URL(x.url()).pathname === `/o/${redirect}/report`, { timeout: 10000 }).catch(() => null);
      await pg.click('[data-testid="report"]', { timeout: 10000 }).catch(() => {});
      const res = await r; codes.push(res ? res.status() : "no report button");
      await pg.close();
    }
    const after = await fetch(`http://node:8080/o/${redirect}/go`, { redirect: "manual" }).then((r) => r.status).catch((e) => String(e).slice(0, 60));
    vstep("ж two reports burn the link → 410", after === 410, `reports ${codes.join(", ")}; then /go ${after}`);
  }
  await cab.close();
}

// The composer, one phrase: the node's answer to POST /feed and what the composer says (refused, counter, live-left).
async function compose(p, text) {
  const pg = p.page;
  await tab(p, "feed", "feed");
  await pg.locator('[data-testid="write"]:visible, [data-testid="rail-say"]:visible').first().click(); await pg.waitForSelector('[data-testid="text"]');
  await pg.fill('[data-testid="text"]', text);
  const send = pg.locator('[data-testid="send"]');
  if (!(await send.isEnabled())) {
    const why = await pg.locator('[data-testid="counter"], [data-testid="live-left"]').allInnerTexts();
    await pg.click('[data-testid="composer-back"]').catch(() => pg.goBack());
    return { status: "send disabled", said: why.join(" | ") };
  }
  const r = pg.waitForResponse((x) => x.request().method() === "POST" && new URL(x.url()).pathname === "/feed", { timeout: 30000 }).catch(() => null);
  await send.click();
  const res = await r;
  await pg.waitForTimeout(1500);
  const said = (await pg.locator('[data-testid="refused"]:visible, [data-testid="error"]:visible').allInnerTexts()).join(" | ");
  if (await pg.locator('[data-testid="composer-back"]').count()) await pg.click('[data-testid="composer-back"]').catch(() => {});
  return { status: res ? res.status() : "no POST", said };
}

// feed.live.slots 4: Fotis has one phrase out; four more, the fifth live one must be refused.
async function phraseFlood(p) {
  const got = [];
  for (let k = 2; k <= 5; k++) got.push(await compose(p, say(p, `ещё фраза ${k}: кто играет в теннис?`)));
  const last = got.at(-1);
  p.limits.push({ limit: "feed.live.slots 4", hit: last.status !== 200 && !!last.said, note: got.map((g, k) => `#${k + 2} ${g.status}${g.said ? ` «${g.said.slice(0, 80)}»` : ""}`).join("; ") });
  return got.map((g) => g.status).join(" ");
}

// phrase.length 128: a 129-grapheme phrase must not go out.
async function phraseTooLong(p) {
  const g = await compose(p, say(p, "длинная ").padEnd(129, "а"));
  p.limits.push({ limit: "phrase.length 128", hit: g.status !== 200, note: `129 graphemes: ${g.status}${g.said ? ` «${g.said.slice(0, 80)}»` : ""}` });
  return String(g.status);
}

// moderation.refusals.pause 5 → 15 min: five phrases the model refuses (a contact outside the app, moderation-path.spec.ts),
// then a sixth, which the pause must hold back.
async function refusals(p) {
  const got = [];
  for (let k = 1; k <= 6; k++) got.push(await compose(p, `${RUN} пиши в тг, договоримся ${"абвгде"[k - 1]}`));
  const sixth = got.at(-1);
  p.limits.push({ limit: "moderation.refusals.pause 5", hit: /пауз|минут|pause/i.test(sixth.said) || sixth.status === 429, note: got.map((g, k) => `#${k + 1} ${g.status}${g.said ? ` «${g.said.slice(0, 60)}»` : ""}`).join("; ") });
  return got.map((g) => g.status).join(" ");
}

// Open the card of a crowd member's phrase in this person's feed.
async function openCard(p, of) {
  const pg = p.page;
  await tab(p, "feed", "feed");
  await pg.waitForTimeout(1200);
  const card = pg.locator('[data-testid="card"] .fd-open').filter({ hasText: `${RUN} ${NAMES[of]}:` }).first();
  if (!(await card.count())) throw new Error(`${NAMES[of]}'s phrase is not in ${NAMES[p.i]}'s feed`);
  await card.click();
  await pg.waitForSelector('[data-screen="card"]', { timeout: 10000 });
}

async function cardMenu(p, item) {
  const pg = p.page;
  // «…» on the phrase is more-menu (feed-card.tsx); card-more is the sheet it opens (run flow-1026-110213: 5 of 5 menus timed out)
  await pg.locator('[data-screen="card"] [data-testid="more-menu"]').first().click();
  await pg.click(`[data-testid="${item}"]`);
}

// A DSA art. 16 notice on a phrase: reasons and the declaration, then the node's 202 (report-phrase.spec.ts).
async function notice(p, of) {
  const pg = p.page;
  await openCard(p, of);
  await cardMenu(p, "notice");
  const r = pg.waitForResponse((x) => new URL(x.url()).pathname === "/report", { timeout: 15000 }).catch(() => null);
  await pg.fill('[data-testid="notice-reason"]', `${RUN} оскорбляет соседей, прошу проверить`);
  await pg.check('[data-testid="notice-bona"]');
  await pg.click('[data-testid="notice-send"]');
  const res = await r;
  if (!res || res.status() !== 202) throw new Error(`notice: ${res ? res.status() : "no POST /report"}`);
  return `notice on ${NAMES[of]}'s phrase: 202`;
}

async function hideAndRestore(p, of) {
  const pg = p.page;
  await openCard(p, of);
  await cardMenu(p, "hide");
  await pg.waitForTimeout(1200);
  await tab(p, "feed", "feed");
  const still = await pg.locator('[data-testid="card"] .fd-open').filter({ hasText: `${RUN} ${NAMES[of]}:` }).count();
  if (still) throw new Error(`hidden, yet ${NAMES[of]}'s phrase is still in the feed`);
  await tab(p, "me", "me");
  await pg.locator('[data-testid="me-hidden"]').scrollIntoViewIfNeeded(); await pg.click('[data-testid="me-hidden"]');
  const restore = pg.locator('[data-testid="hidden-restore"]').first();
  if (!(await restore.waitFor({ timeout: 10000 }).then(() => true, () => false))) throw new Error("nothing on the «hidden» screen");
  await restore.click(); await pg.waitForTimeout(1000);
  return `hid ${NAMES[of]}'s phrase, it left the feed, brought it back`;
}

async function blockAndLift(p, of) {
  const pg = p.page;
  await openCard(p, of);
  await cardMenu(p, "block");
  await pg.click('[data-testid="block-yes"]');
  await pg.waitForTimeout(1500);
  await tab(p, "chats", "inbox");
  await tab(p, "me", "me");
  await pg.locator('[data-testid="me-blocked"]').scrollIntoViewIfNeeded(); await pg.click('[data-testid="me-blocked"]');
  const lift = pg.locator('[data-testid="blocked-lift"]').first();
  if (!(await lift.waitFor({ timeout: 10000 }).then(() => true, () => false))) throw new Error("nothing on the «blocked» screen");
  await lift.click(); await pg.waitForTimeout(1000);
  return `blocked ${NAMES[of]}, the block is listed, lifted`;
}

// Name and age: a 25-grapheme name (name.length 24) and the age down across 20/21 (docs/chat_RU.md §8.3) must be refused.
async function editMe(p) {
  const pg = p.page;
  await tab(p, "me", "me");
  await pg.click('[data-testid="me-name-age"], [data-testid="me-name"]');
  const name = pg.locator('[data-testid="edit-name"] input, input[data-testid="edit-name"]').first();
  await name.waitFor({ timeout: 10000 });
  await name.fill("Е".repeat(25));
  const kept = [...(await name.inputValue())].length;
  const left = await pg.locator('[data-testid="edit-left"]').innerText().catch(() => "");
  p.limits.push({ limit: "name.length 24", hit: kept <= 24 || !(await pg.locator('[data-testid="edit-save"]').isEnabled()), note: `typed 25, field kept ${kept}${left ? `, «${left}»` : ""}` });
  await name.fill(NAMES[p.i]);
  const age = pg.locator('[data-testid="edit-age"] input, input[data-testid="edit-age"]').first();
  await age.fill("20");
  const r = pg.waitForResponse((x) => x.request().method() === "PATCH" && new URL(x.url()).pathname === "/identities/me", { timeout: 10000 }).catch(() => null);
  const can = await pg.locator('[data-testid="edit-save"]').isEnabled();
  if (can) await pg.click('[data-testid="edit-save"]');
  const res = can ? await r : null;
  const err = await pg.locator('[data-testid="error"]:visible').first().innerText({ timeout: 2000 }).catch(() => "");
  p.limits.push({ limit: "age 21 → 20", hit: !can || (res && res.status() >= 400), note: `${can ? `PATCH ${res ? res.status() : "none"}` : "«save» disabled"}${err ? `, «${err.split("\n")[0]}»` : ""}` });
  await pg.goBack().catch(() => {});
  return "name and age tried";
}

async function tour(p) {
  const pg = p.page;
  await tab(p, "me", "me");
  for (const sub of ["me-place"]) {
    await pg.locator(`[data-testid="${sub}"]`).scrollIntoViewIfNeeded(); await pg.click(`[data-testid="${sub}"]`);
    await pg.waitForTimeout(900); await pg.goBack().catch(() => {}); await pg.waitForTimeout(600);
  }
  return "me and place";
}

async function phase(people, name, fn, only = () => true, batch = people.length) {
  const list = people.filter((p) => p.alive && only(p));
  for (let k = 0; k < list.length; k += batch) await Promise.all(list.slice(k, k + batch).map(async (p) => { const ok = await step(p, name, () => fn(p)); if (!ok && name === "register") p.alive = false; }));
}

const browser = await chromium.launch();
const people = [];
try {
  for (let i = 0; i < N; i++) { const p = await person(browser, i); p.alive = true; people.push(p); }
  await phase(people, "register", register, undefined, 3);   // the PIN's hash is heavy: three at a time
  await phase(people, "place", place);
  await phase(people, "say", sayPhrase);
  await phase(people, "feed-seen", seen);
  await phase(people, "like", like);
  await phase(people, "talk", talk);
  await phase(people, "talk-again", talk);   // a like that came back after the first round
  for (let r = 1; r <= 6; r++) await phase(people, `converse-${r}`, (p) => converse(p, r));
  await phase(people, "converse-read", (p) => converse(p, "read"));   // the last round's lines, read
  await playGames(people);
  await phase(people, "table-flood", tableFlood, (p) => p.i === 9);
  // the feed: notices (DSA art. 16), hide, limits, the model's refusals; block last, it ends chats
  await phase(people, "notice", (p) => notice(p, p.i === 9 ? 8 : 3), (p) => [2, 4, 9].includes(p.i));
  await phase(people, "hide", (p) => hideAndRestore(p, 1), (p) => p.i === 0);
  await phase(people, "phrase-flood", phraseFlood, (p) => p.i === 5);
  await phase(people, "phrase-long", phraseTooLong, (p) => p.i === 6);
  await phase(people, "refusals", refusals, (p) => p.i === 7);
  await phase(people, "edit-me", editMe, (p) => p.i === 4);
  await venuePath(browser, people).catch((e) => vstep("venue path", false, String(e).split("\n")[0].slice(0, 200)));
  await phase(people, "block", (p) => blockAndLift(p, 0), (p) => p.i === 1);
  await phase(people, "me-tour", tour);
} finally {
  for (const p of people) await p.ctx.close().catch(() => {});
  await browser.close();
}

// The summary: steps, slow answers, errors, steps with no motion, and who saw whom.
const bad = journal.filter((r) => !r.ok);
const slow = journal.filter((r) => r.ms > 1000 && r.step !== "register");
const still = journal.filter((r) => r.ok && r.anim.length === 0);
// Who saw whom: a phrase is due exactly when the two may meet (same town, each in the other's age band).
const leaks = [], misses = [];
const byName = (t) => NAMES.indexOf(t.slice(RUN.length + 1).split(":")[0]);
for (const p of people) {
  const got = new Set((p.seen ?? []).filter((t) => t.startsWith(RUN)).map(byName));
  for (const q of people) {
    if (q === p || !q.phrase) continue;
    const due = mayMeet(p.i, q.i);
    if (got.has(q.i) && !due) leaks.push(`${NAMES[p.i]} (${AGES[p.i]}, ${TOWNS[p.i][1]}) saw ${NAMES[q.i]} (${AGES[q.i]}, ${TOWNS[q.i][1]})`);
    if (!got.has(q.i) && due) misses.push(`${NAMES[p.i]} (${AGES[p.i]}) did not see ${NAMES[q.i]} (${AGES[q.i]}), same town, in band`);
  }
}
// Chats, counted from the other side: a line A sent in chat X counts when B, the other one in X, read it.
const chats = [];
for (const id of new Set(people.flatMap((p) => Object.keys(p.said).concat(Object.keys(p.heard))))) {
  const two = people.filter((p) => p.said[id] || p.heard[id]);
  const [a, b] = two;
  const got = (x, y) => (x?.said[id] ?? []).filter((t) => y?.heard[id]?.has(t)).length;
  chats.push({ id, who: two.map((p) => NAMES[p.i]).join("–"), ab: `${got(a, b)}/${a?.said[id]?.length ?? 0}`, ba: `${got(b, a)}/${b?.said[id]?.length ?? 0}`,
    ok: two.length === 2 && got(a, b) >= 3 && got(b, a) >= 3 });
}
const silent = people.filter((p) => !chats.some((c) => c.ok && c.who.split("–").includes(NAMES[p.i])));
const limits = people.flatMap((p) => p.limits.map((l) => ({ who: NAMES[p.i], ...l })));
const sum = [
  `crowd run ${RUN}: ${journal.length - bad.length} of ${journal.length} steps ok; ${people.length} people; SLOW=${SLOW ? 1 : 0}`,
  `failed: ${bad.length}`, ...bad.map((r) => `  ${r.who} ${r.step}: ${r.note} (${r.shot})`),
  `slow (> 1 s, not counting register): ${slow.length}`, ...slow.map((r) => `  ${r.who} ${r.step}: ${r.ms} ms`),
  `node errors: ${journal.reduce((a, r) => a + r.node.length, 0)}`, ...journal.filter((r) => r.node.length).map((r) => `  ${r.who} ${r.step}: ${r.node.join(", ")}`),
  `reloads (a tab reached by opening the app again): ${journal.filter((r) => r.reloads?.length).length} steps`, ...journal.filter((r) => r.reloads?.length).map((r) => `  ${r.who} ${r.step}: ${r.reloads.join(", ")}`),
  `console errors: ${journal.reduce((a, r) => a + r.console.length, 0)}`, ...journal.filter((r) => r.console.length).map((r) => `  ${r.who} ${r.step}: ${r.console.slice(0, 2).join(" | ")}`),
  `steps with no animation in 900 ms: ${still.length}`, ...still.map((r) => `  ${r.who} ${r.step} on ${r.screen}`),
  `who saw whom: ${leaks.length ? `LEAK ${leaks.length}` : "nobody saw anyone outside town and band"}; due but not seen: ${misses.length}`, ...leaks.map((l) => `  LEAK ${l}`), ...misses.map((l) => `  miss ${l}`),
  ...people.map((p) => `  ${NAMES[p.i]} (${AGES[p.i]}, ${TOWNS[p.i][1]}): ${(p.seen ?? []).filter((t) => t.startsWith(RUN)).length} crowd phrases seen, liked ${p.liked}`),
  `chats with 3+ lines read each way: ${chats.filter((c) => c.ok).length} of ${chats.length}`, ...chats.map((c) => `  ${c.ok ? "ok " : "BAD"} ${c.who}: read ${c.ab} one way, ${c.ba} the other`),
  `tabs locked by the idle PIN and opened again: ${people.reduce((a, p) => a + (p.locks ?? 0), 0)}`,
  `people with no real chat: ${silent.length}`, ...silent.map((p) => `  ${NAMES[p.i]} (${AGES[p.i]}, ${TOWNS[p.i][1]})`),
  `games with a move from every player: ${games.filter((g) => g.players.every((i) => g.moves[i] > 0)).length} of ${games.length} (of 12 in GAMES)`,
  ...games.map((g) => `  ${g.players.every((i) => g.moves[i] > 0) ? "ok " : "BAD"} ${g.game} (${g.players.map((i) => `${NAMES[i]} ${g.moves[i] ?? 0}`).join(", ")} moves; ${g.lines} lines)${g.refused.length ? ` refused: ${[...new Set(g.refused)].join(", ")}` : ""}${g.id ? "" : " — no table"}${g.notes.length ? `; ${[...new Set(g.notes)].join("; ")}` : ""}`),
  `venue path: ${venue.filter((v) => v.ok).length} of ${venue.length} steps`, ...venue.map((v) => `  ${v.ok ? "ok " : "BAD"} ${v.key}: ${v.note}`),
  `limits reached: ${limits.filter((l) => l.hit).length} of ${limits.length}`, ...limits.map((l) => `  ${l.hit ? "hit" : "NOT"} ${l.limit} (${l.who}): ${l.note}`),
];
writeFileSync(`${OUT}/summary.txt`, sum.join("\n") + "\n");
console.log(sum.join("\n"));
process.exitCode = bad.length || leaks.length || silent.length || chats.some((c) => !c.ok) || limits.some((l) => !l.hit) || games.some((g) => !g.players.every((i) => g.moves[i] > 0)) || venue.some((v) => !v.ok) ? 1 : 0;
