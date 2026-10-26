// Measures the MOTION of the real rendered app/ shell (the dev stand http://localhost:5174, container xor-local-app) with prefers-reduced-motion: no-preference,
// in four scenes: feed loading, open chat, send a phrase, match. A sampler in the page (every animation frame) records every running animation of the document
// (document.getAnimations(): CSS animations, CSS transitions, script animations, the view transition's pseudo-element animations) with its target, duration,
// delay, easing, iterations and the window it was seen in, and wraps document.startViewTransition to log its calls. The ripple and the shimmer are looked for
// in the style sheets (names of rules and @keyframes), in the DOM (classes) and among the running animations. The node is stubbed in the browser, as in the overlap run.
// Run by scripts/measure-app-overlap.sh; the helpers are measure-app-overlap.mjs's.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { nodeStub, openPage, register, confirmPaper, DEV, feedSel } from "./measure-app-overlap.mjs";

const OUT = process.env.OUT_MOTION ?? "/out/measure-motion.txt";
const W = Number(process.env.MOTION_WIDTH ?? 390);
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

const SAMPLER = () => {
  const sk = {}, seen = new Map(), vt = [], t0 = () => performance.now();
  let base = t0(), live = true;
  const sel = (el, pseudo) => {
    if (!el) return "(none)";
    const t = el.tagName ? el.tagName.toLowerCase() : "?";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const tid = el.dataset && el.dataset.testid ? `[${el.dataset.testid}]` : "";
    return t + tid + cls + (pseudo ?? "");
  };
  // the skeletons standing on the page, by screen: when the first showed and when the last one went (waiting rules: not under 300 ms, 600 ms at least);
  // read on every DOM change, not on frames, so the span is exact
  const looks = () => {
    const now = t0() - base, here = document.querySelector("[data-testid=inbox-skeleton], [data-testid=likes-skeleton], [data-testid=loading]");
    const who = here ? here.dataset.testid : "";
    for (const k of ["inbox-skeleton", "likes-skeleton", "loading"]) {
      const r = (sk[k] ??= { from: null, to: null });
      if (who === k) { if (r.from === null) r.from = now; r.to = now; } else if (r.from !== null && !r.closed) { r.to = now; r.closed = true; }
    }
  };
  new MutationObserver(looks).observe(document, { childList: true, subtree: true });
  const frame = () => {
    const now = t0() - base;
    for (const a of document.getAnimations()) {
      let rec = seen.get(a);
      const ef = a.effect, ct = ef && ef.getComputedTiming ? ef.getComputedTiming() : {}, tm = ef && ef.getTiming ? ef.getTiming() : {};
      if (!rec) {
        const kind = a.constructor.name;   // CSSAnimation, CSSTransition, Animation
        rec = { kind, name: kind === "CSSAnimation" ? a.animationName : kind === "CSSTransition" ? a.transitionProperty : (a.id || "(script)"),
          target: sel(ef && ef.target, ef && ef.pseudoElement), pseudo: ef && ef.pseudoElement || "",
          duration: ct.duration ?? tm.duration, delay: tm.delay ?? 0, easing: ((ef && ef.getKeyframes && ef.getKeyframes()[0]?.easing) || tm.easing) ?? "", effectEasing: tm.easing ?? "", iterations: tm.iterations, direction: tm.direction, fill: tm.fill,
          kf: ef && ef.getKeyframes ? ef.getKeyframes().map((k) => `${k.offset ?? ""}:${k.transform ?? k.scale ?? ""}/${k.opacity ?? ""}`).join(" ") : "",
          first: now, last: now, frames: 0, ran: false, infinite: tm.iterations === Infinity };
        seen.set(a, rec);
      }
      rec.last = now; rec.frames++; if (a.playState === "running") rec.ran = true;
    }
    if (live) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const orig = document.startViewTransition ? document.startViewTransition.bind(document) : null;
  if (orig) document.startViewTransition = (cb) => { vt.push({ at: t0() - base, vt: document.documentElement.dataset.vt ?? "", types: "" }); return orig(cb); };
  window.__mot = {
    reset() { seen.clear(); vt.length = 0; for (const k of Object.keys(sk)) delete sk[k]; base = t0(); },
    // GET /feed starts on the page's clock, so the feed skeleton is timed from its own request, not from reset()
    dump() { return { anims: [...seen.values()], vt: [...vt], hasVT: !!orig, sk: JSON.parse(JSON.stringify(sk)),
      feedReqs: performance.getEntriesByType("resource").filter((e) => /\/feed(\?|$)/.test(new URL(e.name).pathname + (new URL(e.name).search ? "?" : ""))).map((e) => e.startTime - base) }; },
    tokens() {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(["--ease", "--d-sheet", "--d-dim", "--d-shimmer", "--d-item", "--o-item", "--d-fast", "--d-ripple"].map((k) => [k, cs.getPropertyValue(k).trim()]));
    },
  };
};

const css = (page) => page.evaluate(() => {
  const keyframes = [], rules = [];
  for (const sheet of document.styleSheets) {
    let list; try { list = sheet.cssRules; } catch { continue; }
    const walk = (rs) => { for (const r of rs) {
      if (r.type === CSSRule.KEYFRAMES_RULE) keyframes.push(r.name);
      else if (r.cssRules && r.type !== CSSRule.STYLE_RULE) walk(r.cssRules);
      else if (/ripple|shimmer/i.test(r.selectorText ?? "")) rules.push(r.cssText.slice(0, 90));
    } };
    walk(list);
  }
  return { keyframes: [...new Set(keyframes)], rules: [...new Set(rules)] };
});
const dom = (page) => page.evaluate(() => ({
  ripple: document.querySelectorAll('[class*="ripple" i], [data-ripple]').length,
  shimmerEls: document.querySelectorAll('[class*="shimmer" i], .skeleton').length,
  skeletons: document.querySelectorAll(".skeleton").length,
}));

const rows = [];   // for the final table

// The eight rules of MOTION.md the shell must show, each looked for among the running animations of the scenes (name, target, duration,
// easing, keyframes). One line each: "rule: seen/not seen, dur, easing". A rule is "seen" only when every number in its test is met.
const EASE = /cubic-bezier\(0\.22, 0\.9, 0\.24, 1\)/;
const round = (n) => Math.round(Number(n));
function stepOf(list) {   // the delays of the distinct targets, sorted: their common step or null
  const d = [...new Set(list.map((r) => round(r.delay)))].sort((a, b) => a - b);
  if (d.length < 3) return { d, step: null };
  const st = d.slice(1).map((v, i) => v - d[i]);
  return { d, step: st.every((x) => Math.abs(x - st[0]) <= 2) ? st[0] : null };
}
function verdicts(all, results, ringPaint) {
  const by = (name, tgt) => all.filter((r) => r.name === name && (!tgt || tgt.test(r.target)));
  const out = [];
  const rule = (n, name, ok, r, extra) => { out.push(ok); log(`rule ${n} ${name}: ${ok ? "seen" : "not seen"}, ${r ? `dur ${round(r.duration)} ms${r.infinite ? " infinite" : ""}, easing ${EASE.test(r.easing) ? "cubic-bezier(.22,.9,.24,1)" : r.easing}` : "dur -, easing -"}${extra ? ", " + extra : ""}`); };

  // 1. a layer comes up the full height in 0.55 s; the one under goes to .93
  const up = all.find((r) => ["screen-up", "sheet-up"].includes(r.name) && r.pseudo.startsWith("::view-transition") && round(r.duration) === 550 && EASE.test(r.easing));
  const under = all.find((r) => r.name === "under" && round(r.duration) === 550 && /0\.93/.test(r.kf));
  rule(1, "layer 550 ms, under .93", !!(up && under), up, `under: ${under ? under.kf : "-"}`);

  // 2. cards come in one after another
  const cards = by("rise", /fd-card/).filter((r) => round(r.duration) === 500 && EASE.test(r.easing));
  const st = stepOf(cards);
  rule(2, "cards staggered", cards.length >= 3 && st.step !== null && st.step > 0, cards[0], `${cards.length} cards, delays ${st.d.join("/")} ms, step ${st.step} ms`);

  // 3. the shimmer
  const sh = by("shimmer", /skeleton/).find((r) => round(r.duration) === 1300 && r.infinite && r.easing === "linear");
  rule(3, "skeleton shimmer 1.3 s linear", !!sh, sh, sh ? sh.target : "");

  // 4. the tap wave .3 -> 1.2 in 0.45 s
  const rp = by("press", /tap-ripple/).find((r) => round(r.duration) === 450 && EASE.test(r.easing) && /scale\(0\.3\)/.test(r.kf) && /scale\(1\.2\)/.test(r.kf));
  rule(4, "tap ripple .3 -> 1.2", !!rp, rp, rp ? `keyframes ${rp.kf}` : "");

  // 5. typing: three dots jump 5 px, cycle 0.9 s, shifted 0.15 s
  const dots = by("typing-jump");
  const dd = [...new Set(dots.map((r) => round(r.delay)))].sort((a, b) => a - b);
  const jump5 = dots.some((r) => /translateY\(-5px\)/.test(r.kf));
  const ty = dots[0];
  rule(5, "typing dots", dots.length >= 3 && dd.join() === "0,150,300" && jump5 && round(ty.duration) === 900 && ty.infinite, ty, `${dots.length} dots, delays ${dd.join("/")} ms, jump ${jump5 ? "5 px" : "?"}`);

  // 6. a line pops from its corner .85 -> 1, 0.35 s, step 0.32 s
  const pops = by("bubble-pop", /ch-row/).filter((r) => round(r.duration) === 350 && EASE.test(r.easing) && /scale\(0\.85\)/.test(r.kf));
  const ps = stepOf(pops);
  const real = by("bubble-pop", /tk-bubble-row/).find((r) => round(r.duration) === 350 && EASE.test(r.easing) && /scale\(0\.85\)/.test(r.kf));
  rule(6, "message pop .85 -> 1", pops.length >= 3 && ps.step === 320 && !!real, pops[0], `${pops.length} lines (put in by hand), delays ${ps.d.join("/")} ms, step ${ps.step} ms; real flow: my queued line in the wait ${real ? "popped" : "did not pop"}`);

  // 7. the match card .82 -> 1.03 -> 1 in; .96 and fade out
  const mi = by("match-in", /tk-match/).find((r) => round(r.duration) === 650 && EASE.test(r.easing) && /scale\(0\.82\)/.test(r.kf) && /scale\(1\.03\)/.test(r.kf));
  const mo = by("match-out", /tk-match/).find((r) => round(r.duration) === 400 && EASE.test(r.easing) && /scale\(0\.96\)/.test(r.kf));
  rule(7, "match pop in .82/1.03/1, out .96", !!(mi && mo), mi, `in ${mi ? round(mi.duration) : "-"} ms, out ${mo ? round(mo.duration) + " ms " + mo.kf : "-"}`);

  // 8. the ring turns: arc 28 %, 0.9 s, linear, yellow on #4A4070
  const rg = by("spin", /tk-wait-ring/).find((r) => round(r.duration) === 900 && r.infinite && r.easing === "linear");
  const paint = /28%/.test(ringPaint) && /247, 207, 90/.test(ringPaint) && /74, 64, 112/.test(ringPaint);
  rule(8, "ring indicator", !!(rg && paint), rg, `paint ${paint ? "arc 28%, yellow on #4A4070" : ringPaint}`);

  // the waiting rules in Inbox and Likes (reported, and required)
  const sk = (k, name) => results[k].d.sk[name] ?? { from: null, to: null };
  const ib = sk("inbox", "inbox-skeleton"), lf = sk("likesFast", "likes-skeleton"), ls = sk("likesSlow", "likes-skeleton");
  const okInbox = ib.from !== null && ib.from >= 250 && ib.from <= 700 && (ib.to - ib.from) > 1000;
  const okFast = lf.from === null;
  const okSlow = ls.from !== null && (ls.to - ls.from) >= 600;
  const fs = sk("feedSlow", "loading");
  const feedReq = fs.from === null ? null : Math.max(...(results.feedSlow.d.feedReqs ?? []).filter((t) => t <= fs.from), -Infinity);
  const fsAfter = feedReq === null || feedReq === -Infinity ? null : fs.from - feedReq;   // ms from the GET /feed it waits on
  const okFeed = fsAfter !== null && fsAfter >= 250 && (fs.to - fs.from) >= 600;
  log(`skeleton Inbox (held 2000 ms): ${okInbox ? "seen" : "not seen"} from ${ib.from?.toFixed(0)} to ${ib.to?.toFixed(0)} ms after the screen opened (needs: shows after ~300 ms, stays until the answer)`);
  log(`skeleton Likes (answer in 100 ms): ${okFast ? "none shown (ok)" : "SHOWN at " + lf.from?.toFixed(0) + " ms (must not)"}`);
  log(`skeleton Likes (answer in 450 ms): ${okSlow ? "seen" : "not seen / too short"}, stood ${ls.from === null ? "-" : (ls.to - ls.from).toFixed(0)} ms (needs at least 600 ms; read on every DOM change)`);
  log(`skeleton Feed (answer in 450 ms): ${okFeed ? "seen" : "not seen / too short"}, shown ${fsAfter === null ? "-" : fsAfter.toFixed(0)} ms after GET /feed, stood ${fs.from === null ? "-" : (fs.to - fs.from).toFixed(0)} ms (needs from ≥250 ms and at least 600 ms; read on every DOM change)`);
  const n = out.filter(Boolean).length;
  const extraOk = okInbox && okFast && okSlow && okFeed;
  log(`MOTION RULES: ${n}/8 seen; waiting rules in Inbox, Likes and Feed: ${extraOk ? "ok" : "BROKEN"}`);
  if (n < 8 || !extraOk) process.exitCode = 1;
}
async function report(page, scene, ms) {
  const d = await page.evaluate(() => window.__mot.dump());
  const dm = await dom(page);
  const scr = await page.evaluate(() => `${location.pathname} [${[...document.querySelectorAll("[data-screen]")].map((e) => e.dataset.screen).join(",")}]`);
  log(`-- scene ${scene}: observed ${ms} ms; ends on ${scr}; view transition calls: ${d.vt.length}${d.vt.length ? " (" + d.vt.map((v) => `at ${v.at.toFixed(0)} ms data-vt=${v.vt || "-"}`).join("; ") + ")" : ""}${d.hasVT ? "" : " [browser has no startViewTransition]"}`);
  log(`   DOM now: skeletons=${dm.skeletons}, shimmer-class elements=${dm.shimmerEls}, ripple-class elements=${dm.ripple}`);
  const a = d.anims.sort((x, y) => x.first - y.first);
  if (!a.length) log("   (no animation seen)");
  for (const r of a) {
    const dur = r.infinite ? `${r.duration} ms x infinite` : `${r.duration} ms`;
    log(`   ${r.kind.padEnd(13)} ${String(r.name).padEnd(18)} ${r.target.padEnd(34).slice(0, 44)} dur=${dur.padEnd(18)} delay=${r.delay} ease=${r.easing} (effect ${r.effectEasing}) fill=${r.fill} seen ${r.first.toFixed(0)}..${r.last.toFixed(0)} ms${r.pseudo ? (r.pseudo.startsWith("::view-transition") ? " (view-transition pseudo)" : " (pseudo-element)") : ""}`);
    rows.push({ scene, ...r });
  }
  return { d, dm };
}

async function main() {
  const browser = await chromium.launch();
  const stub = nodeStub({ feedDelay: 2500 });
  const o = await openPage(browser, W, { prepare: stub.prepare, reducedMotion: "no-preference" });
  const { page } = o;
  await page.addInitScript(SAMPLER);
  await page.context().addInitScript(() => {});
  const mq = await (async () => { await page.goto(DEV + "/", { waitUntil: "load" }); return page.evaluate(() => ({ reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, noPref: matchMedia("(prefers-reduced-motion: no-preference)").matches })); })();
  log(`MOTION @${W}px, prefers-reduced-motion: no-preference matches=${mq.noPref}, reduce matches=${mq.reduce}`);
  const ok = (m) => { if (!m) throw new Error("the media query is not as asked"); };
  ok(mq.noPref && !mq.reduce);
  const css1 = await css(page);
  log(`style sheets: @keyframes ${css1.keyframes.join(", ") || "(none)"}`);
  log(`style sheets: rules mentioning ripple/shimmer: ${css1.rules.length ? css1.rules.join(" | ") : "(none)"}`);
  log(`tokens: ${JSON.stringify(await page.evaluate(() => window.__mot.tokens()))}`);
  await register(page);
  const results = {};

  // 1. feed loading: the node holds GET /feed for 2.5 s, so the skeletons stand; then the cards arrive
  await page.evaluate(() => window.__mot.reset());
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FTE");
  await page.evaluate(() => window.__mot.reset());
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector(feedSel, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const during = await dom(page);
  await page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
  await page.waitForTimeout(1800);
  log(`feed loading: skeletons standing at 1.2 s after the feed opened: ${during.skeletons} (GET /feed held 2500 ms)`);
  results.feed = await report(page, "1 feed loading", 5000);

  // 2. open chat: the node stub answers /chats/* 503; here the answer is held 1600 ms so the room stays «opening» and the «typing» bubble can stand
  stub.s.feedDelay = 0;
  const hold = { chats: 1600, inbox: 0, likes: 0 };
  await page.route(/\/(chats|inbox|likes)(\/|\?|$)/, async (route) => {
    if (route.request().resourceType() !== "fetch" && route.request().resourceType() !== "xhr") return route.fallback();
    const k = new URL(route.request().url()).pathname.split("/")[1];
    if (hold[k]) await new Promise((r) => setTimeout(r, hold[k]));
    return route.fallback();
  });
  await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-testid="open-chat"]'); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__mot.reset());
  await page.locator('[data-testid="open-chat"]').first().click();
  await page.waitForSelector('[data-screen="chat"], [data-testid="chat-pane"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1900);
  // The stub has no chat room (the keys and the socket are the node's), so no line of a talk ever arrives here: four rows are put into the real
  // chat's list by hand, with the classes Chat.tsx gives them and the --i that popStep (unit-tested) gives the first batch; the animation is the
  // shipped style sheet's. (The real flow's own pop is scene 4's queued line.)
  const injected = await page.evaluate(() => {
    const ol = document.querySelector('ol[data-testid="lines"]'); if (!ol) return 0;
    ["theirs", "mine", "theirs", "mine"].forEach((side, i) => { const li = document.createElement("li"); li.className = `ch-row ch-${side}`; li.style.setProperty("--i", String(i)); li.innerHTML = '<p class="ch-bubble">line</p>'; ol.appendChild(li); });
    return ol.querySelectorAll(".ch-row").length;
  });
  log(`   chat lines put in by hand into ol[lines]: ${injected} rows now`);
  await page.waitForTimeout(1800);
  results.chat = await report(page, "2 open chat", 3700);
  hold.chats = 0;
  await page.goBack().catch(() => {}); await page.waitForTimeout(800);

  // 3. send a phrase: the feed, the composer, text, Send
  await page.click('[data-testid="tab-feed"]').catch(() => {}); await page.waitForSelector(feedSel, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(1500);
  const rail = page.locator('[data-testid="rail-say"]');
  if (await rail.isVisible().catch(() => false)) await rail.click(); else await page.click('[data-testid="write"]');
  await page.waitForSelector('[data-screen="composer"]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.fill('[data-testid="text"]', "Backgammon in the yard tonight?");
  await page.evaluate(() => window.__mot.reset());
  await page.click('[data-testid="send"]');
  await page.waitForTimeout(2200);
  results.send = await report(page, "3 send phrase", 2200);
  log(`   after Send: screen ${await page.evaluate(() => document.querySelector("[data-screen]")?.dataset.screen)}, POST /feed called: ${stub.s.calls.includes("POST /feed")}`);

  // 4. match: the talks, the offer, "Let's talk"
  await page.goto(DEV + "/", { waitUntil: "load" }).catch(() => {});
  const unlocked = await page.waitForSelector('[data-screen="unlock"], ' + feedSel, { timeout: 15000 }).then((e) => e.getAttribute("data-screen")).catch(() => "none");
  if (unlocked === "unlock") { await page.fill('[data-testid="unlock-pin"]', "483915"); await page.click('[data-testid="unlock"]'); await page.waitForSelector(feedSel, { timeout: 20000 }); }
  await page.click('[data-testid="tab-chats"]'); await page.waitForSelector('[data-testid="open-match"]'); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__mot.reset());
  await page.locator('[data-testid="open-match"]').first().click();
  await page.waitForSelector('[data-screen="match"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.click('[data-testid="talk"]').catch(() => {});
  await page.waitForTimeout(1200);
  await page.fill('[data-testid="queued-line"]', "See you at nine").catch(() => {});
  await page.click('[data-testid="enqueue"]').catch(() => {});
  await page.waitForTimeout(900);
  const ringPaint = await page.evaluate(() => { const r = document.querySelector(".tk-wait-ring"); if (!r) return ""; const c = getComputedStyle(r); return `${c.backgroundImage} | mask ${c.maskImage || c.webkitMaskImage}`; });
  results.match = await report(page, "4 match (open the offer, Let's talk)", 2700);

  // 5. the waiting rules in the talks: Inbox held 2000 ms; Likes answered in 100 ms (no skeleton), then in 450 ms (skeleton, 600 ms at least)
  await page.goto(DEV + "/", { waitUntil: "load" }).catch(() => {});
  const un2 = await page.waitForSelector('[data-screen="unlock"], ' + feedSel, { timeout: 15000 }).then((e) => e.getAttribute("data-screen")).catch(() => "none");
  if (un2 === "unlock") { await page.fill('[data-testid="unlock-pin"]', "483915"); await page.click('[data-testid="unlock"]'); await page.waitForSelector(feedSel, { timeout: 20000 }); }
  await page.waitForTimeout(1500);
  hold.inbox = 2000;
  await page.evaluate(() => window.__mot.reset());
  await page.click('[data-testid="tab-chats"]');
  await page.waitForSelector('[data-testid="open-likes"]', { timeout: 15000 });
  await page.waitForTimeout(2600);
  results.inbox = await report(page, "5a inbox held 2000 ms", 2600);
  log(`   inbox screen at the end: error line ${JSON.stringify(await page.locator('[data-screen="inbox"] [data-testid="error"]').allInnerTexts())}, rows ${await page.locator('[data-testid="chat"]').count()}, offers ${await page.locator('[data-testid="match"]').count()}`);
  hold.inbox = 0; hold.likes = 100;
  await page.evaluate(() => window.__mot.reset());
  await page.click('[data-testid="open-likes"]'); await page.waitForSelector('[data-screen="likes"]', { timeout: 10000 });
  await page.waitForTimeout(1500);
  results.likesFast = await report(page, "5b likes answered in 100 ms", 1500);
  await page.goBack().catch(() => {}); await page.waitForSelector('[data-testid="open-likes"]'); await page.waitForTimeout(800);
  hold.likes = 450;
  await page.evaluate(() => window.__mot.reset());
  await page.click('[data-testid="open-likes"]'); await page.waitForSelector('[data-screen="likes"]', { timeout: 10000 });
  await page.waitForTimeout(2000);
  results.likesSlow = await report(page, "5c likes answered in 450 ms", 2000);

  // 6. the waiting rule in the feed: the node answers GET /feed in 450 ms; the skeleton must show (after 300 ms) and stand 600 ms at least
  stub.s.feedDelay = 450;
  await page.goto(DEV + "/", { waitUntil: "load" }).catch(() => {});
  const un3 = await page.waitForSelector('[data-screen="unlock"], ' + feedSel, { timeout: 15000 }).then((e) => e.getAttribute("data-screen")).catch(() => "none");
  await page.evaluate(() => window.__mot.reset());
  if (un3 === "unlock") { await page.fill('[data-testid="unlock-pin"]', "483915"); await page.click('[data-testid="unlock"]'); await page.waitForSelector(feedSel, { timeout: 20000 }); }
  await page.waitForTimeout(2500);
  results.feedSlow = await report(page, "6 feed answered in 450 ms", 2500);
  stub.s.feedDelay = 0;

  // ripple / shimmer verdict
  const css2 = await css(page);
  const all = rows;
  const shimmer = all.filter((r) => /shimmer/i.test(String(r.name)));
  const ripple = all.filter((r) => /ripple/i.test(String(r.name)));
  log("== SUMMARY");
  const names = new Map();
  for (const r of all) { const k = `${r.kind} ${r.name} ${r.pseudo ? "(" + r.pseudo + ")" : ""}`; const e = names.get(k) ?? { n: 0, scenes: new Set(), dur: new Set(), ease: new Set() }; e.n++; e.scenes.add(r.scene[0]); e.dur.add(r.infinite ? `${r.duration}ms inf` : `${r.duration}ms`); e.ease.add(r.easing); names.set(k, e); }
  log("scene | animation (kind name) | seen in scenes | durations | easing");
  for (const [k, e] of names) log(`${k.trim()} | ${[...e.scenes].join(",")} | ${[...e.dur].join(",")} | ${[...e.ease].join(" ; ")}`);
  const vts = Object.values(results).reduce((n, r) => n + r.d.vt.length, 0);
  log(`view transitions started in the four scenes: ${vts}`);
  log(`shimmer: @keyframes present=${css2.keyframes.includes("shimmer")}; running animations named shimmer seen=${shimmer.length}${shimmer.length ? ` (target ${shimmer[0].target}, ${shimmer[0].duration} ms linear infinite? easing=${shimmer[0].easing})` : ""}; skeletons standing at 1.2 s: ${during.skeletons}`);
  log(`ripple: rules mentioning ripple=${css2.rules.filter((r) => /ripple/i.test(r)).length}; @keyframes named ripple=${css2.keyframes.filter((k) => /ripple/i.test(k)).length}; ripple-class elements in the DOM at the end=${(await dom(page)).ripple}; running animations named ripple seen=${ripple.length}`);
  verdicts(all, results, ringPaint);
  log(`page errors: ${o.errors.length ? o.errors.slice(0, 3).join(" | ") : "none"}; unexpected node calls: ${[...new Set(stub.s.unexpected)].join(", ") || "none"}`);
  await browser.close();
  writeFileSync(OUT, lines.join("\n") + "\n");
}
await main();
