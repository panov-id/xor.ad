// The stand against the adaptive sheets (panel/design/adaptive-*.svg, owner 11.10.2026), no screenshots.
// The old gate (compare-web.mjs) measured the stand against the 02.10 brand sheets, so the
// entry kept the old look while it read GREEN (owner, 12.10.2026). This one opens a screen
// at its sheet's width and pairs every box the stand DRAWS (a fill, a rim or a shadow) with
// a rect on the sheet by its size and place. Three classes of defect:
//   extra   — the stand draws a box the sheet has not (an old-design piece);
//   missing — the sheet draws a box the stand has not;
//   radius  — a pair whose corner differs by more than 2 px (both clamped to h/2).
// A pair whose fill differs is listed as colour, the theme being the sheet's (light).
//   node check-adaptive.mjs <base> <brand> [screen…]      sheets read from /design
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const [BASE, BRAND, ...only] = process.argv.slice(2);
const PIN = "123456";
const TOL = 8; // px, size and place

// A sheet as boxes: <rect> and <circle> with the translate/scale of their groups.
function sheetBoxes(name) {
  const svg = readFileSync(`/design/adaptive-${BRAND}-${name}.svg`, "utf-8");
  const W = Number(svg.match(/<svg[^>]* width="([\d.]+)"/)[1]);
  const stack = [[0, 0, 1]];
  const out = [];
  for (const m of svg.matchAll(/<(\/?)(g|rect|circle|pattern|defs)\b([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, self] = m;
    const a = (k) => { const v = attrs.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)); return v ? v[1] : null; };
    if (tag === "g" || tag === "pattern" || tag === "defs") {
      if (close) { stack.pop(); continue; }
      if (self) continue;
      const [tx, ty, s] = stack.at(-1);
      const tr = a("transform") ?? "";
      const t = tr.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      const sc = tr.match(/scale\(([\d.]+)/);
      // Inside a pattern or defs nothing is drawn where it stands.
      // A faint group (opacity < .5) is the ground's decoration, as a faint shape is.
      const hidden = tag !== "g" || stack.at(-1)[3] || (a("opacity") !== null && Number(a("opacity")) < 0.5);
      stack.push([tx + (t ? Number(t[1]) * s : 0), ty + (t ? Number(t[2]) * s : 0), s * (sc ? Number(sc[1]) : 1), hidden]);
      continue;
    }
    if (close) continue;
    const [tx, ty, s, hidden] = stack.at(-1);
    if (hidden) continue;
    const cls = a("class") ?? "";
    if (/frame|legend/.test(cls)) continue;
    // neighbro's sticker shadow is a rect of its own under the sticker (opacity .9); the stand draws it as box-shadow.
    if (a("opacity") && Number(a("opacity")) < 1 && a("stroke-linejoin")) continue;
    // A faint shape (opacity < .5) is the ground's decoration, not a box a person reads.
    if (a("opacity") && Number(a("opacity")) < 0.5) continue;
    const fill = a("fill"), stroke = a("stroke");
    if ((!fill || fill === "none") && !stroke) continue;
    let x, y, w, h, r;
    if (tag === "rect") {
      x = Number(a("x") ?? 0); y = Number(a("y") ?? 0); w = Number(a("width")); h = Number(a("height")); r = Number(a("rx") ?? 0);
    } else {
      r = Number(a("r")); x = Number(a("cx")) - r; y = Number(a("cy")) - r; w = h = 2 * r;
    }
    const box = { x: tx + x * s, y: ty + y * s, w: w * s, h: h * s, r: r * s, fill: fill && fill !== "none" ? fill.toLowerCase() : null, tag };
    // The page itself and icon strokes are not boxes a person reads as controls.
    if (box.w >= W - 1 && box.x <= 0) continue;
    if (box.w < 16 || box.h < 16) continue;
    out.push(box);
  }
  // A hard shadow is the same shape drawn first, 1–4 px off: the stand draws it as box-shadow.
  const shapes = out.filter((s, i) => !out.slice(i + 1).some((t) => t.w === s.w && t.h === s.h && (t.x !== s.x || t.y !== s.y) && Math.abs(t.x - s.x) <= 4 && Math.abs(t.y - s.y) <= 4));
  return { W, boxes: shapes, H: Number(svg.match(/<rect class="frame"[^>]* height="([\d.]+)"/)?.[1] ?? 851) };
}

// Every box the stand draws.
const standBoxes = (page) => page.evaluate(() => {
  const hex = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/); if (!m || m[4] === "0") return null; return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join(""); };
  const out = [];
  // SVG shapes the stand draws (the brand's mark): a filled circle or rect is a box as on the sheet.
  for (const el of document.querySelectorAll(".ui-mark circle, .ui-mark rect")) {
    const fill = getComputedStyle(el).fill;
    if (!fill || fill === "none" || el.closest("[aria-hidden=true] [data-part=icons], [data-part=icons]")) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 16 || b.height < 16 || b.bottom < 0 || b.top > innerHeight) continue;
    const r = el.tagName === "circle" ? b.width / 2 : Number(el.getAttribute("rx") ?? 0) * (b.width / (Number(el.getAttribute("width")) || b.width));
    out.push({ x: b.left, y: b.top, w: b.width, h: b.height, r, fill: hex(fill), id: "svg-" + el.tagName });
  }
  // A game's drawing on its tile (GameArt) and a sticker (Sticker) — the sheets' own drawing: its filled shapes are boxes as the
  // sheet's are, read the way sheetBoxes reads them — translate and scale of the groups, a rotation
  // (a fanned card, neighbro's lean) not applied, a faint shape (opacity < .5) left out.
  for (const svg of document.querySelectorAll("svg.game-art, svg.ui-sticker")) {
    const sb = svg.getBoundingClientRect();
    const sw = svg.clientWidth, sh = svg.clientHeight; // the laid-out box, before a CSS lean
    if (!sw || sb.bottom < 0 || sb.top > innerHeight) continue;
    const vb = svg.viewBox.baseVal, k = sw / vb.width;
    const ox = sb.left + sb.width / 2 - sw / 2 - vb.x * k, oy = sb.top + sb.height / 2 - sh / 2 - vb.y * k;
    for (const el of svg.querySelectorAll("rect, circle")) {
      const fill = getComputedStyle(el).fill;
      if (!fill || fill === "none" || Number(el.getAttribute("opacity") ?? 1) < 0.5) continue;
      let tx = 0, ty = 0, s = 1;
      for (let g = el.parentElement; g && g !== svg; g = g.parentElement) {
        const tr = g.getAttribute("transform") ?? "";
        const t = tr.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/), sc = tr.match(/scale\(([\d.]+)/);
        const gs = sc ? Number(sc[1]) : 1;
        tx = (t ? Number(t[1]) : 0) + tx * gs; ty = (t ? Number(t[2]) : 0) + ty * gs; s *= gs;
      }
      const a = (n) => Number(el.getAttribute(n) ?? 0);
      const [x, y, w, h, r] = el.tagName === "circle" ? [a("cx") - a("r"), a("cy") - a("r"), 2 * a("r"), 2 * a("r"), a("r")] : [a("x"), a("y"), a("width"), a("height"), a("rx")];
      const box = { x: ox + (tx + x * s) * k, y: oy + (ty + y * s) * k, w: w * s * k, h: h * s * k, r: r * s * k, fill: hex(fill), id: "art-" + el.tagName };
      if (box.w < 16 || box.h < 16 || box.y + box.h < 0 || box.y > innerHeight) continue;
      out.push(box);
    }
  }
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(".visually-hidden") || el.parentElement?.closest("svg")) continue;
    // What a closed <details> folds away is not drawn (Chrome still gives it a box).
    const folded = el.closest("details:not([open])");
    if (folded && folded !== el && !el.closest("summary")) continue;
    const cs = getComputedStyle(el);
    // Faint (opacity < .5) is the ground's decoration on the stand as on the sheet.
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.5) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 16 || b.height < 16 || b.bottom < 0 || b.top > innerHeight) continue;
    if (b.width >= innerWidth - 1 && b.left <= 0) continue;
    const first = el.classList.contains("ui-split") ? el.firstElementChild : null;
    const fill = (first && hex(getComputedStyle(first).backgroundColor)) || hex(cs.backgroundColor);
    // A rim is a box's when it runs on the sides too; a lone top or bottom rule is a line between rows.
    const rim = parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0 && hex(cs.borderTopColor);
    // A Split is ONE capsule to the eye: its parts are not shapes of their own, and its colour is its first part's.
    if (el.parentElement?.classList.contains("ui-split")) continue;
    // The icon tip (web/src/ui/iconTips.ts) is a passing bubble under the pointer, not a shape of the screen.
    if (el.classList.contains("ui-icon-tip")) continue;
    if (!fill && !rim && cs.boxShadow === "none") continue;
    const id = el.tagName.toLowerCase() + (el.dataset.testid ? "#" + el.dataset.testid : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    const box = { x: b.left, y: b.top, w: b.width, h: b.height, r: parseFloat(cs.borderTopLeftRadius) || 0, fill, id };
    // A wrapper and its one child on the same box (a split around its button) are one shape to the eye:
    // the outline is the wrapper's, the fill whichever has one.
    const same = out.find((o) => Math.abs(o.x - box.x) < 1 && Math.abs(o.y - box.y) < 1 && Math.abs(o.w - box.w) < 1 && Math.abs(o.h - box.h) < 1);
    if (same) { same.fill = box.fill ?? same.fill; same.r = Math.max(same.r, box.r); continue; }
    out.push(box);
  }
  return out;
});

const near = (a, b, t) => Math.abs(a - b) <= t;
function pair(sheet, stand) {
  const used = new Set();
  const pairs = [], extra = [];
  for (const d of stand) {
    let best = -1, cost = Infinity;
    sheet.forEach((s, i) => {
      if (used.has(i) || !near(d.w, s.w, TOL) || !near(d.h, s.h, TOL) || !near(d.x, s.x, TOL) || !near(d.y, s.y, 4 * TOL)) return;
      const c = Math.abs(d.x - s.x) + Math.abs(d.y - s.y) + Math.abs(d.w - s.w) + Math.abs(d.h - s.h);
      if (c < cost) { cost = c; best = i; }
    });
    if (best < 0) extra.push(d); else { used.add(best); pairs.push([sheet[best], d]); }
  }
  const missing = sheet.filter((_, i) => !used.has(i));
  const radius = pairs.filter(([s, d]) => Math.abs(Math.min(s.r, s.h / 2) - Math.min(d.r, d.h / 2)) > 2);
  const colour = pairs.filter(([s, d]) => s.fill && d.fill && s.fill !== d.fill);
  return { pairs, extra, missing, radius, colour };
}

const at = (b) => `${Math.round(b.w)}×${Math.round(b.h)}@${Math.round(b.x)},${Math.round(b.y)} r${Math.round(Math.min(b.r, b.h / 2))}`;

// The entry screens, each reached the way a person reaches it, in the state the sheet draws
// (register-1: «Anya», 28, the consent ticked — so «next» is live, as on the sheet).
const named = async (p) => {
  await p.getByTestId("start").click(); await p.locator('[data-screen="register-1"]').waitFor();
  await p.getByTestId("name").fill("Anya"); await p.getByTestId("age").fill("28");
  await p.locator('[data-screen="register-1"] input[type=checkbox]').first().check();
};
// The content screens' people stand on a spot of their own (the wizard's place step takes a point), far
// from any earlier run's, so the stand's leftovers (phrases, tables) do not enter the screen.
const spotOf = () => { const t = Date.now() / 1000; return `${(-40 + (t % 7919) / 100).toFixed(4)}, ${(-170 + (t % 33997) / 100).toFixed(4)}`; };
// Signed up on this page (Anya unless named), the wizard walked to its place step and closed there.
const signed = async (p, who = "Anya", spot = null) => {
  await p.getByTestId("start").click(); await p.locator('[data-screen="register-1"]').waitFor();
  await p.getByTestId("name").fill(who); await p.getByTestId("age").fill(who === "Anya" ? "28" : "31");
  await p.locator('[data-screen="register-1"] input[type=checkbox]').first().check();
  await p.getByTestId("next").click(); await p.locator('[data-screen="register-2"]').waitFor();
  await p.getByTestId("pin").fill(PIN); await p.getByTestId("pin-again").fill(PIN); await p.getByTestId("register").click();
  await p.locator('[data-screen="register-3"]').waitFor({ timeout: 30000 });
  const code = (await p.getByTestId("paper-code").textContent()).trim().split(/\s+/);
  await p.getByTestId("paper-groups").locator("input").first().fill(code[1]);
  await p.getByTestId("paper-groups").locator("input").last().fill(code[3]);
  await p.getByTestId("confirm").click(); await p.getByTestId("wizard-1").waitFor({ timeout: 30000 });
  if (spot) {
    for (let i = 0; i < 4; i++) await p.getByTestId("wizard-next").click();
    await p.getByTestId("place-point").fill(spot); await p.getByTestId("place-use").click();
    await p.waitForFunction(() => document.querySelector('[data-testid="place-now"]')?.textContent?.length > 0, null, { timeout: 15000 });
    await p.getByTestId("wizard-start").click();
  } else await p.getByTestId("wizard-skip").click();
  await p.locator('[data-screen="feed"]').waitFor({ timeout: 30000 });
  await p.getByTestId("loading").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
};
const refeed = async (p) => {
  await p.getByTestId("nav-inbox").click(); await p.getByTestId("nav-feed").click();
  await p.locator('[data-screen="feed"]').waitFor(); await p.getByTestId("card").first().waitFor({ timeout: 30000 });
};
// Back on the feed the way a returning person is: the page opened again, the PIN.
const home = async (p) => {
  await p.goto(BASE + "/"); await p.locator('[data-screen="unlock"]').waitFor({ timeout: 15000 });
  await p.getByTestId("unlock-pin").fill(PIN); await p.getByTestId("unlock").click();
  await p.locator('[data-screen="feed"]').waitFor({ timeout: 30000 });
  await p.getByTestId("loading").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
};
// A phrase through the composer; an offer when a discount is given (a neighbour's offer, its conditions).
const write = async (p, text, offer = null, mode = null) => {
  await p.getByTestId("write").click(); await p.locator('[data-screen="composer"]').waitFor();
  await p.getByTestId("text").fill(text);
  if (mode) await p.getByTestId(`mode-${mode}`).click();
  if (offer) {
    await p.getByTestId("offer-fields").locator("summary").click();
    await p.getByTestId("discount").fill(offer.discount); await p.getByTestId("conditions").fill(offer.conditions);
  }
  await p.getByTestId("send").click();
  await p.locator('[data-testid="sent"][data-state="published"]').waitFor({ timeout: 15000 });
  await home(p);
};
const like = async (p) => {
  if (BRAND === "neighbro") { await p.getByTestId("heart").click(); await p.getByTestId("heart-target").click(); } else await p.getByTestId("like").click();
};
// Another person on a context of their own, from an address of their own.
let nextIp = 0;
const other = async (p) => {
  const ctx = await p.context().browser().newContext({ viewport: { width: 393, height: 851 }, locale: "en-US",
    extraHTTPHeaders: { "x-origin-token": "web-test-origin-token", "x-client-ip": `198.51.100.${(Math.floor(Date.now() / 1000) + 13 * nextIp++) % 250 + 1}` } });
  await ctx.addInitScript(() => { try { localStorage.setItem("lang-asked", "1"); } catch { /* storage blocked */ } });
  const q = await ctx.newPage(); await q.goto(BASE + "/"); return q;
};
// The feed sheet's six, newest first: the river, the coffee, the chess, the bakery's offer, the yard, the handyman.
const SIX_ = [
  { text: "walking to the river, join?" }, { text: "coffee at the corner bakery", mode: "company" }, { text: "looking for a chess partner", mode: "party" },
  { text: "Corner bakery: coffee and a croissant", offer: { discount: "15%", conditions: "till 11:00" } },
  { text: "yard: music tonight", mode: "company" }, { text: "anyone know a good handyman", mode: "party" },
];
// neighbro's sheet draws three: the river, the coffee, the bakery's offer.
const SIX = BRAND === "neighbro" ? [SIX_[0], SIX_[1], SIX_[3]] : SIX_;
// Neighbours on the spot, each writes one of `phrases` (the last first, so the first is the newest).
const neighbours = async (p, spot, phrases) => {
  const run = Date.now().toString(36).slice(-4), out = [];
  for (const ph of [...phrases].reverse()) {
    const q = await other(p); await signed(q, "Boris", spot);
    const t = `${ph.text} ${run}`;
    await write(q, t, ph.offer, ph.mode); out.unshift(t); await q.context().close();
  }
  return out;
};
// A neighbour `name` on Anya's spot writes, likes Anya's phrase `aT`; Anya likes back: a match. Returns the neighbour's page.
const pairUp = async (p, spot, aT, name) => {
  const run = Date.now().toString(36).slice(-4);
  const q = await other(p); await signed(q, name, spot); const bT = `walking to the river ${name} ${run}`; await write(q, bT);
  await refeed(q); await q.getByTestId("card").filter({ hasText: aT }).click(); await like(q);
  await q.getByTestId("liked").waitFor({ timeout: 30000 });
  await refeed(p); await p.getByTestId("card").filter({ hasText: bT }).click(); await like(p);
  await p.getByTestId("matched").waitFor({ timeout: 30000 }); await home(p);
  return q;
};
const openMatch = async (p, name) => {
  await p.getByTestId("nav-inbox").click();
  await p.getByTestId("match").filter({ hasText: name }).getByTestId("open-match").click({ timeout: 30000 }); await p.locator('[data-screen="match"]').waitFor();
};
// Anya signed up on a spot of her own with a phrase; Boris matched with her; Anya's inbox. With `chats`, before
// Boris these neighbours matched with her and both pressed «talk», so their conversations are open.
const matched = async (p, chats = []) => {
  const spot = spotOf(), aT = `see you at the bridge ${Date.now().toString(36).slice(-4)}`;
  await signed(p, "Anya", spot); await write(p, aT);
  for (const name of chats) {
    const q = await pairUp(p, spot, aT, name);
    await openMatch(p, name); await p.getByTestId("talk").click();
    await p.locator('[data-screen="match"][data-waiting="yes"]').waitFor({ timeout: 30000 }); await home(p);
    await home(q); await openMatch(q, "Anya"); await q.getByTestId("talk").click();
    await q.locator('[data-screen="match"]').waitFor({ state: "detached", timeout: 30000 });
    await q.context().close();
  }
  const q = await pairUp(p, spot, aT, "Boris"); await q.context().close();
  await p.getByTestId("nav-inbox").click(); await p.getByTestId("match").filter({ hasText: "Boris" }).waitFor({ timeout: 30000 });
  if (chats.length) await p.getByTestId("chat").nth(chats.length - 1).waitFor({ timeout: 30000 });
};
const SCREENS = {
  // The language list: a device not yet asked (every other screen is reached on an asked one).
  "splash-lang": { w: 393, fresh: true, go: async (p) => { await p.getByTestId("lang").waitFor(); } },
  "splash-393": { w: 393, go: async () => {} },
  "splash-768": { w: 768, go: async () => {} },
  "splash-1440": { w: 1440, go: async () => {} },
  "register-1": { w: 393, go: named },
  "register-1440": { w: 1440, go: named },
  "register-2": { w: 393, go: async (p) => {
    await named(p); await p.getByTestId("next").click(); await p.locator('[data-screen="register-2"]').waitFor();
    await p.getByTestId("pin").fill("483920"); await p.getByTestId("pin-again").fill("483920");
  } },
  "register-3": { w: 393, go: async (p) => {
    await named(p); await p.getByTestId("next").click(); await p.locator('[data-screen="register-2"]').waitFor();
    await p.getByTestId("pin").fill("483920"); await p.getByTestId("pin-again").fill("483920"); await p.getByTestId("register").click();
    await p.locator('[data-screen="register-3"]').waitFor({ timeout: 30000 });
  } },
  // A person who signed up and opens the page again meets the PIN (the wizard is left at its first step).
  "unlock": { w: 393, go: async (p) => {
    await SCREENS["register-3"].go(p);
    const code = (await p.getByTestId("paper-code").textContent()).trim().split(/\s+/);
    await p.getByTestId("paper-groups").locator("input").first().fill(code[1]);
    await p.getByTestId("paper-groups").locator("input").last().fill(code[3]);
    await p.getByTestId("confirm").click(); await p.locator('[data-testid="wizard-1"]').waitFor({ timeout: 30000 });
    await p.reload(); await p.locator('[data-screen="unlock"]').waitFor({ timeout: 15000 });
  } },
  // «me» (sheet adaptive-*-me-393): signed up, the wizard skipped, the me tab opened.
  "me-393": { w: 393, go: async (p) => {
    await SCREENS["register-3"].go(p);
    const code = (await p.getByTestId("paper-code").textContent()).trim().split(/\s+/);
    await p.getByTestId("paper-groups").locator("input").first().fill(code[1]);
    await p.getByTestId("paper-groups").locator("input").last().fill(code[3]);
    await p.getByTestId("confirm").click(); await p.getByTestId("wizard-skip").click({ timeout: 30000 });
    await p.getByTestId("tab-me").click({ timeout: 30000 });
    await p.locator('[data-screen="me"] [data-testid="me-name"]').waitFor({ timeout: 15000 });
    await p.waitForFunction(() => !document.querySelector('[data-testid="me-name"]')?.textContent?.includes("…"), null, { timeout: 15000 });
  } },
  "restore": { w: 393, go: async (p) => { await p.getByTestId("restore").click(); await p.locator('[data-screen="restore"]').waitFor(); } },
  // The identity arriving from another device (sheet adaptive-*-arrival): «back» in the foot's Split (owner 12.10).
  "arrival": { w: 393, go: async (p) => { await p.getByTestId("arrive").click(); await p.locator('[data-screen="arrival"]').waitFor(); } },
  // The phone screens past the entry (sheets adaptive-*-<screen>-393), each in the state its sheet draws.
  "feed-393": { w: 393, go: async (p) => { const spot = spotOf(); await neighbours(p, spot, SIX); await signed(p, "Anya", spot); await refeed(p); } },
  "card-393": { w: 393, go: async (p) => {
    const spot = spotOf(); const [t] = await neighbours(p, spot, [{ text: "walking to the river, who's with me? we start at the bridge", mode: "company" }]);
    await signed(p, "Anya", spot); await refeed(p);
    await p.getByTestId("card").filter({ hasText: t }).click({ timeout: 30000 }); await p.locator('[data-screen="card"]').waitFor();
  } },
  // The composer as drawn: «with friends» and the first step of the second row chosen, nothing typed.
  "composer-393": { w: 393, go: async (p) => {
    await signed(p, "Anya", spotOf()); await p.getByTestId("write").click(); await p.locator('[data-screen="composer"]').waitFor();
    await p.getByTestId("mode-company").click(); await p.getByTestId("zone").getByRole("radio").first().click();
  } },
  // «match»: opened from Anya's inbox after the mutual like.
  "match-393": { w: 393, go: async (p) => { await matched(p); await p.getByTestId("match").filter({ hasText: "Boris" }).getByTestId("open-match").click(); await p.locator('[data-screen="match"]').waitFor(); } },
  // «talks»: Boris's offer to talk and three open conversations.
  "inbox-393": { w: 393, go: async (p) => { await matched(p, ["Lena", "Mark", "Olga"]); } },
  // Three neighbours' tables on the spot, the tables tab opened.
  "tables-393": { w: 393, go: async (p) => {
    const spot = spotOf();
    for (const name of ["dots 3×3 by the park", "quick dots", "yard league"]) {
      const q = await other(p); await signed(q, "Boris", spot);
      await q.getByTestId("nav-tables").click(); await q.getByTestId("new-table").click(); await q.locator('[data-screen="new-table"]').waitFor();
      await q.getByTestId("new-table-game-dots").click(); await q.getByTestId("new-table-name").fill(name);
      await q.getByTestId("new-table-next").click(); await q.getByTestId("new-table-go").click(); await q.getByTestId("table").waitFor({ timeout: 30000 });
      await q.context().close();
    }
    await signed(p, "Anya", spot);
    await p.getByTestId("nav-tables").click(); await p.locator('[data-screen="tables"]').waitFor();
    await p.getByTestId("table-card").nth(2).waitFor({ timeout: 30000 });
  } },
  // The new table's wizard (sheets adaptive-*-new-table-{game,variant,preview}-393): step 1 the twelve games;
  // step 2 durak picked, four seats, «by the park» typed; step 3 the table as neighbours will see it.
  "new-table-game-393": { w: 393, go: newTableAt },
  "new-table-variant-393": { w: 393, go: async (p) => {
    await newTableAt(p); await p.getByTestId("new-table-game-durak").click();
    await p.getByTestId("new-table-seats-4").click(); await p.getByTestId("new-table-name").fill("by the park");
  } },
  "new-table-preview-393": { w: 393, go: async (p) => {
    await SCREENS["new-table-variant-393"].go(p); await p.getByTestId("new-table-next").click();
    await p.getByTestId("new-table-preview").waitFor();
  } },
  // A dots game under way between Anya and Boris (sheet adaptive-*-table-393).
  "table-393": { w: 393, go: async (p) => { await (await atTable(p)).context().close(); } },
  // Boris taps a sticker; Anya's «say» is open, the strip of eight under the board (sheet adaptive-*-table-sticker-393).
  "table-sticker-393": { w: 393, go: async (p) => {
    const q = await atTable(p);
    await q.getByTestId("table-say").click(); await q.getByTestId("sticker-hi").click();
    await p.getByTestId("table-say").click(); await p.getByTestId("stickers").waitFor();
    await p.locator('[data-testid="landed"]').waitFor({ timeout: 15000 }); await q.context().close();
  } },
  // A conversation: Boris's line, Anya's answer (sheet adaptive-*-chat-393).
  "chat-393": { w: 393, go: async (p) => { await (await talking(p, ["hi! at the river already?", "on my way, five minutes"])).context().close(); } },
  // A third line, the sticker plate up (sheet adaptive-*-chat-stickers-393).
  "chat-stickers-393": { w: 393, go: async (p) => {
    const q = await talking(p, ["hi! at the river already?", "on my way, five minutes", "I'm by the bridge with a dog"]);
    await p.getByTestId("stickers-key").click(); await p.getByTestId("sticker-plate").waitFor(); await q.context().close();
  } },
  // Anya's «deal» sent from the plate, the plate put away, Boris's «coffee?» back (sheet adaptive-*-chat-sticker-sent-393).
  "chat-sticker-sent-393": { w: 393, go: async (p) => {
    const q = await talking(p, ["hi! at the river already?", "on my way, five minutes"]);
    await p.getByTestId("stickers-key").click(); await p.getByTestId("chat-sticker-deal").click();
    await p.locator('[data-testid="mine"][data-state="sent"]').nth(1).waitFor({ timeout: 20000 });
    await p.getByTestId("stickers-key").click();
    await q.getByTestId("stickers-key").click(); await q.getByTestId("chat-sticker-coffee").click();
    await p.getByTestId("theirs").nth(1).waitFor({ timeout: 20000 }); await q.context().close();
  } },
};
// Anya signed up on a spot of her own, the tables tab, «new table»: the wizard's first step.
async function newTableAt(p) {
  await signed(p, "Anya", spotOf()); await p.getByTestId("nav-tables").click(); await p.getByTestId("new-table").click();
  await p.locator('[data-screen="new-table"]').waitFor();
}
// Anya sets a dots table on her spot; Boris sits by its card and applies; Anya starts the game. Returns Boris's page.
async function atTable(p) {
  const spot = spotOf();
  await signed(p, "Anya", spot); await p.getByTestId("nav-tables").click(); await p.getByTestId("new-table").click();
  await p.getByTestId("new-table-game-dots").click(); await p.getByTestId("new-table-name").fill("by the park");
  await p.getByTestId("new-table-next").click(); await p.getByTestId("new-table-go").click(); await p.getByTestId("table").waitFor({ timeout: 30000 });
  const q = await other(p); await signed(q, "Boris", spot);
  await q.getByTestId("nav-tables").click(); await q.getByTestId("table-card").first().click({ timeout: 30000 }); await q.getByTestId("table").waitFor({ timeout: 30000 });
  await q.getByTestId("line-input").fill("I'll play"); await q.getByTestId("apply").click();
  await p.getByTestId("application").waitFor({ timeout: 15000 }); await p.getByTestId("start-game").click();
  await p.getByTestId("start-game").waitFor({ state: "detached", timeout: 15000 }); await p.getByTestId("dots").waitFor();
  return q;
}
// Anya and Boris matched and both agreed to talk; each in the conversation, the lines said in turn
// (Boris first; Anya's page measured). Returns Boris's page.
async function talking(p, said) {
  const spot = spotOf(), aT = `see you at the bridge ${Date.now().toString(36).slice(-4)}`;
  await signed(p, "Anya", spot); await write(p, aT);
  const q = await pairUp(p, spot, aT, "Boris");
  await openMatch(p, "Boris"); await p.getByTestId("talk").click();
  // The consent's keys live in the page that gave it: no reload after «talk» (chat.spec.ts walks the same).
  await p.locator('[data-screen="match"][data-waiting="yes"]').waitFor({ timeout: 30000 }); await p.getByTestId("to-inbox").click();
  await home(q); await openMatch(q, "Anya"); await q.getByTestId("talk").click();
  await q.locator('[data-screen="match"]').waitFor({ state: "detached", timeout: 30000 });
  for (const r of [p, q]) {
    // The inbox reads again when it opens (Anya is on it already, waiting since «talk»): leave it and come back.
    await r.getByTestId("nav-feed").click(); await r.getByTestId("nav-inbox").click(); await r.locator('[data-testid="chat"] [data-testid="open-chat"]').first().click({ timeout: 30000 });
    await r.locator('[data-screen="chat"]').waitFor({ timeout: 30000 });
    await r.locator('[data-screen="chat"][data-keys="open"]').waitFor({ timeout: 30000 }).catch(async (e) => { throw new Error(`keys ${await r.locator('[data-screen="chat"]').getAttribute("data-keys")} ${e}`); });
  }
  for (const [i, text] of said.entries()) {
    const [from, to] = i % 2 ? [p, q] : [q, p];
    await from.getByTestId("text").fill(text); await from.getByTestId("send").click();
    await to.locator('[data-testid="theirs"]', { hasText: text }).waitFor({ timeout: 20000 });
  }
  return q;
}

const browser = await chromium.launch();
let defects = 0;
for (const [name, sc] of Object.entries(SCREENS)) {
  if (only.length && !only.includes(name)) continue;
  const sheet = sheetBoxes(name);
  // Each screen signs up from an address of its own (documentation space, RFC 5737), as the e2e fixture does
  // (web/e2e/fixtures/address.ts): the stand's node counts ten sign-ups an hour per address, and a run makes four.
  const address = `203.0.113.${(Math.floor(Date.now() / 1000) + Object.keys(SCREENS).indexOf(name) * 7) % 250 + 1}`;
  const ctx = await browser.newContext({
    viewport: { width: sheet.W, height: sheet.H }, locale: "en-US", colorScheme: "light",
    extraHTTPHeaders: { "x-origin-token": "web-test-origin-token", "x-client-ip": address },
  });
  if (!sc.fresh) await ctx.addInitScript(() => { try { localStorage.setItem("lang-asked", "1"); } catch { /* storage blocked */ } });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + "/"); await p.waitForTimeout(400);
    await sc.go(p); await p.waitForTimeout(600);
  } catch (e) {
    console.log(`${BRAND} ${name}: НЕ ДОШЁЛ — ${String(e).split("\n")[0].slice(0, 160)} ${(String(e).match(/waiting for [^\n]*/) ?? [""])[0].slice(0, 160)}`); defects++; await ctx.close(); continue;
  }
  // A primary the sheet draws live but the stand holds back: say why, the stand's own words.
  const held = await p.locator('[data-part="foot"] .ui-reason').allInnerTexts().catch(() => []);
  if (held.length) console.log(`  кнопка закрыта: ${held.join(" / ").slice(0, 120)}`);
  const r = pair(sheet.boxes, await standBoxes(p));
  const n = r.extra.length + r.missing.length + r.radius.length;
  defects += n;
  console.log(`${BRAND} ${name} @${sheet.W}: пар ${r.pairs.length}, лишних ${r.extra.length}, нет на стенде ${r.missing.length}, радиус ${r.radius.length}, цвет ${r.colour.length}`);
  for (const d of r.extra) console.log(`  лишнее  ${d.id} ${at(d)} ${d.fill ?? ""}`);
  for (const s of r.missing) console.log(`  нет     ${s.tag} ${at(s)} ${s.fill ?? ""}`);
  for (const [s, d] of r.radius) console.log(`  радиус  ${d.id} стенд r${Math.round(Math.min(d.r, d.h / 2))} лист r${Math.round(Math.min(s.r, s.h / 2))} ${at(d)}`);
  for (const [s, d] of r.colour) console.log(`  цвет    ${d.id} стенд ${d.fill} лист ${s.fill}`);
  await ctx.close();
}
await browser.close();
console.log(`ИТОГ ${BRAND}: дефектов ${defects}`);
process.exit(defects ? 1 : 0);
