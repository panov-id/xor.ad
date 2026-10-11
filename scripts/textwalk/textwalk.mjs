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

async function phone(who, locale = "ru-RU") {
  // WALK_WIDTH: phone 393 by default; 768 tablet, 1440 desktop, 2560/3440 wide (owner, 11.10.2026).
  const w = Number(process.env.WALK_WIDTH || 393);
  const h = w <= 500 ? 851 : w <= 1100 ? 1024 : w <= 2000 ? 900 : 1440;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale });
  const p = await ctx.newPage();
  p.who = who;
  p.on("pageerror", (e) => console.log(`  ! ${who} pageerror: ${String(e).slice(0, 200)}`));
  p.on("console", (m) => { if (m.type() === "error") console.log(`  ! ${who} console: ${m.text().slice(0, 200)}`); });
  p.on("response", (r) => {
    if (r.status() >= 400) console.log(`  ! ${who} http ${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`);
  });
  return p;
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

const anya = await phone("Аня");
const boris = await phone("Борис");
let code = [];
let tag = process.env.WALK_STABLE ? "w1" : Date.now().toString(36).slice(-3);

await step("splash", async () => { await anya.goto(BASE + "/"); await look(anya, "заставка"); });
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
  await anya.locator('[data-screen="feed"]').waitFor({ timeout: 30000 }); await look(anya, "первая лента");
});
await step("boris register", async () => {
  await boris.goto(BASE + "/"); await t(boris, "start").click();
  await t(boris, "name").fill("Борис"); await t(boris, "age").fill("31"); await boris.getByRole("checkbox").check(); await t(boris, "next").click();
  await t(boris, "pin").fill(PIN); await t(boris, "pin-again").fill(PIN); await t(boris, "register").click();
  const c = (await t(boris, "paper-code").textContent()).trim().split(" ");
  await boris.getByTestId("paper-groups").locator("input").first().fill(c[1]); await boris.getByTestId("paper-groups").locator("input").last().fill(c[3]); await t(boris, "confirm").click();
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
  await t(anya, "refresh").click();
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').first().click({ timeout: 15000 });
  await anya.waitForSelector('[data-screen="chat"][data-keys="open"]', { timeout: 20000 });
  await look(anya, "чат открыт");
  await t(anya, "text").fill("привет! пошли вместе?"); await t(anya, "send").click();
  await boris.locator('[data-testid="theirs"]').last().waitFor({ timeout: 20000 }); await look(boris, "чат, пришла реплика");
  await t(boris, "text").fill("давай, через полчаса у моста"); await t(boris, "send").click();
  await anya.locator('[data-testid="theirs"]').last().waitFor({ timeout: 20000 }); await look(anya, "чат, пришёл ответ");
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
await step("place", async () => {
  // Where you are (owner 11.10.2026): the feed's place button, a city typed in Russian, the feed renamed.
  await t(anya, "nav-feed").click(); await anya.locator('[data-screen="feed"]').waitFor();
  await t(anya, "place").click(); await anya.locator('[data-screen="place"]').waitFor(); await look(anya, "где вы");
  await t(anya, "place-search").fill("Лимассол"); await t(anya, "place-city").first().waitFor({ timeout: 10000 }); await look(anya, "город «Лимассол»");
  await t(anya, "place-city").first().click(); await anya.locator('[data-screen="feed"]').waitFor(); await look(anya, "лента в Лимассоле");
  await t(anya, "place").click(); await t(anya, "place-point").fill("34.6719, 33.0436"); await t(anya, "place-use").click();
  await anya.locator('[data-screen="feed"]').waitFor(); await look(anya, "лента по координатам");
});
await step("restore on a new phone", async () => {
  const fresh = await phone("Аня, новый телефон");
  await fresh.goto(BASE + "/"); await t(fresh, "restore").click(); await look(fresh, "восстановление");
  await t(fresh, "restore-code").locator("input").first().fill("0000 0000 0000 0000"); await t(fresh, "restore-pin").fill("975310"); await t(fresh, "restore-pin-again").fill("975310");
  await t(fresh, "restore-go").click(); await t(fresh, "error").waitFor({ timeout: 30000 }).catch(() => {}); await look(fresh, "неверный код");
  await t(fresh, "restore-code").locator("input").first().fill(code.join(" ")); await t(fresh, "restore-go").click();
  await fresh.locator('[data-screen="feed"]').waitFor({ timeout: 45000 }); await look(fresh, "после восстановления");
});
await step("english", async () => {
  const en = await phone("Guest EN", "en-US"); await en.goto(BASE + "/"); await look(en, "splash, browser in English");
  await t(en, "start").click(); await look(en, "who are you");
});
if (process.env.WALK_SHOTS) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/shots/index.json", JSON.stringify(SHOT.list, null, 1));
}
console.log("\nWALK END");
await b.close();
