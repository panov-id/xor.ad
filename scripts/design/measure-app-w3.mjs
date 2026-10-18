// Measures the rendered app/ talks against the Dusk sheets of wave 3 (mobile w3_inbox, w3_likes, w3_match,
// w3_match-waiting), and walks the tab bar to them against a stubbed node. Run by
// scripts/measure-app-w3.sh inside the Playwright image, on an internal network: PREVIEW is the built app (with its
// CSP). Built on measure-app-w4.mjs (its helpers, its node stub, its report). Expected values are read from the
// sheets (sheet-geometry.mjs), never typed in; indices are the sheets' drawing order.
// Not compared: the line under a talk's name by its words (the sheet shows a last line, the app the web's line —
// the inbox carries no text), the head's search (not drawn), the ring's arc length (a gradient, no box of its own); on w3_likes the minutes after the distance (the node gives
// no phrase start), so the meta line is compared by its left edge only.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readSheet } from "./sheet-geometry.mjs";

const SHEETS = process.env.SHEETS ?? "/sheets";
const PREVIEW = process.env.PREVIEW_URL ?? "http://localhost:4174";
const SHOTS = process.env.SHOTS ?? "/shots";
const TOL = Number(process.env.TOL ?? 2);
const LOCALE = process.env.LANG_TAG ?? "en-US";
const GEOMETRY = process.env.GEOMETRY !== "0";
const TAG = LOCALE.slice(0, 2);
const RU = TAG === "ru";
const OVERRIDE = process.env.CSS_OVERRIDE ?? "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const sheet = (n) => readSheet(`${SHEETS}/w3_${n}.svg`);

const rows = [], notes = [], csp = [];
const NAN4 = [NaN, NaN, NaN, NaN];
const fmt = (a) => a.map((v) => (Number.isNaN(v) ? "-" : v.toFixed(1))).join(",");
function compare(screen, name, exp, act) {
  if (!GEOMETRY) return;
  const d = exp.map((e, i) => act[i] - e);
  const ok = d.every((x) => !Number.isNaN(x) && Math.abs(x) <= TOL);
  rows.push({ screen, name, exp: fmt(exp), act: fmt(act), delta: d.map((x) => (Number.isNaN(x) ? "NaN" : (x >= 0 ? "+" : "") + x.toFixed(1))).join(","), ok });
}
const note = (ok, text) => notes.push({ bad: !ok, text });
const shapeOf = (s) => [s.x, s.y, s.w, s.h];
// text: the left ink edge and the baseline; a right-aligned value: its right edge and the baseline
const left = (scr, name, exp, act) => compare(scr, name, [exp.left, exp.base], act ? [act[0], act[2]] : [NaN, NaN]);
const right = (scr, name, exp, act) => compare(scr, name, [exp.right, exp.base], act ? [act[1], act[2]] : [NaN, NaN]);

async function settle(page) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
const boxOf = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }), sel);
const box = async (page, sel, i = 0) => (await boxOf(page, sel))[i] ?? NAN4;
const linesOf = (page, sel, nth = 0) => page.evaluate(([s, k]) => {
  const el = document.querySelectorAll(s)[k]; if (!el) return [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const byTop = new Map();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const cs = getComputedStyle(n.parentElement);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText("Hg");
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const base = r.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      const key = Math.round(base);
      const L = byTop.get(key);
      if (L) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); } else byTop.set(key, { left: r.left, right: r.right, base });
    }
  }
  return [...byTop.values()].sort((a, b) => a.base - b.base).map((l) => [l.left, l.right, l.base]);
}, [sel, nth]);
const line = async (page, sel, nth = 0, i = 0) => (await linesOf(page, sel, nth))[i];

async function overflowAt(page, screen, w) {
  const bad = await page.evaluate((vw) => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`document scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
    for (const e of document.querySelectorAll("[data-screen] *")) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (e.closest("[aria-hidden='true']") && e.tagName === "path") continue;
      const tag = `${e.tagName.toLowerCase()}${e.dataset.testid ? `[${e.dataset.testid}]` : typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : ""}`;
      // the strip of faces scrolls sideways by design (w3_inbox: five faces fill 390): what is past its edge is scrolled to
      const scrolled = e.closest(".tk-strip") && !e.classList.contains("tk-strip");
      if (r.width && !scrolled && (r.right > vw + 0.5 || r.left < -0.5)) out.push(`${tag} outside the viewport: ${r.left.toFixed(1)}..${r.right.toFixed(1)} of ${vw}`);
      const clips = cs.overflowX !== "visible" || cs.textOverflow === "ellipsis";
      if (e.tagName !== "INPUT" && clips && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains("me-body") && !e.classList.contains("tk-strip")) out.push(`${tag} clips horizontally: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
    }
    return out;
  }, w);
  notes.push({ bad: bad.length > 0, text: `overflow/clipping ${screen}[${TAG}] @${w}: ${bad.length ? bad.slice(0, 6).join("; ") : "none"}` });
}

async function fonts(page, screen, probes) {
  const info = await page.evaluate(() => ({ cyr: document.fonts.check("16px Outfit", "Привет"), lat: document.fonts.check("16px Outfit", "Hello") }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const used = [];
  for (const [label, sel] of probes) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    if (!nodeId) { notes.push({ bad: true, text: `fonts ${screen}[${TAG}] ${label}: ${sel} not found` }); continue; }
    const { fonts: f } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    if (f.length === 0 || f.some((x) => !x.isCustomFont)) notes.push({ bad: true, text: `fonts ${screen}[${TAG}] ${label}: rendered with ${f.map((x) => `${x.familyName}${x.isCustomFont ? "" : " (SYSTEM)"}`).join(", ") || "nothing"}` });
    else used.push(label);
  }
  await cdp.detach();
  notes.push({ bad: (RU && !info.cyr) || !info.lat, text: `fonts ${screen}[${TAG}]: Outfit Latin ${info.lat}, Cyrillic ${info.cyr}; loaded faces on ${used.length} of ${probes.length} probes` });
}

// ── the node, stubbed: the routes the registration, the feed and Me call ──
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away|matches)(\/|$)/;
const ACCEPTED = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
// After the registration the node publishes new revisions: the terms changed on 14 Oct (a new hash), privacy and the
// rules re-dated with the hash this device accepted (w4_legal: one changed, two not).
const LATER = [
  { document: "terms", revision_date: "2026-10-14", revision_sha256: "sha-terms-2", reaccept: "required" },
  { document: "privacy", revision_date: "2026-10-02", revision_sha256: "sha-privacy", reaccept: "none" },
  { document: "guidelines", revision_date: "2026-09-01", revision_sha256: "sha-guidelines", reaccept: "none" },
];
// w3_inbox's people: four offers (Nino new), four talks — 38, 52 and 12 minutes left of the hour, Giorgi's over.
const at = (h, m) => Date.UTC(2026, 9, 18, h, m) / 1000;
function inboxRows(gone = false) {
  const now = Math.floor(Date.now() / 1000);
  const offer = (id, name, age, fresh, more = {}) => ({ kind: "match", id, name, age, phrase: { text: "…", mode: "alone" }, waiting_for_you: false, state: "proposed", arrived_since: fresh, ...more });
  const talk = (id, name, age, left, last, more = {}) => ({ kind: "chat", id, name, age, state: "open", chat_expires_at: now + left * 60 - 5, my_span: 60, last_activity_at: last, ...more });
  return [
    offer("m1", "Nino", 27, true, { phrase: { text: "Backgammon tonight?", mode: "alone" }, my_phrase: { text: "Bakery open after ten?", mode: "alone" }, ...(gone ? { my_consent: "gone" } : {}) }), offer("m2", "Dato", 30, false), offer("m3", "Ana", 25, false), offer("m4", "Tamar", 33, false),
    talk("c1", "Nino", 27, 38, at(21, 4), { pending_messages: 1 }), talk("c2", "Levan", 34, 52, at(20, 10)), talk("c3", "Mariam", 29, 12, at(18, 32)),
    talk("c4", "Giorgi", 41, 0, at(17, 5), { state: "ended", chat_expires_at: now - 60 }),
  ];
}
// w3_likes' phrases, from the stored place (Sololaki 41.689, 44.8): 100 m, 1 km and 300 m north of it.
const NORTH = (m) => 41.689 + m / 111_195;
const likedRows = () => [
  { kind: "phrase", id: "p1", text: "Who has a ladder? The persimmons are ripe.", mode: "alone", lang: "en", lat: NORTH(100), lon: 44.8, like_count: 4, state: "liked", liked_at: at(21, 0) },
  { kind: "phrase", id: "p2", text: "Lost a grey cat near the bakery — Barsik", mode: "alone", lang: "en", lat: NORTH(1000), lon: 44.8, like_count: 1, state: "liked", liked_at: at(20, 0) },
  { kind: "phrase", id: "p3", text: "Choir on Thursday, flat 12. Any voice!", mode: "party", lang: "en", lat: NORTH(300), lon: 44.8, like_count: 9, state: "liked", liked_at: at(19, 0) },
];
function nodeStub() {
  const calls = [], patches = [], accepts = [];
  const s = { share: null, pinAuth: null, pinHash: null, docs: ACCEPTED, away: null, closed: false, restricted: false, unliked: [] };
  const prepare = async (ctx) => {
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() ?? "{}");
      if (key === "GET /legal/manifest") return json(200, { documents: s.docs });
      if (key === "POST /legal/accept") { accepts.push(body()); return json(200, {}); }
      if (key === "POST /identities") { s.share = body().share; s.pinAuth = null; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") {
        const auth = body().auth;
        if (s.pinAuth === null && s.pinHash === null) { s.pinAuth = auth; return json(200, { share: s.share }); }
        const hash = s.pinHash ? Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(auth, "base64url"))).toString("hex") : null;
        if (s.pinHash ? hash === s.pinHash : auth === s.pinAuth) return json(200, { share: s.share });
        return json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
      }
      if (key === "POST /vault/pin") {   // the old proof, then the new PIN's hash and share (client.changePin)
        const b = body();
        if (b.current_auth !== s.pinAuth) return json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
        s.pinHash = b.next_auth_hash; s.share = b.next_share; s.pinAuth = "changed";
        return json(200, {});
      }
      if (key === "GET /identities/me") return json(200, { name: "Alex", name_state: "accepted", age: 32, phrases: [{ id: "p1" }, { id: "p2" }], filter_age_min: 25, filter_age_max: 35 });
      if (key === "PATCH /identities/me") { patches.push(body()); return json(200, {}); }
      if (key === "GET /statements") return json(200, { items: !s.restricted ? [] : [{ id: "st-1", restriction: "removed", facts: "Phrase “Selling…”", ground_kind: "contractual", ground_text: "Rules § 4 · ads", automated_used: false, created_at: Date.UTC(2026, 9, 12, 12) / 1000 }] });
      if (key === "POST /matches/m1/consent") { s.consented = true; return json(200, { state: "waiting" }); }
      if (key === "POST /matches/m1/decline") { s.declined = true; return route.fulfill({ status: 204 }); }
      if (key === "GET /likes") return json(200, { items: likedRows().filter((r) => !s.unliked.includes(r.id)), next: null });
      if (req.method() === "DELETE" && /^\/feed\/[^/]+\/like$/.test(u.pathname)) { s.unliked.push(decodeURIComponent(u.pathname.split("/")[2])); return json(200, {}); }
      if (key === "GET /inbox") return json(200, { items: inboxRows(s.goneNow), events: {} });
      if (key === "POST /away") { s.away = body().span; return json(200, { until: Math.floor(Date.now() / 1000) + 3600 }); }
      if (key === "POST /identities/close") { s.closed = true; return json(200, {}); }
      if (key === "GET /feed") return json(200, { items: [], next: null });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, patches, accepts, s, prepare };
}

async function open(browser, url, width, { screen, prepare }) {
  const h = width === 390 ? 844 : width === 834 ? 1194 : 900;
  const ctx = await browser.newContext({ viewport: { width, height: h }, deviceScaleFactor: 1, locale: LOCALE, isMobile: width < 768, hasTouch: width < 768, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    // w4_me: "Sololaki · identity on this device" — a place chosen before (the web's key, the web's shape)
    try { if (!localStorage.getItem("place.v1")) localStorage.setItem("place.v1", JSON.stringify({ lat: 41.689, lon: 44.8, name: "Sololaki", cc: "GE", source: "point" })); } catch {}
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
  });
  const page = await ctx.newPage();
  if (prepare) await prepare(ctx, page);
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) csp.push(`${screen}@${width} console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => csp.push(`${screen}@${width} pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(url, { waitUntil: "load" });
  if (OVERRIDE) await page.addStyleTag({ content: OVERRIDE });
  return { ctx, page };
}

const PIN = "483915";
async function registerFull(page) {   // the splash to the feed, the way a person goes (as measure-app.mjs)
  await page.waitForSelector('[data-testid="start"]'); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-screen="register-1"]');
  await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
  await page.click('[data-testid="next"]'); await page.waitForSelector('[data-screen="register-2"]');
  await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
  await page.click('[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
  const groups = await page.locator('[data-testid="paper-code"] span').allInnerTexts();
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill(groups[1].trim()); await gi.nth(1).fill(groups[3].trim());
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector('[data-screen="feed"]', { timeout: 20000 });
}
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const shot = async (page, n) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/w3_${n}.png` }); };
const enter = async (page, testid, screenName) => { await page.click(`[data-testid="${testid}"]`); await page.waitForSelector(`[data-screen="${screenName}"]`, { timeout: 20000 }); };
const leave = async (page, screenName) => { await page.click(`[data-testid="${screenName}-back"]`); await page.waitForSelector('[data-screen="me"]', { timeout: 20000 }); };
// the frame every sub-page shares: the sheet's top-left, the title
async function frame(page, scr, S) {
  compare(scr, "sheet left,top", [S.shapes[1].x, S.shapes[1].y], (await box(page, ".me-sheet")).slice(0, 2));
  left(scr, "title", S.lines[0], await line(page, ".me-bar h1"));
}
const cta = async (page, scr, S, i, t) => { compare(scr, "primary", shapeOf(S.shapes[i]), await box(page, ".me-foot .cta")); left(scr, "primary label", S.lines[t], await line(page, ".me-foot .cta span")); };


// ── run ──
const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(PREVIEW)).ok) break; } catch {}
  if (i > 120) { console.log(`measure-app-w3: SPOILED (${PREVIEW} never answered)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 1000));
}

const stub = nodeStub();
const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "w3", prepare: stub.prepare });
await registerFull(page);
await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-screen="inbox"]', { timeout: 20000 });
await page.locator('[data-testid="chat"]').nth(3).waitFor({ timeout: 20000 });
note(new URL(page.url()).pathname === "/inbox", `walk: the tab bar's «talks» opens the inbox at ${new URL(page.url()).pathname}`);
note(stub.calls.some((c) => c === "GET /inbox"), `walk: the inbox reads GET /inbox (${stub.calls.filter((c) => c.includes("/inbox")).join(", ") || "never"})`);

// w3_inbox
if (want("inbox")) {
  const S = sheet("inbox"), sh = S.shapes, L = S.lines, scr = "inbox";
  await settle(page);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(page, ".tk-sheet")).slice(0, 2));
  left(scr, "brand word", L[0], await line(page, ".me-head .word"));
  left(scr, "title", L[1], await line(page, ".tk-title"));
  left(scr, "sub line 1", L[2], await line(page, ".tk-sub", 0, 0));
  left(scr, "sub line 2", L[3], await line(page, ".tk-sub", 0, 1));
  compare(scr, "offers circle", shapeOf(sh[2]), await box(page, ".tk-offers .tk-circle"));
  left(scr, "offers label", L[4], await line(page, ".tk-offers .tk-label"));
  for (let i = 0; i < 4; i++) compare(scr, `face ${i + 1}`, shapeOf(sh[8 + i]), await box(page, '[data-testid="open-match"] .tk-circle', i));
  left(scr, "face 1 letter", L[5], await line(page, '[data-testid="open-match"] .tk-circle', 0));
  for (const [i, t] of [[0, 6], [1, 8], [2, 10], [3, 12]]) left(scr, `face ${i + 1} name`, L[t], await line(page, '[data-testid="open-match"] .tk-label', i));
  for (let i = 0; i < 4; i++) compare(scr, `row ${i + 1} avatar`, shapeOf(sh[[12, 14, 15, 16][i]]), await box(page, ".tk-avatar", i));
  left(scr, "row 1 letter", L[13], await line(page, ".tk-avatar", 0));
  for (const [i, t] of [[0, 14], [1, 18], [2, 22], [3, 26]]) left(scr, `row ${i + 1} name`, L[t], await line(page, ".tk-name", i));
  for (const [i, t] of [[0, 16], [1, 20], [2, 24], [3, 28]]) left(scr, `row ${i + 1} line`, L[t], await line(page, ".tk-line", i));
  for (const [i, t] of [[0, 15], [1, 19], [2, 23], [3, 27]]) right(scr, `row ${i + 1} time`, L[t], await line(page, ".tk-time", i));
  compare(scr, "row 2 ring", shapeOf(sh[18]), await box(page, ".tk-ring", 1));
  for (const [i, t] of [[0, 30], [1, 31], [2, 32]]) left(scr, `ring ${i + 1} minutes`, L[t], await line(page, ".tk-ring", i));
  compare(scr, "row 1 dot", shapeOf(sh[13]), await box(page, ".tk-dot"));
  right(scr, "row 4 ended", L[29], await line(page, ".tk-ended"));
  compare(scr, "tab bar", shapeOf(sh[20]), await box(page, ".tabbar"));
  compare(scr, "tab talks (lime)", shapeOf(sh[21]), await box(page, '.tab[aria-current="page"]'));
  await shot(page, "inbox");
}
await overflowAt(page, "inbox", 390);
await fonts(page, "inbox", [["title", ".tk-title"], ["row name", ".tk-name"]]);

// w3_likes: the inbox's «Offers» circle
await page.click('[data-testid="open-likes"]'); await page.waitForSelector('[data-screen="likes"]', { timeout: 20000 });
await page.locator('[data-testid="liked-card"]').nth(2).waitFor({ timeout: 20000 });
note(new URL(page.url()).pathname === "/likes" && stub.calls.includes("GET /likes"), `walk: «Offers» opens what I am in on at ${new URL(page.url()).pathname}, reading GET /likes`);
if (want("likes")) {
  const S = sheet("likes"), sh = S.shapes, L = S.lines, scr = "likes";
  await settle(page);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(page, ".tk-likes")).slice(0, 2));
  left(scr, "title", L[0], await line(page, ".me-bar h1"));
  left(scr, "lead", L[1], await line(page, ".tk-lead"));
  for (let i = 0; i < 3; i++) {
    const c = `card ${i + 1}`, s0 = 2 + i * 4, t0 = [2, 7, 12][i];
    compare(scr, c, shapeOf(sh[s0]), await box(page, '[data-testid="liked-card"]', i));
    compare(scr, `${c} hand`, shapeOf(sh[s0 + 1]), await box(page, '[data-testid="unlike"]', i));
    compare(scr, `${c} strip`, shapeOf(sh[s0 + 2]), await box(page, ".tk-cards .fd-foot", i));
    compare(scr, `${c} mode`, shapeOf(sh[s0 + 3]), await box(page, ".tk-cards .fd-mode", i));
    left(scr, `${c} line 1`, L[t0], await line(page, ".tk-phrase", i, 0));
    left(scr, `${c} line 2`, L[t0 + 1], await line(page, ".tk-phrase", i, 1));
    left(scr, `${c} distance`, L[t0 + 2], await line(page, ".tk-meta span", i));
    left(scr, `${c} in`, L[t0 + 3], await line(page, ".tk-cards .fd-in > span", i));
  }
  await shot(page, "likes");
}
const words = await page.locator(".tk-meta span").allInnerTexts();
note(words.join("|") === (RU ? "100 м|1 км|300 м" : "100 m|1 km|300 m"), `walk: the distances from the place are ${words.join(", ")}`);
await overflowAt(page, "likes", 390);
await page.locator('[data-testid="unlike"]').first().click();
const gone = await page.locator('[data-testid="liked-card"]').count().then(async (n) => { for (let k = 0; k < 40 && n !== 2; k++) { await page.waitForTimeout(100); n = await page.locator('[data-testid="liked-card"]').count(); } return n; });
note(gone === 2 && stub.s.unliked.includes("p1"), `walk: the hand takes the like back (DELETE /feed/p1/like ${stub.s.unliked.includes("p1") ? "sent" : "never sent"}, ${gone} cards left)`);
await page.click('[data-testid="likes-back"]'); await page.waitForSelector('[data-screen="inbox"]', { timeout: 20000 });
note(new URL(page.url()).pathname === "/inbox", `walk: likes' back returns to the inbox at ${new URL(page.url()).pathname}`);

// w3_match: Nino's face in the strip
await page.locator('[data-testid="open-match"]').first().click(); await page.waitForSelector('[data-screen="match"]', { timeout: 20000 });
note(new URL(page.url()).pathname === "/match", `walk: a face in the strip opens the match at ${new URL(page.url()).pathname}`);
if (want("match")) {
  const S = sheet("match"), sh = S.shapes, L = S.lines, scr = "match";
  for (let k = 0; k < 50 && !/\S/.test(await page.locator(".tk-big").first().innerText()); k++) await page.waitForTimeout(100); // my initial, from the profile
  await settle(page);
  compare(scr, "card", shapeOf(sh[1]), await box(page, ".tk-match"));
  compare(scr, "pill", shapeOf(sh[2]), await box(page, ".tk-pill"));
  compare(scr, "face me", shapeOf(sh[5]), await box(page, ".tk-big", 0));
  compare(scr, "face them", shapeOf(sh[7]), await box(page, ".tk-big", 1));
  compare(scr, "hand", shapeOf(sh[8]), await box(page, ".tk-hand"));
  compare(scr, "let's talk", shapeOf(sh[3]), await box(page, ".tk-talk"));
  left(scr, "pill text", L[0], await line(page, ".tk-pill"));
  left(scr, "title line 1", L[1], await line(page, ".tk-match-title", 0, 0));
  left(scr, "title line 2", L[2], await line(page, ".tk-match-title", 0, 1));
  left(scr, "hint line 1", L[3], await line(page, ".tk-match-hint", 0, 0));
  left(scr, "hint line 2", L[4], await line(page, ".tk-match-hint", 0, 1));
  left(scr, "you said", L[5], await line(page, ".tk-quote figcaption", 0));
  left(scr, "my phrase 1", L[6], await line(page, ".tk-quote blockquote", 0, 0));
  left(scr, "my phrase 2", L[7], await line(page, ".tk-quote blockquote", 0, 1));
  left(scr, "they said", L[8], await line(page, ".tk-quote figcaption", 1));
  left(scr, "their phrase 1", L[9], await line(page, ".tk-quote blockquote", 1, 0));
  left(scr, "their phrase 2", L[10], await line(page, ".tk-quote blockquote", 1, 1));
  left(scr, "let's talk label", L[11], await line(page, ".tk-talk"));
  left(scr, "not now label", L[12], await line(page, ".tk-later"));
  await shot(page, "match");
}
await overflowAt(page, "match", 390);
await page.click('[data-testid="talk"]');
for (let k = 0; k < 50 && !stub.s.consented; k++) await page.waitForTimeout(100);
note(stub.s.consented === true, `walk: «Let's talk» sends the consent (POST /matches/m1/consent ${stub.s.consented ? "sent" : "never sent"})`);

// w3_match-waiting: the node answered "waiting" — the wait in place; one line queued, as the sheet
await page.waitForSelector('[data-screen="match-waiting"]', { timeout: 20000 });
await page.fill('[data-testid="queued-line"]', "Hi! Coffee near the bakery?");
await page.click('[data-testid="enqueue"]');
await page.locator(".tk-bubble").first().waitFor({ timeout: 10000 });
note((await page.locator('[data-testid="queued-line"]').inputValue()) === "", "walk: a queued line leaves the field empty and stands as a bubble");
if (want("match-waiting")) {
  const S = sheet("match-waiting"), sh = S.shapes, L = S.lines, scr = "waiting";
  await page.locator('[data-testid="queued-line"]').blur();
  await settle(page);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(page, ".tk-wait")).slice(0, 2));
  compare(scr, "face", shapeOf(sh[2]), await box(page, ".tk-wait-face"));
  compare(scr, "empty ring", shapeOf(sh[3]), await box(page, ".tk-wait-ring"));
  compare(scr, "note", shapeOf(sh[4]), await box(page, ".tk-wait-note"));
  compare(scr, "bubble", shapeOf(sh[5]), await box(page, ".tk-bubble"));
  compare(scr, "input", shapeOf(sh[6]), await box(page, ".tk-compose input"));
  compare(scr, "send", shapeOf(sh[7]), await box(page, ".tk-send"));
  compare(scr, "to talks", shapeOf(sh[8]), await box(page, ".tk-to-talks"));
  left(scr, "title", L[0], await line(page, ".me-bar h1"));
  left(scr, "face letter", L[1], await line(page, ".tk-wait-face"));
  left(scr, "name", L[2], await line(page, ".tk-wait-name"));
  left(scr, "state", L[3], await line(page, ".tk-wait-state"));
  left(scr, "note line 1", L[4], await line(page, ".tk-wait-note span", 0, 0));
  left(scr, "note line 2", L[5], await line(page, ".tk-wait-note span", 0, 1));
  left(scr, "bubble text", L[6], await line(page, ".tk-bubble"));
  right(scr, "bubble time", L[7], await line(page, ".tk-bubble-time"));
  left(scr, "to talks label", L[9], await line(page, ".tk-to-talks span"));
  await shot(page, "match-waiting");
}
await overflowAt(page, "match-waiting", 390);
stub.s.goneNow = true;   // the other said "not now" to my yes: the next look (5 s) drops the wait
await page.locator('[data-testid="tombstone"]').waitFor({ timeout: 12000 }).catch(() => {});
note(await page.locator('[data-testid="tombstone"]').count() === 1 && await page.locator(".tk-bubble").count() === 0, `walk: their «not now» turns the wait into «gone» and drops the queued line (${await page.locator(".tk-bubble").count()} bubbles left)`);
await page.click('[data-testid="to-inbox"]'); await page.waitForSelector('[data-screen="inbox"]', { timeout: 20000 });
note(new URL(page.url()).pathname === "/inbox", `walk: «To talks» opens the inbox at ${new URL(page.url()).pathname}`);
await ctx.close();
for (const w of [375, 320]) {
  const s2 = nodeStub();
  const o = await open(browser, PREVIEW + "/", w, { screen: "w3", prepare: s2.prepare });
  await registerFull(o.page);
  await o.page.click('[data-testid="tab-chats"]');
  const shown = await o.page.locator('[data-testid="chat"]').nth(3).waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (!shown) await o.page.screenshot({ path: `${SHOTS}/w3_inbox-${TAG}-${w}-missing.png` });
  note(shown, `walk: the inbox at ${w}[${TAG}] shows its four talks (${await o.page.locator('[data-testid="chat"]').count()} in the DOM, screen ${await o.page.locator("main[data-screen]").first().getAttribute("data-screen").catch(() => "(none)")})`);
  await settle(o.page); await overflowAt(o.page, "inbox", w); await o.ctx.close();
}

await browser.close();

// ── report ──
if (rows.length) {
  const wN = Math.max(...rows.map((r) => r.name.length)), wE = Math.max(...rows.map((r) => r.exp.length)), wA = Math.max(...rows.map((r) => r.act.length));
  console.log(`${"screen".padEnd(12)} ${"element".padEnd(wN)}  ${"expected".padEnd(wE)}  ${"actual".padEnd(wA)}  ${"delta".padEnd(20)} ok`);
  console.log(`(box = left,top,width,height; text = left or right,baseline; px; locale ${LOCALE}; tolerance ${TOL} px)`);
  for (const r of rows) console.log(`${r.screen.padEnd(12)} ${r.name.padEnd(wN)}  ${r.exp.padEnd(wE)}  ${r.act.padEnd(wA)}  ${r.delta.padEnd(20)} ${r.ok ? "ok" : "NO"}`);
  const per = {};
  for (const r of rows) { per[r.screen] ??= [0, 0]; per[r.screen][1]++; if (r.ok) per[r.screen][0]++; }
  console.log(`per sheet: ${Object.entries(per).map(([s, [g, n]]) => `${s} ${g}/${n}`).join("; ")}`);
}
for (const n of notes) console.log(`${n.bad ? "DEFECT" : "ok    "} ${n.text}`);
console.log(csp.length ? `DEFECT console/CSP errors (${csp.length}): ${[...new Set(csp)].slice(0, 8).join(" | ")}` : "ok     console/CSP errors: none");
const good = rows.filter((r) => r.ok).length;
const clean = !notes.some((n) => n.bad) && !csp.length;
console.log(GEOMETRY ? `measure-app-w3: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w3[${TAG}]: fonts, overflow, walks, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
