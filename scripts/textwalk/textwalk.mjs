// A person's walk of the product on the local stand, written down as text — no
// screenshots (owner, 10.10.2026). For every step: the screen's id, its visible
// text, the controls a screen reader would name (and the ones it could not),
// node answers >= 400, page errors, the time the step took.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4173";
const PIN = "123456";
const b = await chromium.launch();
let last = Date.now();
const SHOT = { n: 0, list: [] };

// asked: the device has passed the splash's language list (owner 12.10.2026); Anya and the English guest meet it.
async function phone(who, locale = "ru-RU", asked = true) {
  // WALK_WIDTH: phone 393 by default; 768 tablet, 1440 desktop, 2560/3440 wide (owner, 11.10.2026).
  const w = Number(process.env.WALK_WIDTH || 393);
  const h = w <= 500 ? 851 : w <= 1100 ? 1024 : w <= 2000 ? 900 : 1440;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale });
  if (asked) await ctx.addInitScript(() => { try { localStorage.setItem("lang-asked", "1"); } catch { /* storage blocked */ } });
  const p = await ctx.newPage();
  p.who = who;
  p.on("pageerror", (e) => console.log(`  ! ${who} pageerror: ${String(e).slice(0, 200)}`));
  p.on("console", (m) => { if (m.type() === "error") console.log(`  ! ${who} console: ${m.text().slice(0, 200)}`); });
  p.on("response", (r) => {
    if (r.status() >= 400) console.log(`  ! ${who} http ${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`);
  });
  return p;
}

// Runs in the page: the screen as one SVG string and the fonts it needs (file name → base64).
async function snapshot() {
  const W = innerWidth, H = Math.max(document.documentElement.scrollHeight, innerHeight);
  const fonts = {};
  const fontUrl = async (url) => {
    const abs = new URL(url, location.href); const file = abs.pathname.split("/").pop();
    if (!(file in fonts)) {
      const buf = new Uint8Array(await (await fetch(abs)).arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      fonts[file] = btoa(bin);
    }
    return `fonts/${file}`;
  };
  const out = [];
  const take = async (rules) => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) { if (matchMedia(r.conditionText).matches) await take(r.cssRules); continue; }
      if (r instanceof CSSSupportsRule) { if (CSS.supports(r.conditionText)) await take(r.cssRules); continue; }
      let t = r.cssText;
      if (r instanceof CSSFontFaceRule) {
        for (const m of [...t.matchAll(/url\("?([^")]+)"?\)/g)]) t = t.replace(m[0], `url("${await fontUrl(m[1])}")`);
      }
      out.push(t.replace(/html:root/g, "html").replace(/:root/g, "html"));
    }
  };
  for (const s of document.styleSheets) { try { await take(s.cssRules); } catch { /* a foreign sheet */ } }
  const root = document.documentElement.cloneNode(true);
  const src = document.querySelectorAll("input, select, textarea"), dst = root.querySelectorAll("input, select, textarea");
  src.forEach((el, i) => {
    const d = dst[i];
    if (el.type === "checkbox" || el.type === "radio") { if (el.checked) d.setAttribute("checked", ""); else d.removeAttribute("checked"); }
    else if (el.tagName === "TEXTAREA") d.textContent = el.value;
    else if (el.tagName === "SELECT") [...d.options].forEach((o, j) => { if (j === el.selectedIndex) o.setAttribute("selected", ""); else o.removeAttribute("selected"); });
    else d.setAttribute("value", el.value);
  });
  root.querySelectorAll("script, link, style").forEach((n) => n.remove());
  root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const html = new XMLSerializer().serializeToString(root);
  // The CSS goes in the SVG's own <style>: an HTML <style> inside a foreignObject is not read in an SVG
  // document (0 style sheets, measured 12.10). Unprefixed selectors match the XHTML elements too.
  const css = out.join("\n").replace(/]]>/g, "]] >");
  return { fonts, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style><![CDATA[\n${css}\n]]></style><foreignObject x="0" y="0" width="${W}" height="${H}">${html}</foreignObject></svg>` };
}

async function look(p, step) {
  await p.waitForTimeout(250);
  const s = await p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const screen = document.querySelector("[data-screen]");
    // What the eye sees, apart from what only a screen reader reads: the clipped
    // .visually-hidden boxes are still in innerText (they have a 1px box), so
    // they are taken out for the text and listed on a line of their own.
    const root = document.querySelector("main, [data-screen]") ?? document.body;
    const hiddenEls = [...root.querySelectorAll(".visually-hidden")];
    const sr = hiddenEls.map((el) => el.textContent.trim()).filter(Boolean);
    const shown = hiddenEls.map((el) => [el, el.style.display]);
    for (const el of hiddenEls) el.style.display = "none";
    const text = root.innerText.replace(/\n{2,}/g, "\n").trim();
    for (const [el, d] of shown) el.style.display = d;
    const controls = [...document.querySelectorAll("button, a, input, select, textarea, [role=button]")].filter(vis).map((el) => {
      const byIds = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? "").join(" ").trim();
      const name = (el.getAttribute("aria-label") || byIds || el.innerText || el.getAttribute("placeholder") || el.getAttribute("title") || (el.labels?.[0]?.innerText ?? "") || "").trim().replace(/\s+/g, " ");
      return `${el.tagName.toLowerCase()}${el.dataset.testid ? "#" + el.dataset.testid : ""}=${name ? JSON.stringify(name.slice(0, 40)) : "БЕЗ ИМЕНИ"}`;
    });
    // Layout as a person meets it at this width: sideways scroll, things past the
    // edge, how wide the content runs, taps too small for a finger.
    const W = innerWidth;
    const over = document.documentElement.scrollWidth - W;
    const out = [...document.querySelectorAll("body *")].filter(vis).filter((el) => !el.closest(".visually-hidden"))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.right > W + 1 || r.left < -1; })
      .slice(0, 4).map((el) => el.tagName.toLowerCase() + (el.dataset.testid ? "#" + el.dataset.testid : ""));
    const m = (document.querySelector("main") ?? screen ?? document.body).getBoundingClientRect();
    const smallEls = W <= 1100 ? [...document.querySelectorAll("button, a, input, [role=button]")].filter(vis)
      .filter((el) => getComputedStyle(el).display !== "inline").filter((el) => { const r = el.getBoundingClientRect(); return r.height < 24 || r.width < 24; }) : []; // WCAG 2.5.8 (AA): at least 24×24; a link inside a sentence is its exception
    const small = smallEls.length ? `${smallEls.length} (${smallEls.slice(0, 4).map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${el.dataset.testid ? "#" + el.dataset.testid : ""}${el.getAttribute("aria-label") ? "«" + el.getAttribute("aria-label").slice(0, 20) + "»" : ""} ${Math.round(r.width)}×${Math.round(r.height)}`;
    }).join(", ")})` : 0;
    const layout = `w=${W} content=${Math.round(m.left)}..${Math.round(m.right)} (${Math.round(m.width)})`
      + (over > 0 ? ` SIDEWAYS-SCROLL +${over}` : "") + (out.length ? ` PAST-EDGE ${out.join(" ")}` : "") + (small ? ` SMALL-TAPS ${small}` : "");
    return { id: screen?.getAttribute("data-screen") ?? "?", text, sr, controls, layout, title: document.title, lang: document.documentElement.lang };
  });
  // WALK_SHOTS: a picture of every step (only with the owner's yes for the task — 11.10.2026 «screenshots of
  // every flow»), into /shots mounted by run.sh; named by order, who and step.
  if (process.env.WALK_SHOTS) {
    SHOT.n += 1;
    const file = `/shots/${String(SHOT.n).padStart(3, "0")}-${p.who}-${step}`.replace(/[^\p{L}\p{N}/._-]+/gu, "_").slice(0, 120) + ".jpg";
    await p.screenshot({ path: file, type: "jpeg", quality: 70, fullPage: true }).catch(() => {});
    SHOT.list.push({ n: SHOT.n, who: p.who, step, screen: s.id, file: file.slice(7) });
  }
  // WALK_SVG: every step as a vector SVG (owner 12.10.2026: «в свг сохранить экраны все которые обошел»):
  // the page's markup in a <foreignObject>, its CSS inside, frozen at this width — the @media rules that hold
  // now are unwrapped, the others dropped, :root becomes html (inside an SVG the root is the <svg>); the
  // fields' values and the boxes' ticks go with it; the fonts are written once beside the files.
  if (process.env.WALK_SVG) {
    SHOT.n += 1;
    const name = `${String(SHOT.n).padStart(3, "0")}-${p.who}-${step}`.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 110) + ".svg";
    const { svg, fonts } = await p.evaluate(snapshot).catch((e) => ({ svg: null, fonts: {}, e: String(e) }));
    if (svg) {
      const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
      mkdirSync("/shots/fonts", { recursive: true });
      for (const [f, b64] of Object.entries(fonts)) if (!existsSync(`/shots/fonts/${f}`)) writeFileSync(`/shots/fonts/${f}`, Buffer.from(b64, "base64"));
      writeFileSync(`/shots/${name}`, svg);
      SHOT.list.push({ n: SHOT.n, who: p.who, step, screen: s.id, file: name });
    }
  }
  const ms = Date.now() - last; last = Date.now();
  // WALK_STABLE: no timings, so two walks diff line by line.
  const took = process.env.WALK_STABLE ? "" : `${ms} ms · `;
  console.log(`\n## ${p.who} · ${step} · [${s.id}] · ${took}title="${s.title}" lang=${s.lang}`);
  console.log(s.text.split("\n").map((l) => "  | " + l).join("\n"));
  if (s.sr.length) console.log("  screen reader only: " + s.sr.join(" | "));
  console.log("  controls: " + s.controls.join(", "));
  console.log("  layout: " + s.layout);
}
const t = (p, id) => p.getByTestId(id);
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`\n!! STEP FAILED: ${name}: ${String(e).split("\n")[0]}`); } };

const anya = await phone("Аня", "ru-RU", false);
const boris = await phone("Борис");
let code = [];
let tag = process.env.WALK_STABLE ? "w1" : Date.now().toString(36).slice(-3);

await step("splash", async () => {
  await anya.goto(BASE + "/"); await look(anya, "выбор языка");
  await t(anya, "lang-ru").click(); await t(anya, "start").waitFor(); await look(anya, "заставка");
});
await step("register errors", async () => {
  await t(anya, "start").click(); await look(anya, "кто вы, пусто");
  await t(anya, "name").fill("Аня"); await t(anya, "age").fill("12"); await anya.getByRole("checkbox").check();
  await look(anya, "возраст 12");
  await t(anya, "next").click().catch(() => {}); await look(anya, "после «дальше» с возрастом 12");
  await t(anya, "age").fill("28"); await t(anya, "next").click();
  await anya.locator('[data-screen="register-2"]').waitFor(); await look(anya, "ПИН, пусто");
  await t(anya, "pin").fill(PIN); await t(anya, "pin-again").fill("654321"); await look(anya, "ПИН не совпал");
  await t(anya, "register").click().catch(() => {}); await look(anya, "после «завести» с разными ПИН");
  await t(anya, "pin-again").fill(PIN); await t(anya, "register").click();
  await anya.locator('[data-screen="register-3"]').waitFor({ timeout: 30000 }); await look(anya, "бумажный код");
  code = (await t(anya, "paper-code").textContent()).trim().split(" ");
  await anya.getByTestId("paper-groups").locator("input").first().fill("ZZZZ"); await anya.getByTestId("paper-groups").locator("input").last().fill(code[3]);
  await t(anya, "confirm").click().catch(() => {}); await look(anya, "неверная вторая группа");
  await anya.getByTestId("paper-groups").locator("input").first().fill(code[1]); await t(anya, "confirm").click();
  // The wizard after sign-up (Ц4): Anya reads every step, Boris skips it.
  // Five steps since the place joined as the last (Wizard.tsx STEPS); she picks a city there.
  for (const n of [1, 2, 3, 4, 5]) {
    await anya.locator(`[data-testid="wizard-${n}"]`).waitFor({ timeout: 30000 }); await look(anya, `мастер, шаг ${n}`);
    if (n < 5) { await t(anya, "wizard-next").click(); continue; }
    await t(anya, "place-search").fill("Limas"); await t(anya, "place-city").first().click(); await look(anya, "мастер, место выбрано");
    await t(anya, "wizard-start").click();
  }
  await anya.locator('[data-screen="feed"]').waitFor({ timeout: 30000 }); await look(anya, "первая лента");
});
await step("boris register", async () => {
  await boris.goto(BASE + "/"); await t(boris, "start").click();
  await t(boris, "name").fill("Борис"); await t(boris, "age").fill("31"); await boris.getByRole("checkbox").check(); await t(boris, "next").click();
  await t(boris, "pin").fill(PIN); await t(boris, "pin-again").fill(PIN); await t(boris, "register").click();
  const c = (await t(boris, "paper-code").textContent()).trim().split(" ");
  await boris.getByTestId("paper-groups").locator("input").first().fill(c[1]); await boris.getByTestId("paper-groups").locator("input").last().fill(c[3]); await t(boris, "confirm").click();
  await t(boris, "wizard-skip").click({ timeout: 30000 });
  await boris.locator('[data-screen="feed"]').waitFor({ timeout: 30000 }); await look(boris, "первая лента");
});
const write = async (p, text, label) => {
  await t(p, "write").click(); await p.locator('[data-screen="composer"]').waitFor(); await look(p, `композер (${label})`);
  await t(p, "text").fill(text); await t(p, "send").click();
  await p.waitForFunction(() => document.querySelector('[data-testid="sent"]')?.getAttribute("data-state") !== "pending", null, { timeout: 20000 }).catch(() => {});
  await look(p, `после отправки (${label})`);
  if (await p.locator('[data-screen="composer"]').isVisible()) await t(p, "back").click();
};
await step("phrase with a link", () => write(anya, "пишите в тг @anya_river", "фраза с контактом"));
await step("phrases", async () => { await write(anya, `гуляю у реки, кто со мной ${tag}`, "обычная"); await write(boris, `иду к мосту с собакой ${tag}`, "обычная"); });
const like = async (p, text) => {
  await t(p, "nav-inbox").click(); await t(p, "nav-feed").click();
  const card = t(p, "card").filter({ hasText: text }); await card.first().waitFor({ timeout: 30000 });
  await look(p, "лента с фразой соседа");
  await card.first().click(); await look(p, "карточка");
  if ((await p.locator("html").getAttribute("data-brand")) === "neighbro") { await t(p, "heart").click(); await t(p, "heart-target").click(); }
  else await t(p, "like").click();
  await p.locator('[data-testid="liked"], [data-testid="matched"]').first().waitFor({ timeout: 20000 });
  await look(p, "после лайка"); await t(p, "back").click();
};
await step("likes", async () => { await like(anya, `иду к мосту с собакой ${tag}`); await like(boris, `гуляю у реки, кто со мной ${tag}`); });
await step("consent", async () => {
  await t(anya, "nav-inbox").click(); await look(anya, "входящие");
  const row = t(anya, "match").filter({ hasText: "Борис" }); await row.waitFor({ timeout: 30000 });
  await t(row, "open-match").click(); await look(anya, "мэтч");
  await t(anya, "talk").click(); await t(anya, "waiting").waitFor({ timeout: 15000 }); await look(anya, "ждём согласия");
  await t(anya, "to-inbox").click();
  await t(boris, "nav-inbox").click(); await look(boris, "входящие");
  const r2 = t(boris, "match").filter({ hasText: "Аня" }); await r2.waitFor({ timeout: 30000 });
  await t(r2, "open-match").click(); await look(boris, "мэтч");
  await t(boris, "talk").click(); await boris.locator('[data-testid="chat"]').first().waitFor({ timeout: 15000 });
  await look(boris, "входящие с беседой");
});
await step("chat", async () => {
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await boris.waitForSelector('[data-screen="chat"][data-keys="open"]', { timeout: 20000 });
  await anya.evaluate(() => window.dispatchEvent(new Event("focus")));
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').first().click({ timeout: 15000 });
  await anya.waitForSelector('[data-screen="chat"][data-keys="open"]', { timeout: 20000 });
  await look(anya, "чат открыт");
  await t(anya, "text").fill("привет! пошли вместе?"); await t(anya, "send").click();
  await boris.locator('[data-testid="theirs"]').last().waitFor({ timeout: 20000 }); await look(boris, "чат, пришла реплика");
  await t(boris, "text").fill("давай, через полчаса у моста"); await t(boris, "send").click();
  await anya.locator('[data-testid="theirs"]').last().waitFor({ timeout: 20000 }); await look(anya, "чат, пришёл ответ");
});
// The chat's «…» sheet: opened when it is not open (what e2e's chatMenu does).
const chatMenu = async (p) => { if (!(await t(p, "chat-menu").isVisible())) await t(p, "chat-more").click(); await t(p, "chat-menu").waitFor({ timeout: 10000 }); };
await step("keys and safety code", async () => {
  // F09: the safety code behind the chat's «…»; the two sides must read the same one (rekey.spec.ts).
  const seen = [];
  for (const p of [anya, boris]) {
    await chatMenu(p); await look(p, "меню беседы");
    await t(p, "show-safety").click(); await t(p, "safety").waitFor({ timeout: 10000 }); await look(p, "код безопасности");
    seen.push((await t(p, "safety").locator("code").textContent()).trim());
  }
  console.log(`  код безопасности: у Ани «${seen[0]}», у Бориса «${seen[1]}» — ${seen[0] === seen[1] ? "совпал" : "НЕ СОВПАЛ"}`);
});
await step("table and game", async () => {
  for (const p of [anya, boris]) { await t(p, "back").click(); await t(p, "nav-feed").click(); await p.locator('[data-screen="feed"]').waitFor(); }
  await t(anya, "nav-tables").click(); await anya.locator('[data-screen="tables"]').waitFor(); await look(anya, "столы");
  await t(anya, "new-table").click(); await anya.locator('[data-screen="new-table"]').waitFor(); await look(anya, "новый стол");
  await t(anya, "new-table-class").selectOption("dots"); await t(anya, "new-table-set").selectOption("2x2");
  await t(anya, "new-table-name").fill(`точки ${tag}`); await t(anya, "new-table-go").click();
  await t(anya, "table").waitFor({ timeout: 30000 }); await look(anya, "свой стол");
  await t(boris, "nav-inbox").click(); await t(boris, "nav-feed").click();
  const card = t(boris, "table-card").filter({ hasText: `точки ${tag}` }); await card.waitFor({ timeout: 30000 });
  await look(boris, "лента со столом");
  await t(boris, "nav-tables").click(); await boris.locator('[data-screen="tables"]').waitFor(); await card.waitFor({ timeout: 30000 }); await look(boris, "столы со столом"); await card.click(); await t(boris, "table").waitFor({ timeout: 30000 }); await look(boris, "чужой стол");
  await t(boris, "line-input").fill("сыграю"); await t(boris, "apply").click();
  await anya.getByTestId("table").filter({ hasText: "заявка" }).waitFor({ timeout: 15000 }); await look(anya, "стол с заявкой");
  await t(anya, "start-game").click(); await anya.waitForTimeout(1500); await look(anya, "партия началась"); await look(boris, "партия началась");
  const turnOf = async (p) => ((await t(p, "turn").isVisible()) ? await t(p, "turn").textContent() : "—");
  for (let m = 0; m < 12; m++) {
    if ((await t(anya, "over").isVisible()) || !(await t(anya, "turn").isVisible())) break;
    const mine = (await turnOf(anya)).startsWith("ваш ход");
    const mover = mine ? anya : boris; const n = await mover.locator("[data-taken]").count();
    const edge = mover.getByRole("button", { name: /^линия: ряд \d+, колонка \d+, по (горизонтали|вертикали)$/ }).first();
    const name = await edge.getAttribute("aria-label");
    await edge.click();
    // Counted, as e2e counts it: a taken edge is an SVG mark, not a "visible" box.
    let moved = false;
    for (let i = 0; i < 75 && !moved; i++) { moved = (await mover.locator("[data-taken]").count()) > n; if (!moved) await mover.waitForTimeout(200); }
    const said = (await mover.locator('[role="alert"], .error').allTextContents()).join(" / ");
    console.log(`  ход ${m + 1}: ${mover.who} жмёт «${name}», занято было ${n}, ${moved ? "засчитан" : "НЕ засчитан за 15 с"}; занято теперь у Ани ${await anya.locator("[data-taken]").count()}, у Бориса ${await boris.locator("[data-taken]").count()}; ход: «${await turnOf(anya)}» / «${await turnOf(boris)}»${said ? `; экран: «${said}»` : ""}`);
    if (!moved) throw new Error(`ход ${m + 1} не засчитан`);
  }
  await t(anya, "over").waitFor({ timeout: 15000 }).catch(() => {}); await look(anya, "после последнего хода"); await look(boris, "после последнего хода");
});
await step("me", async () => {
  // Out of the table the way a person leaves an app: open the page again; the vault asks for the PIN.
  if (!(await t(anya, "tab-me").isVisible())) {
    await anya.goto(BASE + "/"); await anya.waitForTimeout(500); await look(anya, "страница открыта заново");
    if (await anya.locator('[data-screen="unlock"]').isVisible()) { await t(anya, "unlock-pin").fill(PIN); await t(anya, "unlock").click(); }
  }
  await t(anya, "tab-me").click(); await anya.locator('[data-screen="me"]').waitFor(); await look(anya, "я");
  await t(anya, "me-name").click(); await t(anya, "edit-value").fill("Оля тг"); await t(anya, "edit-save").click();
  await t(anya, "error").waitFor({ timeout: 15000 }).catch(() => {}); await look(anya, "смена имени на «Оля тг»");
  await t(anya, "edit-back").click();
});
await step("age filter", async () => {
  // F20 (age-filter.spec.ts): the handles inside the band, saved, opened again on what was saved, then the open edge back.
  await t(anya, "tab-me").click(); await t(anya, "me-filter").click(); await anya.locator('[data-screen="age-filter"]').waitFor(); await look(anya, "возрастной фильтр, как есть");
  await t(anya, "filter-from").fill("30"); await t(anya, "filter-to").fill("40"); await look(anya, "фильтр 30 — 40");
  await t(anya, "filter-save").click(); await anya.locator('[data-screen="me"]').waitFor({ timeout: 15000 });
  await t(anya, "me-filter").click(); await look(anya, "фильтр открыт заново");
  await t(anya, "filter-to").fill("99"); await look(anya, "правый край без ограничения");
  await t(anya, "filter-save").click(); await anya.locator('[data-screen="me"]').waitFor({ timeout: 15000 });
});
await step("theme", async () => {
  // F20 (theme.spec.ts): the choice of a theme from «я», one picked, then back to auto.
  await t(anya, "me-theme").click(); await anya.locator('[data-screen="theme"]').waitFor(); await look(anya, "темы");
  await t(anya, "theme-violet").click(); await look(anya, "тема violet");
  await t(anya, "theme-auto").click(); await look(anya, "тема auto");
  await t(anya, "back").click(); await anya.locator('[data-screen="me"]').waitFor();
});
await step("hidden phrase", async () => {
  // F20 (lists.spec.ts): hide a neighbour's phrase from its card, find it in «скрытое», bring it back.
  await t(anya, "nav-feed").click(); await anya.locator('[data-screen="feed"]').waitFor();
  const card = t(anya, "card").filter({ hasText: `иду к мосту с собакой ${tag}` }); await card.first().waitFor({ timeout: 30000 });
  await card.first().click(); await look(anya, "карточка перед скрытием");
  await t(anya, "hide").click();
  await t(anya, "tab-me").click(); await anya.locator('[data-screen="me"]').waitFor(); await t(anya, "me-hidden").click();
  await t(anya, "hidden-row").first().waitFor({ timeout: 15000 }); await look(anya, "скрытое, одна фраза");
  await t(anya, "hidden-restore").click(); await t(anya, "hidden-empty").waitFor({ timeout: 15000 }); await look(anya, "скрытое, пусто");
  await t(anya, "back").click();
});
await step("legal", async () => {
  // F21 (legal.spec.ts): «я» → документы, everything accepted at registration.
  await anya.locator('[data-screen="me"]').waitFor(); await t(anya, "me-legal").click();
  await anya.locator('[data-screen="legal"]').waitFor(); await look(anya, "документы");
  await t(anya, "back").click().catch(() => {});
});
await step("place", async () => {
  // Where you are (owner 11.10.2026): the feed's place button, a city typed in Russian, the feed renamed.
  await t(anya, "nav-feed").click(); await anya.locator('[data-screen="feed"]').waitFor();
  await t(anya, "place").click(); await anya.locator('[data-screen="place"]').waitFor(); await look(anya, "где вы");
  await t(anya, "place-search").fill("Лимассол"); await t(anya, "place-city").first().waitFor({ timeout: 10000 }); await look(anya, "город «Лимассол»");
  await t(anya, "place-city").first().click(); await anya.locator('[data-screen="feed"]').waitFor(); await look(anya, "лента в Лимассоле");
  await t(anya, "place").click(); await t(anya, "place-point").fill("34.6719, 33.0436"); await t(anya, "place-use").click();
  await anya.locator('[data-screen="feed"]').waitFor(); await look(anya, "лента по координатам");
});
await step("lock and unlock", async () => {
  // F19 (idle-lock.spec.ts, unlock-*.spec.ts): the page opened again asks the PIN (a wrong one, then the right one),
  // then three seconds of idle lock it to one line (the stand's xor-idle-ms), a wrong PIN, the right one.
  await anya.evaluate(() => sessionStorage.setItem("xor-idle-ms", "3000"));
  await anya.goto(BASE + "/"); await t(anya, "unlock-pin").waitFor({ timeout: 20000 }); await look(anya, "ПИН при входе");
  await t(anya, "unlock-pin").fill("000000"); await t(anya, "unlock").click();
  await t(anya, "error").waitFor({ timeout: 15000 }).catch(() => {}); await look(anya, "неверный ПИН при входе");
  await t(anya, "unlock-pin").fill(PIN); await t(anya, "unlock").click();
  await anya.locator('[data-screen="feed"]').waitFor({ timeout: 30000 }); await look(anya, "лента после входа");
  await anya.locator('[data-screen="locked"]').waitFor({ timeout: 20000 }); await look(anya, "замок после простоя");
  await t(anya, "lock-pin").fill("000000"); await t(anya, "lock-go").click();
  await t(anya, "error").waitFor({ timeout: 15000 }).catch(() => {}); await look(anya, "неверный ПИН у замка");
  await anya.evaluate(() => sessionStorage.setItem("xor-idle-ms", "600000"));
  await t(anya, "lock-pin").fill(PIN); await t(anya, "lock-go").click();
  await anya.locator('[data-screen="feed"]').waitFor({ timeout: 20000 }); await look(anya, "лента после замка");
});
await step("offline", async () => {
  // F24: the node out of reach — what a person sees when the inbox is opened with no network, and after it returns.
  const ctx = anya.context();
  try {
    await ctx.setOffline(true);
    await t(anya, "nav-inbox").click(); await anya.waitForTimeout(1500); await look(anya, "входящие без сети");
    await t(anya, "nav-feed").click(); await anya.waitForTimeout(1500); await look(anya, "лента без сети");
  } finally { await ctx.setOffline(false); }
  await t(anya, "nav-inbox").click(); await anya.waitForTimeout(1500); await look(anya, "входящие, сеть вернулась");
});
await step("end and block", async () => {
  // F10 (chat-block.spec.ts, lists.spec.ts, mixed-chat-end.spec.ts): end asked and declined, block asked and declined,
  // block for real, the other side's inbox, then the blocked list and the lifting. The only chat is gone after this.
  await t(anya, "nav-inbox").click();
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').first().click({ timeout: 20000 });
  await anya.waitForSelector('[data-screen="chat"][data-keys="open"]', { timeout: 30000 });
  await chatMenu(anya); await t(anya, "end").click(); await t(anya, "end-confirm").waitFor(); await look(anya, "завершить беседу, спрашивает");
  await t(anya, "end-no").click();
  await chatMenu(anya); await t(anya, "block").click(); await t(anya, "block-confirm").waitFor(); await look(anya, "заблокировать, спрашивает");
  await t(anya, "block-no").click();
  await chatMenu(anya); await t(anya, "block").click(); await t(anya, "block-yes").click();
  await t(anya, "tombstone").waitFor({ timeout: 15000 }); await look(anya, "после блока: Аня");
  await t(boris, "nav-inbox").click(); await boris.waitForTimeout(2500); await look(boris, "после блока: Борис");
  await t(anya, "back").click(); await t(anya, "tab-me").click(); await anya.locator('[data-screen="me"]').waitFor();
  await t(anya, "me-blocked").click(); await t(anya, "blocked-row").first().waitFor({ timeout: 15000 }); await look(anya, "заблокированные");
  await t(anya, "blocked-lift").click(); await anya.waitForTimeout(1000); await look(anya, "после снятия блока");
  await t(anya, "back").click();
});
await step("step away", async () => {
  // F20 (me.spec.ts, chat-away.spec.ts): «отойти» with the price, gone, back early (asked twice).
  await t(anya, "tab-me").click(); await anya.locator('[data-screen="me"]').waitFor(); await t(anya, "me-away").click();
  await anya.locator('[data-screen="step-away"]').waitFor(); await look(anya, "отойти, срок не выбран");
  await t(anya, "away-short").click(); await t(anya, "away-price").waitFor({ timeout: 15000 }); await look(anya, "отойти, цена");
  await t(anya, "away-go").click(); await anya.locator('[data-screen="away"]').waitFor({ timeout: 15000 }); await look(anya, "отошла");
  await t(anya, "away-return").click(); await t(anya, "away-sure").waitFor(); await look(anya, "вернуться, спрашивает");
  await t(anya, "away-return").click(); await anya.locator('[data-screen="feed"]').waitFor({ timeout: 15000 }); await look(anya, "лента после возврата");
});
await step("restore on a new device", async () => {
  const fresh = await phone("Аня, новое устройство");
  await fresh.goto(BASE + "/"); await t(fresh, "restore").click(); await look(fresh, "восстановление");
  await t(fresh, "restore-code").locator("input").first().fill("0000 0000 0000 0000"); await t(fresh, "restore-pin").fill("975310"); await t(fresh, "restore-pin-again").fill("975310");
  await t(fresh, "restore-go").click(); await t(fresh, "error").waitFor({ timeout: 30000 }).catch(() => {}); await look(fresh, "неверный код");
  await t(fresh, "restore-code").locator("input").first().fill(code.join(" ")); await t(fresh, "restore-go").click();
  await fresh.locator('[data-screen="feed"]').waitFor({ timeout: 45000 }); await look(fresh, "после восстановления");
});
await step("reissue paper code", async () => {
  // F18 (reissue.spec.ts): the current code checked, the new one shown and typed back. Reset (wipes the identity) is not walked.
  await t(anya, "tab-me").click(); await anya.locator('[data-screen="me"]').waitFor(); await t(anya, "me-reissue").click();
  await anya.locator('[data-screen="reissue-1"]').waitFor(); await look(anya, "новый бумажный код, шаг 1");
  await t(anya, "reissue-current").locator("input").first().fill("0000 0000 0000 0000"); await t(anya, "reissue-next").click();
  await t(anya, "error").waitFor({ timeout: 30000 }).catch(() => {}); await look(anya, "неверный текущий код");
  await t(anya, "reissue-current").locator("input").first().fill(code.join(" ")); await t(anya, "reissue-next").click();
  await anya.locator('[data-screen="reissue-2"]').waitFor({ timeout: 30000 }); await look(anya, "новый код показан");
  const fresh = (await t(anya, "reissue-code").textContent()).trim().split(" ");
  await t(anya, "reissue-groups").locator("input").first().fill(fresh[1]); await t(anya, "reissue-groups").locator("input").last().fill(fresh[3]);
  await t(anya, "reissue-confirm").click(); await anya.locator('[data-screen="me"]').waitFor({ timeout: 30000 }); await look(anya, "я после нового кода");
  code = fresh;
});
await step("move to another device", async () => {
  // F17 (transfer.spec.ts): Boris leaves the old device and arrives on a new one; his old device lets go at the end.
  await t(boris, "nav-feed").click().catch(() => {}); await t(boris, "tab-me").click(); await boris.locator('[data-screen="me"]').waitFor();
  await t(boris, "me-move").click(); await boris.locator('[data-screen="departure"]').waitFor(); await look(boris, "уход со старого устройства");
  await t(boris, "move-pin").fill(PIN); await t(boris, "move-go").click();
  const mv = (await t(boris, "move-code").locator("code").textContent({ timeout: 30000 })).trim(); await look(boris, "код переезда");
  const fresh = await phone("Борис, новое устройство");
  await fresh.goto(BASE + "/"); await t(fresh, "arrive").click(); await fresh.locator('[data-screen="arrival"]').waitFor(); await look(fresh, "приезд, код не введён");
  await t(fresh, "arrive-code").fill(mv.toLowerCase().replace(/ /g, "-")); await t(fresh, "arrive-go").click();
  await t(fresh, "arrive-check").waitFor({ timeout: 45000 }); await look(fresh, "приезд, ждём старое устройство");
  await t(boris, "move-check").waitFor({ timeout: 30000 }); await look(boris, "старое устройство видит запрос");
  await t(boris, "move-yes").click(); await t(boris, "move-done").waitFor({ timeout: 30000 }); await look(boris, "старое устройство отпустило");
  await t(fresh, "arrive-pin").waitFor({ timeout: 30000 }); await look(fresh, "приезд, новый ПИН");
  await t(fresh, "arrive-pin").fill("864209"); await t(fresh, "arrive-pin-again").fill("864209"); await t(fresh, "arrive-keep").click();
  await fresh.locator('[data-screen="feed"]').waitFor({ timeout: 45000 }); await look(fresh, "лента на новом устройстве");
});
await step("english", async () => {
  const en = await phone("Guest EN", "en-US", false); await en.goto(BASE + "/"); await look(en, "language list, browser in English");
  await t(en, "lang-en").click(); await t(en, "start").waitFor(); await look(en, "splash, browser in English");
  await t(en, "start").click(); await look(en, "who are you");
});
if (process.env.WALK_SHOTS || process.env.WALK_SVG) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/shots/index.json", JSON.stringify(SHOT.list, null, 1));
}
if (process.env.WALK_SVG) {
  // A page to leaf through the steps in order: each SVG as an <img> (a browser draws foreignObject there too).
  const { writeFileSync } = await import("node:fs");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const items = SHOT.list.map((x) => `<figure><figcaption>${x.n} · ${esc(x.who)} · ${esc(x.step)} · [${esc(x.screen)}]</figcaption><img src="${encodeURI(x.file)}" loading="lazy"></figure>`).join("\n");
  writeFileSync("/shots/index.html", `<!doctype html><meta charset="utf-8"><title>walk</title><style>body{font:14px system-ui;margin:16px;background:#888}figure{margin:0 0 24px}img{display:block;max-width:100%;background:#fff}figcaption{color:#fff;margin:4px 0}</style>\n${items}\n`);
}
console.log("\nWALK END");
await b.close();
