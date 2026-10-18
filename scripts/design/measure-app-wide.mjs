// The tablet (834) and desktop (1440) sheets of the feed, the phrase card, "Me", the talks, the composer and the tables, against the rendered app/: the third part of
// measure-app.mjs, run by `WIDE=1 scripts/measure-app.sh` (the viewport is the sheet's width: 834 x 1194, 1440 x 900).
//   tablet/tablet_834_{Feed,Phrase,Me}.svg, desktop/desktop_1440_{Feed,Phrase,Me}.svg
//
// As measure-app.mjs: the expected numbers are read off the sheets (sheet-geometry.mjs), never typed in; a box is compared as
// left/top/width/height within TOL px, a text line as its left edge and baseline. What the sheets draw and this shell does not
// is NOT compared (listed at the end of the run as "not compared"): the right pane (Talks, a chat), the quota card, the chips'
// counts, a phrase's distance and time (the node does not send them), the search icon, the unread dot, the thread "Beside it",
// "Reply beside", the density line, the offer and table tiles as drawn. Where the app's tile is shorter than the sheet's for that
// reason, the tile's height is information, and what hangs from the tile's top or bottom is compared against that edge.
import { readSheet } from "./sheet-geometry.mjs";

export async function wideSheets(h) {
  const { browser, SHEETS, PREVIEW, compare, boxOf, linesOf, open, settle, overflowAt, notes, nodeStub, registerFull, NAN4, GEOMETRY, SHOTS } = h;
  const sheet = (dir, name) => readSheet(`${SHEETS}/${dir}/${name}.svg`);
  const one = async (page, sel) => (await boxOf(page, sel))[0] ?? NAN4;
  // Text lines as INK: linesOf (measure-app.mjs) gives the advance box, whose left edge sits a glyph's side bearing before the ink the
  // sheets measure (that is what its 2 px of tolerance are for). Here each line's first and last glyph are measured for their own
  // bearing (canvas actualBoundingBox), so a big title is compared ink to ink and not 2.03 px apart for nothing. Baseline as linesOf.
  const inkLines = (page, sel) => page.evaluate((q) => {
    const el = document.querySelector(q); if (!el) return [];
    const ctx = document.createElement("canvas").getContext("2d"), byLine = new Map();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const cs = getComputedStyle(n.parentElement);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText("Hg"), text = n.textContent;
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue;
        const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getClientRects()[0]; if (!r || !r.width) continue;
        const base = r.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent, key = Math.round(base);
        const g = ctx.measureText(text[i]), left = r.left - g.actualBoundingBoxLeft, right = r.left + g.actualBoundingBoxRight, L = byLine.get(key);
        if (L) { L.left = Math.min(L.left, left); L.right = Math.max(L.right, right); } else byLine.set(key, { left, right, base });
      }
    }
    return [...byLine.values()].sort((a, b) => a.base - b.base).map((l) => [l.left, l.right, l.base]);
  }, sel);
  const line = async (page, sel, i = 0) => (await inkLines(page, sel))[i];
  const textAt = (scr, name, exp, act) => compare(scr, name, [exp.left, exp.base], act ? [act[0], act[2]] : [NaN, NaN]);
  // a line hanging from an element's top: its baseline is measured from that edge
  const textUnder = (scr, name, exp, act, expTop, actTop) => compare(scr, name, [exp.left, exp.base - expTop], act ? [act[0], act[2] - actTop] : [NaN, NaN]);
  const shape = (S, i) => S.shapes[i];
  const abs = (s) => [s.x, s.y, s.w, s.h];
  const info = (text) => notes.push({ bad: false, text });

  // The phrases of the sheets (English words, as drawn); the offer stands where the sheet draws its offer tile, a phrase where it draws a table.
  const P = {
    bg: { id: "w-bg", text: "Backgammon in the yard tonight?", mode: "company", lang: "en", like_count: 12, liked: true },
    ladder: { id: "w-ladder", text: "Who has a ladder? The persimmons are ripe.", mode: "alone", lang: "en", like_count: 4 },
    offer: { id: "w-offer", kind: "offer", text: "On the second dozen", mode: "alone", lang: "en", like_count: 3, offer: { discount_value: "20%", conditions: null, venue_name: "Khinkali Bar" } },
    chess: { id: "w-chess", text: "Chess in the park on Sunday?", mode: "alone", lang: "en", like_count: 3 },
    cat: { id: "w-cat", text: "Lost a grey cat near the bakery — Barsik", mode: "alone", lang: "en", like_count: 1 },
    choir: { id: "w-choir", text: "Choir on Thursday, flat 12. Any voice!", mode: "party", lang: "en", like_count: 9 },
    power: { id: "w-power", text: "Power out on Asatiani again?", mode: "alone", lang: "en", like_count: 2 },
  };
  // the sheets' feed order (a tile goes to the columns by turns): tablet L: bg, offer, cat, power  R: ladder, table, choir; desktop L: bg, offer, table, power  R: ladder, cat, choir
  const ORDER = { tablet: ["bg", "ladder", "offer", "chess", "cat", "choir", "power"], desktop: ["bg", "ladder", "offer", "cat", "chess", "choir", "power"] };

  async function sit(kind, w, scr) {
    const stub = nodeStub();
    stub.feed.items = ORDER[kind].map((k) => P[k]);
    Object.assign(stub.profile, { name: "Alex", age: 32 });
    const prepare = async (ctx, page) => {
      await stub.prepare(ctx, page);
      await ctx.addInitScript(() => { try { localStorage.setItem("place.v1", JSON.stringify({ lat: 41.69, lon: 44.8, name: "Sololaki" })); } catch {} });
    };
    const o = await open(browser, PREVIEW + "/", w, { screen: scr, prepare });
    await registerFull(o.page);
    await o.page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
    await settle(o.page);
    return o;
  }

  // the rail (desktop): the brand, the four tabs with their words, «say something»; `active` is the lit tab's place (1 feed .. 4 me)
  async function rail(scr, page, S, scope, p) {
    const T = S.lines;
    compare(scr, "rail active tab", abs(shape(S, p.active)), await one(page, `${scope} .tab[aria-current="page"]`));
    compare(scr, "rail say something", abs(shape(S, p.say)), await one(page, `${scope} .rail-say`));
    textAt(scr, "rail brand", T[0], await line(page, `${scope} .rail-brand`));
    for (let k = 0; k < 4; k++) textAt(scr, `rail tab ${k + 1} word`, T[1 + k], await line(page, `${scope} .tab:nth-of-type(${k + 1}) .tab-word`));
    textAt(scr, "rail say something word", T[5], await line(page, `${scope} .rail-say span`));
  }
  // the bar (tablet): the bar and the lit tab
  async function bar(scr, page, S, p, scope) {
    compare(scr, "tab bar", abs(shape(S, p.bar)), await one(page, `${scope} .tabbar`));
    compare(scr, "tab bar, the lit tab", abs(shape(S, p.tab)), await one(page, `${scope} .tab[aria-current="page"]`));
  }
  // a tile's insides, for the tile with the sheet's first phrase: the hand from the top, the foot and its word from the bottom, the lines from the top
  async function tileInside(scr, page, S, p, sel, kind) {
    const tile = shape(S, p.tile), box = await one(page, sel);
    compare(scr, "tile 1 hand", abs(shape(S, p.hand)), await one(page, `${sel} .fd-hand`));
    const foot = shape(S, p.foot), fa = await one(page, `${sel} .fd-foot`);
    compare(scr, "tile 1 foot (left, gap to the tile's bottom, width, height)", [foot.x, tile.y + tile.h - (foot.y + foot.h), foot.w, foot.h], [fa[0], box[1] + box[3] - (fa[1] + fa[3]), fa[2], fa[3]]);
    const chip = shape(S, p.chip), ca = await one(page, `${sel} .fd-mode`);
    compare(scr, "tile 1 mode chip (left, gap to the foot's bottom, width, height)", [chip.x, foot.y + foot.h - (chip.y + chip.h), chip.w, chip.h], [ca[0], fa[1] + fa[3] - (ca[1] + ca[3]), ca[2], ca[3]]);
    const lines = await inkLines(page, `${sel} ${kind}`);
    p.title.forEach((li, k) => textUnder(scr, `tile 1 title line ${k + 1}`, S.lines[li], lines[k], tile.y, box[1]));
    return box;
  }

  // ── the feed ──
  async function feed(kind, w, dir, file, p) {
    const scr = `${kind}-feed`, S = sheet(dir, file), ids = ORDER[kind].map((k) => P[k].id);
    const o = await sit(kind, w, "walk-wide-" + scr);
    const page = o.page, T = S.lines;
    const tiles = p.tiles.map((i) => shape(S, i));
    const boxes = [];
    for (const id of ids) boxes.push(await one(page, `[data-testid="cards"] [data-id="${id}"]`));
    tiles.forEach((t, k) => {
      const b = boxes[k];
      compare(scr, `tile ${k + 1} left, width`, [t.x, t.w], [b[0], b[2]]);
      let prev = -1;
      for (let j = 0; j < k; j++) if (Math.abs(tiles[j].x - t.x) < 1) prev = j;
      if (prev < 0) compare(scr, `tile ${k + 1} top`, [t.y], [b[1]]);
      else compare(scr, `tile ${k + 1} gap under tile ${prev + 1}`, [t.y - (tiles[prev].y + tiles[prev].h)], [b[1] - (boxes[prev][1] + boxes[prev][3])]);
    });
    const box1 = await tileInside(scr, page, S, p, `[data-testid="cards"] [data-id="${ids[0]}"]`, ".fd-open");
    info(`${scr}: tile 1 is ${tiles[0].h.toFixed(1)} px high on the sheet, ${box1[3].toFixed(1)} px in the app: the sheet's distance and time line (not sent by the node) is not drawn`);
    if (kind === "tablet") {
      compare(scr, "list (the lighter sheet under the head)", abs(shape(S, p.list)), await one(page, ".fd-list"));
      textAt(scr, "brand word", T[0], await line(page, ".fd-brand"));
      textAt(scr, "title line 1", T[1], await line(page, ".fd-head h1", 0));
      textAt(scr, "title line 2", T[2], await line(page, ".fd-head h1", 1));
      // the chips: five circles at the sheet's pitch, the first of the sheet's six (the dashed «say it») is not in this shell
      const c = (i) => (T[i].left + T[i].right) / 2, pitch = (c(12) - c(4)) / 4, ring = shape(S, 1);
      const chips = await boxOf(page, ".fd-chip");
      for (let k = 0; k < 5; k++) compare(scr, `radius chip ${k + 1}`, [ring.x + pitch * (k + 1), ring.y, ring.w, ring.h], chips[k] ?? NAN4);
      await bar(scr, page, S, { bar: 31, tab: 32 }, '[data-screen="feed"]');
    } else {
      compare(scr, "panel", abs(shape(S, p.panel)), await one(page, ".fd-feed .fd-panel"));
      // the sheet's title is «Nearby» (the place is in a line over it, not in this shell), the app's «Sololaki, nearby»: another first glyph, so only the baseline is compared
      compare(scr, "title (baseline; the first glyph is another word's)", [T[9].base], [(await line(page, ".fd-head h1"))?.[2] ?? NaN]);
      const chips = await boxOf(page, ".fd-chip");
      for (let k = 0; k < 5; k++) compare(scr, `radius pill ${k + 1}`, abs(shape(S, 7 + k)), chips[k] ?? NAN4);
      await rail(scr, page, S, '[data-screen="feed"] .tabbar', { active: 2, say: 4 });
    }
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
    // the phrase card from the first tile
    await page.click(`[data-id="${ids[0]}"] .fd-open`);
    await page.waitForSelector('[data-screen="card"]'); await settle(page);
    await phrase(kind, w, dir, page, file.replace("Feed", "Phrase"));
    await o.ctx.close();
  }

  // ── the phrase card ──
  async function phrase(kind, w, dir, page, file) {
    const scr = `${kind}-phrase`, S = sheet(dir, file), T = S.lines, card = '[data-screen="card"]';
    const big = shape(S, kind === "tablet" ? 2 : 7), bigBox = await one(page, `${card} .fd-big`);
    compare(scr, "card", [big.x, big.y, big.w], [bigBox[0], bigBox[1], bigBox[2]]);
    const p = kind === "tablet" ? { tile: 2, hand: 3, foot: 4, chip: 5, title: [0, 1] } : { tile: 7, hand: 8, foot: 9, chip: 10, title: [11, 12, 13] };
    await tileInside(scr, page, S, p, `${card} .fd-big`, ".fd-text");
    const like = shape(S, kind === "tablet" ? 6 : 11), lb = await one(page, `${card} [data-testid="like"]`);
    compare(scr, "«I'm in» (left, gap under the card, width, height)", [like.x, like.y - (big.y + big.h), like.w, like.h], [lb[0], lb[1] - (bigBox[1] + bigBox[3]), lb[2], lb[3]]);
    textUnder(scr, "«I'm in» word (left, baseline from the button's top)", T[kind === "tablet" ? 5 : 16], await line(page, `${card} [data-testid="like"] span`), like.y, lb[1]);
    if (kind === "tablet") {
      compare(scr, "sheet under the bar", abs(shape(S, 1)), await one(page, `${card} .fd-body`));
      const more = await boxOf(page, `${card} [data-testid="card-near"]`);
      textAt(scr, "«more nearby»", T[15], await line(page, `${card} .fd-more h2`));
      const hb = (await line(page, `${card} .fd-more h2`)) ?? [NaN, NaN, NaN];
      [16, 20].forEach((si, k) => {
        const t = shape(S, si);
        compare(scr, `near tile ${k + 1} (left, width, top under the heading's baseline)`, [t.x, t.w, t.y - T[15].base], more[k] ? [more[k][0], more[k][2], more[k][1] - hb[2]] : [NaN, NaN, NaN]);
      });
    } else {
      compare(scr, "panel", abs(shape(S, 6)), await one(page, `${card} .fd-panel`));
      textAt(scr, "title", T[9], await line(page, `${card} .fd-bar h1`));
      await rail(scr, page, S, `${card} .tabbar`, { active: 2, say: 4 });
    }
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
  }

  // ── Me ──
  async function me(kind, w, dir, file) {
    const scr = `${kind}-me`, S = sheet(dir, file), T = S.lines, stub = nodeStub();
    Object.assign(stub.profile, { name: "Alex", age: 32 });
    const prepare = async (ctx, page) => {
      await stub.prepare(ctx, page);
      await ctx.addInitScript(() => { try { localStorage.setItem("place.v1", JSON.stringify({ lat: 41.69, lon: 44.8, name: "Sololaki" })); } catch {} });
    };
    const o = await open(browser, PREVIEW + "/", w, { screen: "walk-wide-" + scr, prepare });
    await registerFull(o.page);
    await o.page.click('[data-testid="tab-me"]'); await o.page.waitForSelector('[data-screen="me"] .me-hero');
    await o.page.locator('[data-testid="me-name-age"]', { hasText: "Alex" }).waitFor({ timeout: 10000 }).catch(() => null);
    await settle(o.page);
    const page = o.page, m = '[data-screen="me"]';
    const d = kind === "desktop";
    const hero = shape(S, d ? 7 : 1), ava = shape(S, d ? 8 : 2), edit = shape(S, d ? 9 : 3), rows0 = d ? 11 : 5;
    compare(scr, "name card", abs(hero), await one(page, `${m} .me-hero`));
    compare(scr, "avatar", abs(ava), await one(page, `${m} .me-avatar`));
    compare(scr, "edit button", abs(edit), await one(page, `${m} .me-edit`));
    const rows = await boxOf(page, `${m} .me-rows .me-row`);
    for (let k = 0; k < 9; k++) compare(scr, `row ${k + 1}`, abs(shape(S, rows0 + k)), rows[k] ?? NAN4);
    // the row names: the app's first seven rows (theme, language, age filter, PIN, new paper code, move, step away) against the sheet's first seven words
    const names = d ? [16, 18, 20, 22, 23, 24, 25] : [5, 7, 9, 11, 12, 13, 14];
    for (let k = 0; k < 7; k++) textAt(scr, `row ${k + 1} name`, T[names[k]], await line(page, `${m} .me-rows .me-row:nth-child(${k + 1}) .me-row-name`));
    textAt(scr, "name", T[d ? 11 : 2], await line(page, `${m} .me-who h1`));
    textAt(scr, "line under the name", T[d ? 12 : 3], await line(page, `${m} .me-who p`));
    if (d) {
      compare(scr, "panel", abs(shape(S, 6)), await one(page, ".me-panel"));
      textAt(scr, "title", T[9], await line(page, ".me-title-wide"));
      await rail(scr, page, S, `${m} .tabbar`, { active: 3, say: 4 });
      info(`${scr}: «Start again» is under the name card in the sheet, under the quota card (not in this shell): its place is not compared`);
    } else {
      textAt(scr, "brand word", T[0], await line(page, `${m} .me-head .word`));
      textAt(scr, "«Start again»", T[21], await line(page, `${m} .me-danger .me-row-name`));
      const sp = await page.evaluate(() => { const s = document.querySelector(".me-home"), r = s.getBoundingClientRect(), cs = getComputedStyle(s, "::before"); return [r.left, r.top + parseFloat(cs.top), r.width, parseFloat(cs.height)]; });
      compare(scr, "sheet under the name card", abs(shape(S, 4)), sp);
      await bar(scr, page, S, { bar: 15, tab: 16 }, m);
    }
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
    await o.ctx.close();
  }

  // ── the phrase for the feed (w3_composer's tablet and desktop sheets): from the feed's «say it» ──
  async function write(kind, w, dir, file, p) {
    const scr = `${kind}-write`, S = sheet(dir, file), T = S.lines;
    const o = await sit(kind, w, "walk-wide-" + scr);
    const page = o.page;
    await page.click('[data-testid="write"]'); await page.waitForSelector('[data-screen="composer"]'); await settle(page);
    await page.fill('[data-testid="text"]', "Backgammon in the yard tonight?"); await page.click('[data-testid="mode-company"]'); await settle(page);
    textAt(scr, "title", T[p.title], await line(page, ".cp-head h1"));
    if (p.sub !== undefined) textAt(scr, "line under the title", T[p.sub], await line(page, ".cp-head p:not(.cp-where)"));
    if (p.where !== undefined) textAt(scr, "the yard's line", T[p.where], await line(page, ".cp-where"));
    if (p.sheet !== undefined) compare(scr, "sheet left,top", [shape(S, p.sheet).x, shape(S, p.sheet).y], (await one(page, ".cp-sheet")).slice(0, 2));
    if (p.panel !== undefined) {
      const panel = await page.evaluate(() => { const m = document.querySelector(".cp"), r = m.getBoundingClientRect(), cs = getComputedStyle(m, "::before");
        return [r.left + parseFloat(cs.left), r.top + parseFloat(cs.top), parseFloat(cs.width), parseFloat(cs.height)]; });
      compare(scr, "panel", abs(shape(S, p.panel)), panel);
    }
    if (p.preview) {
      textAt(scr, "how neighbours will see it", T[p.preview.title], await line(page, ".cp-preview h2"));
      compare(scr, "preview tile", abs(shape(S, p.preview.tile)), await one(page, ".cp-preview-tile .fd-card"));
      textAt(scr, "preview words", T[p.preview.text], await line(page, ".cp-preview p"));
    }
    if (p.rail) await rail(scr, page, S, ".cp > .tabbar", p.rail);
    if (p.pane) {
      compare(scr, "talks pane", abs(shape(S, p.pane.box)), await one(page, ".tk-pane"));
      textAt(scr, "talks pane title", T[p.pane.title], await line(page, ".tk-pane h2"));
      const ava = await boxOf(page, ".tk-pane .tk-avatar");
      p.pane.avatars.forEach((s, k) => compare(scr, `talks pane avatar ${k + 1}`, abs(shape(S, s)), ava[k] ?? NAN4));
      for (let k = 0; k < p.pane.names.length; k++) textAt(scr, `talks pane name ${k + 1}`, T[p.pane.names[k]], await line(page, `.tk-pane .tk-rows li:nth-child(${k + 1}) .tk-name`));
    }
    compare(scr, "card", abs(shape(S, p.card)), await one(page, ".cp-card"));
    textAt(scr, "card label", T[p.label], await line(page, ".cp-card label"));
    textAt(scr, "lives", T[p.lives], await line(page, ".cp-card-foot span:first-child"));
    const left = await line(page, ".cp-card-foot span:last-child"), exp = T[p.lives + 1];
    compare(scr, "letters left (right edge, baseline)", [exp.right, exp.base], left ? [left[1], left[2]] : [NaN, NaN]);
    textAt(scr, "how you're going", T[p.going], await line(page, ".cp-sheet h2:nth-of-type(1)"));
    const modes = await boxOf(page, ".cp-mode");
    [0, 1, 2].forEach((k) => compare(scr, `mode ${k + 1}`, abs(shape(S, p.modes + k)), modes[k] ?? NAN4));
    textAt(scr, "who hears it", T[p.hears], await line(page, ".cp-sheet h2:nth-of-type(2)"));
    const zones = await boxOf(page, ".cp-zone");
    [0, 1, 2, 3, 4].forEach((k) => compare(scr, `zone ${k + 1}`, abs(shape(S, p.zones + k)), zones[k] ?? NAN4));
    compare(scr, "live phrases", abs(shape(S, p.live)), await one(page, ".cp-live"));
    compare(scr, "ring", abs(shape(S, p.ring)), await one(page, ".cp-ring"));
    textAt(scr, "ring words", T[p.ringWords], await line(page, ".cp-ring span"));
    textAt(scr, "live words", T[p.liveWords], await line(page, ".cp-live p"));
    compare(scr, "say it to the yard", abs(shape(S, p.send)), await one(page, ".cp-send"));
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
    await o.ctx.close();
  }

  // ── the talks with a talk beside the list (tablet_834_Talks): from the bar's «chats»; the talk's lines are not drawn
  //    here (no keys open them without a node), its frame is: the head, the divider, the chips, the field ──
  async function talks(kind, w, dir, file, p) {
    const scr = `${kind}-talks`, S = sheet(dir, file), T = S.lines;
    const o = await sit(kind, w, "walk-wide-" + scr);
    const page = o.page;
    await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-testid="chat-pane"]', { timeout: 20000 }); await settle(page);
    if (p.brand !== undefined) textAt(scr, "brand word", T[p.brand], await line(page, ".tk .me-head .word"));
    textAt(scr, "title", T[p.title], await line(page, ".tk-title"));
    compare(scr, "offers' circle", abs(shape(S, p.offers)), await one(page, ".tk-offers .tk-circle"));
    const faces = await boxOf(page, ".tk-strip .tk-face:not(.tk-offers) .tk-circle");
    p.faces.forEach((s, k) => compare(scr, `face ${k + 1}`, abs(shape(S, s)), faces[k] ?? NAN4));
    compare(scr, "sheet left,top", [shape(S, p.sheet).x, shape(S, p.sheet).y], (await one(page, ".tk-sheet")).slice(0, 2));
    compare(scr, "the open talk's row", abs(shape(S, p.selected)), await one(page, '.tk-row[aria-current="true"]'));
    const ava = await boxOf(page, ".tk-list .tk-avatar");
    p.avatars.forEach((s, k) => compare(scr, `row ${k + 1} avatar`, abs(shape(S, s)), ava[k] ?? NAN4));
    for (let k = 0; k < p.names.length; k++) textAt(scr, `row ${k + 1} name`, T[p.names[k]], await line(page, `.tk-list .tk-rows li:nth-child(${k + 1}) .tk-name`));
    const paneE = shape(S, p.pane), paneA = await one(page, '[data-testid="chat-pane"]');
    compare(scr, "the talk (left, top, width)", [paneE.x, paneE.y, paneE.w], paneA.slice(0, 3));
    if (p.bar) info(`${scr}: the talk ends above the bar (the sheet draws no bar and no other way out; the bar stays, xor-ad-0b 18.10): its height ${paneA[3].toFixed(1)} against the sheet's ${paneE.h.toFixed(1)}, the chips and the field are compared from its bottom`);
    // from the talk's bottom where the bar shortens it: the gap to the bottom, the left, the width, the height
    const fromBottom = (name, e, a) => compare(scr, name, [e.x, paneE.y + paneE.h - (e.y + e.h), e.w, e.h], [a[0], paneA[1] + paneA[3] - (a[1] + a[3]), a[2], a[3]]);
    compare(scr, "the talk's avatar", abs(shape(S, p.paneAvatar)), await one(page, ".ch-pane .ch-avatar"));
    textAt(scr, "the talk's name", T[p.paneName], await line(page, ".ch-pane .ch-who h1"));
    textAt(scr, "the talk's fade line", T[p.paneName + 1], await line(page, ".ch-pane .ch-line"));
    { const r = await one(page, ".ch-pane .ch-ring"), e = shape(S, p.ring); compare(scr, "the talk's ring (right, top, height)", [e.x + e.w, e.y, e.h], [r[0] + r[2], r[1], r[3]]); }
    { const d = shape(S, p.divider), b = await one(page, ".ch-pane .ch-sheet"); compare(scr, "the talk's divider (left, top, width)", [d.x, d.y, d.w], [b[0], b[1], b[2]]); }
    const chips = await boxOf(page, ".ch-pane .ch-chip");
    const at = p.bar ? fromBottom : (name, e, a) => compare(scr, name, abs(e), a);
    p.chips.forEach((s, k) => at(`chip ${k + 1}`, shape(S, s), chips[k] ?? NAN4));
    at("the field", shape(S, p.field), await one(page, ".ch-pane .ch-input"));
    at("send", shape(S, p.send), await one(page, ".ch-pane .ch-send"));
    info(`${scr}: the talk's lines are not compared (no keys open them on the stand); the rows' lines are the web's (waiting, over, my span), not the last line`);
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
    await o.ctx.close();
  }


  // ── the tables (tablet_834_Tables, desktop_1440_Tables): the list's «Playing now» as the sheets' five, «Start a game»'s six,
  // «New table»; GET /tables answered here over the stub (measure-app.mjs's has no tables) ──
  const TABLE_CARDS = [
    { id: "t1", game: "dice", set: "backgammon", playing: 2, free_seats: 0, watching: 3, like_count: 0 },
    { id: "t2", game: "deck", set: "36", playing: 3, free_seats: 1, watching: 1, like_count: 0 },
    { id: "t3", game: "grid", set: "chess", playing: 1, free_seats: 1, watching: 0, like_count: 0 },
    { id: "t4", game: "dots", set: "4x4", playing: 2, free_seats: 0, watching: 5, like_count: 0 },
    { id: "t5", game: "free", set: "double-six", playing: 2, free_seats: 2, watching: 2, like_count: 0 },
  ];
  async function tables(kind, w, dir, file, p) {
    const scr = `${kind}-tables`, S = sheet(dir, file), T = S.lines, stub = nodeStub();
    const prepare = async (ctx, page) => {
      await stub.prepare(ctx, page);
      await ctx.route(/\/tables(\?|$)/, (route) => route.request().resourceType() === "fetch" || route.request().resourceType() === "xhr"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: TABLE_CARDS, next: null, mine: [] }) }) : route.fallback());
      await ctx.addInitScript(() => { try { localStorage.setItem("place.v1", JSON.stringify({ lat: 41.69, lon: 44.8, name: "Sololaki" })); } catch {} });
    };
    const o = await open(browser, PREVIEW + "/", w, { screen: "walk-wide-" + scr, prepare });
    await registerFull(o.page);
    await o.page.click('[data-testid="tab-tables"]'); await o.page.locator('[data-testid="table-card"]').nth(4).waitFor({ timeout: 20000 });
    await settle(o.page);
    const page = o.page, t = '[data-screen="tables"]';
    compare(scr, "New table", abs(shape(S, p.newTable)), await one(page, `${t} .tb-new`));
    textAt(scr, "title", T[p.title], await line(page, `${t} .tb-head h1`));
    textAt(scr, "sub", T[p.sub], await line(page, `${t} .tb-sub`));
    textAt(scr, "«Playing now»", T[p.playing], await line(page, `${t} .tb-playing`));
    const rows = await boxOf(page, `${t} [data-testid="tables"] .tb-row`);
    p.rows.forEach((si, k) => compare(scr, `row ${k + 1}`, abs(shape(S, si)), rows[k] ?? NAN4));
    compare(scr, "row 1 face", abs(shape(S, p.face)), await one(page, `${t} [data-testid="tables"] .tb-row .tb-face`));
    compare(scr, "row 1 «Watch»", abs(shape(S, p.watch)), await one(page, `${t} [data-testid="tables"] .tb-row .tb-watch`));
    textAt(scr, "row 1 name", T[p.name], await line(page, `${t} [data-testid="tables"] .tb-row .tb-name`));
    textAt(scr, "row 1 counts", T[p.meta], await line(page, `${t} [data-testid="tables"] .tb-row .tb-meta`));
    textAt(scr, "«Start a game»", T[p.start], await line(page, `${t} .tb-start h2`));
    const tiles = await boxOf(page, `${t} .tb-game`);
    p.tiles.forEach((si, k) => compare(scr, `game tile ${k + 1}`, abs(shape(S, si)), tiles[k] ?? NAN4));
    for (const [k, li] of p.tileWords.entries()) if (li !== null) textAt(scr, `game tile ${k + 1} word`, T[li], await line(page, `${t} .tb-start li:nth-child(${k + 1}) .tb-game span`));
    if (kind === "tablet") { textAt(scr, "brand word", T[0], await line(page, `${t} .tb-head .word`)); await bar(scr, page, S, p.bar, t); }
    else { compare(scr, "panel", abs(shape(S, p.panel)), await one(page, `${t} .tb-sheet`)); await rail(scr, page, S, `${t} .tabbar`, p.rail);
      info(`${scr}: the talks' pane at the right of the panel is wide2's (not drawn here); the sheet runs tile 1's and tile 2's words into one line, so tile 2's word is not compared`); }
    info(`${scr}: the games' icons in the tiles and the row faces are strokes (not compared); the search in the head is not drawn`);
    await overflowAt(page, scr, w);
    if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${scr}.png` });
    // «Start a game»'s durak: the wizard opens on its first step with durak picked
    await page.click('[data-testid="start-durak"]'); await page.waitForSelector('[data-screen="new-table"]', { timeout: 20000 });
    const picked = await page.locator('[aria-pressed="true"], [aria-checked="true"]').first().textContent().catch(() => "");
    notes.push({ bad: !/durak|дурак/i.test(picked ?? ""), text: `${scr}: «Start a game» → Durak opens the wizard with durak picked (${(picked ?? "").trim()})` });
    await o.ctx.close();
  }

  // tile shapes in the sheets' feed order, by the shape's place in the file (readSheet's list)
  await feed("tablet", 834, "tablet", "tablet_834_Feed", { tiles: [6, 20, 10, 24, 12, 27, 16], list: 5, tile: 6, hand: 7, foot: 8, chip: 9, title: [14, 15] });
  await feed("desktop", 1440, "desktop", "desktop_1440_Feed", { tiles: [12, 25, 16, 29, 18, 33, 21], panel: 6, tile: 12, hand: 13, foot: 14, chip: 15, title: [13, 14] });
  await me("tablet", 834, "tablet", "tablet_834_Me");
  await tables("tablet", 834, "tablet", "tablet_834_Tables", { newTable: 1, title: 1, sub: 2, playing: 4, rows: [3, 12, 6, 15, 9], face: 4, watch: 5, name: 5, meta: 6,
    start: 20, tiles: [18, 19, 20, 21, 22, 23], tileWords: [21, 22, 23, 24, 25, 26], bar: { bar: 24, tab: 25 } });
  await talks("tablet", 834, "tablet", "tablet_834_Talks", { brand: 0, title: 1, offers: 4, faces: [7, 8, 9, 10], sheet: 11, selected: 12, avatars: [13, 14, 15, 16],
    names: [12, 16, 20, 24], pane: 17, paneAvatar: 19, paneName: 29, ring: 35, divider: 18, chips: [26, 27, 28, 29], field: 30, send: 31, bar: true });
  await write("tablet", 834, "tablet", "tablet_834_Write", { title: 0, sub: 1, sheet: 1, card: 2, label: 2, lives: 4, going: 6, modes: 3, hears: 10, zones: 6, live: 11, ring: 13, ringWords: 16, liveWords: 14, send: 12 });
  await me("desktop", 1440, "desktop", "desktop_1440_Me");
  await write("desktop", 1440, "desktop", "desktop_1440_Write", { where: 8, title: 9, panel: 6, card: 7, label: 10, lives: 13, going: 15, modes: 8, hears: 19, zones: 11,
    live: 16, ring: 39, ringWords: 60, liveWords: 23, send: 17, preview: { title: 25, tile: 18, text: 30 }, rail: { active: 2, say: 4 },
    pane: { box: 22, title: 32, avatars: [33, 35, 36, 37], names: [43, 47, 51, 55] } });
  info("not compared (the sheets draw them, this shell has not the thing): the right pane of the desktop feed and card (Talks, a chat), the quota card and the rail's quota, the chips' counts, the tiles' distance and time, the search icon, the unread dot, the thread \"Beside it\" and \"Reply beside\", the density line, the offer and table tiles as drawn");
}
