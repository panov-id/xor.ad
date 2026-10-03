// Every screen of the web face at 375x812, light and dark (WD0). Run by
// scripts/design/shoot-web.sh inside the stand's network: two people, Аня and
// Борис, walk the screens the way the e2e specs do (web/e2e/specs/helpers.ts),
// and each screen is shot once per scheme. A screen that does not open is a
// line in shots.tsv with the reason, and the walk goes on.
import { chromium } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const URL_ = process.env.WEB_URL ?? "http://localhost:4173";
// The stand's brand (VITE_BRAND, scripts/design/shoot-web.sh): every shot is <brand>-<screen>-<theme>.png.
const BRAND = process.env.BRAND === "neighbro" ? "neighbro" : "sosed";
// The brand's two themes the gate measures: its light one and its night pair (web/themes/<brand>/light.json).
const THEMES_ = ["light", process.env.NIGHT || "dark"];
const OUT = "/out";
const PIN = "123456";
const T = 30000;
const rows = [];

const ADV = process.env.ADV_URL ?? "https://web-adv:4173";
const MAILPIT = process.env.MAILPIT_URL ?? "http://mailpit:8025";

const browser = await chromium.launch();
let ip = 10;
async function person(base = URL_) {
  const context = await browser.newContext({
    baseURL: base,
    // The cabinet's service is https with the stand's own certificate.
    ignoreHTTPSErrors: true,
    // A shot is one frame: the splash's icons come and go, and two shoots
    // caught two frames (4.97% and 12.06% off the sheet, WD6c). Under reduced
    // motion they stand, as on the sheet's second phone of screen 01.
    reducedMotion: "reduce",
    // The page's CSP (style-src 'self') drops an inserted <style>, so the
    // control break below is let through — only when it is asked for.
    bypassCSP: process.env.WEB_BREAK === "pad8",
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    // The stand's node counts registrations per address (web/e2e/fixtures/address.ts).
    extraHTTPHeaders: { "x-origin-token": "web-test-origin-token", "x-client-ip": `203.0.113.${ip++}` },
  });
  // The theme is forced, not left to the place's phase or prefers-color-scheme:
  // the light theme chosen by hand (theme.ts, localStorage theme:<brand>) from
  // the first paint; shoot() switches it for the night shot and back.
  await context.addInitScript((brand) => { try { localStorage.setItem(`theme:${brand}`, "light"); } catch { /* none */ } }, BRAND);
  // The gate's control break (scripts/test_check-web-design.sh): every screen's
  // left padding 8 wider, drawn by the page itself, not faked in the image.
  if (process.env.WEB_BREAK === "pad8") {
    await context.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = ".screen { padding-left: 24px !important; }";
      document.head.append(s);
    }));
  }
  return context.newPage();
}

const screen = (page, name) => page.locator(`[data-screen="${name}"]`);
const id = (page, t) => page.getByTestId(t);
async function seen(locator) { await locator.first().waitFor({ state: "visible", timeout: T }); }

async function shoot(page, name) {
  // No focus ring in a shot: a field typed into last keeps its ring, which no
  // sheet draws (Cabinet-sign-in and every screen with a field, WD6e).
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const force = (id) => page.evaluate(([brand, theme]) => {
    localStorage.setItem(`theme:${brand}`, theme);
    document.documentElement.dataset.theme = theme;
  }, [BRAND, id]);
  for (const theme of THEMES_) {
    await force(theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${BRAND}-${name}-${theme}.png` });
  }
  await force("light");
}

// One screen: get there, shoot, write the line; a failure is a line too.
async function step(name, page, reach) {
  try {
    await reach();
    await shoot(page, name);
    rows.push([name, "ok", ""]);
    console.log(`  ok  ${name}`);
  } catch (e) {
    const why = String(e.message ?? e).split("\n")[0].slice(0, 200);
    rows.push([name, "not opened", why]);
    console.log(`  --  ${name}: ${why}`);
  }
}

// The like on an open card, as the brand gives it (web/e2e/specs/helpers.ts
// pressLike): sosed's button; neighbro's heart tapped, then the card — the like
// goes after the 5 s undo window.
async function like(page) {
  if (BRAND === "neighbro") { await id(page, "heart").click(); await id(page, "heart-target").click(); }
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
  await id(page, "consent").check();
  if (shots) await shoot(page, "Register-1");
  await id(page, "next").click();
  await seen(screen(page, "register-2"));
  await id(page, "pin").fill(PIN);
  await id(page, "pin-again").fill(PIN);
  if (shots) await shoot(page, "Register-2");
  await id(page, "register").click();
  await seen(page.locator('[data-screen="register-3"], [data-testid="error"]'));
  if (await id(page, "error").isVisible()) throw new Error(`registration refused: ${await id(page, "error").textContent()}`);
  if (shots) await step("Register", page, async () => {});
  const code = (await id(page, "paper-code").textContent()).trim().split(" ");
  await id(page, "group-2").fill(code[1]);
  await id(page, "group-4").fill(code[3]);
  await id(page, "confirm").click();
  await seen(screen(page, "feed"));
  await id(page, "loading").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return code;
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
const run = Date.now().toString(36);
const aText = `гуляю у реки, если кто рядом ${run}`;
const bText = `иду к реке ${run}`;

await register(anya, "Аня", "28", true);
await register(boris, "Борис", "31", false);

await step("Feed", anya, async () => { await write(boris, bText); await home(anya); });
await step("Composer", anya, async () => {
  await id(anya, "write").click();
  await seen(screen(anya, "composer"));
  await id(anya, "text").fill(aText);
});
await id(anya, "send").click().catch(() => {});
await anya.locator('[data-testid="sent"][data-state="published"]').waitFor({ timeout: 15000 }).catch(() => {});
await step("Card", anya, async () => { await openCard(anya, bText); });
// Card-more: sosed's details pulled down (the peek), neighbro's heart picked
// up over the card; put back after the shot.
await step("Card-more", anya, async () => { await id(anya, BRAND === "neighbro" ? "heart" : "peek").click(); await anya.waitForTimeout(300); });
await id(anya, BRAND === "neighbro" ? "heart" : "peek").click().catch(() => {});
await step("Card-liked", anya, async () => { await like(anya); await seen(id(anya, "liked")); });
await step("Likes", boris, async () => {
  await home(boris);
  await id(boris, "likes").click();
  await seen(screen(boris, "likes"));
});
await step("Card-matched", boris, async () => {
  await home(boris);
  await openCard(boris, aText);
  await like(boris);
  await seen(id(boris, "matched"));
});
await step("Inbox", anya, async () => {
  await home(anya);
  await id(anya, "nav-inbox").click();
  await seen(id(anya, "match").filter({ hasText: "Борис" }));
});
await step("Match", anya, async () => {
  await id(anya, "match").filter({ hasText: "Борис" }).getByTestId("open-match").click();
  await seen(screen(anya, "match"));
});
await step("Match-waiting", anya, async () => { await id(anya, "talk").click(); await seen(id(anya, "waiting")); });
await step("Chat", boris, async () => {
  await home(boris);
  await id(boris, "nav-inbox").click();
  await id(boris, "match").filter({ hasText: "Аня" }).getByTestId("open-match").click();
  await seen(screen(boris, "match"));
  await id(boris, "talk").click();
  await seen(screen(boris, "inbox"));
  await seen(id(boris, "chat"));
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await boris.locator('[data-screen="chat"][data-keys="open"]').waitFor({ timeout: T });
  await id(boris, "text").fill("привет").catch(() => {});
  await id(boris, "text").press("Enter").catch(() => {});
  await boris.waitForTimeout(1000);
});
await step("ChatGame", boris, async () => {
  await id(boris, "game-toggle").click();
  await boris.waitForTimeout(1500);
});

await step("Me", anya, () => toMe(anya));
await step("Me-edit-name", anya, () => toMe(anya, "me-name", "edit-name"));
await step("Hidden", anya, () => toMe(anya, "me-hidden", "hidden"));
await step("Me-away", anya, () => toMe(anya, "me-away", "step-away"));
await step("Me-pin", anya, () => toMe(anya, "me-pin", "change-pin"));
await step("Departure", anya, () => toMe(anya, "me-move", "departure"));
await step("Reissue", anya, async () => {
  await toMe(anya, "me-reissue", "reissue-1").catch(async () => {
    await seen(anya.locator('[data-screen^="reissue-"]'));
  });
});
await step("Me-reset", anya, () => toMe(anya, "me-reset", "reset"));
await step("Unlock", anya, async () => { await anya.goto("/"); await seen(screen(anya, "unlock")); });

// A table stands among phrases (web/e2e/specs/helpers.ts twoAtATable): two
// more of Аня's before she sets it.
await home(anya);
for (const text of ["кто на пляж?", "ищу компанию на ужин"]) await write(anya, `${text} ${run}`).catch(() => {});
await step("NewTable", anya, async () => {
  await home(anya);
  await id(anya, "new-table").click();
  await seen(screen(anya, "new-table"));
  await id(anya, "new-table-name").fill(`вечер ${run}`);
});
await step("Table", anya, async () => {
  await id(anya, "new-table-go").click();
  await seen(id(anya, "table"));
});
// Аня stays at her table; Борис sits by its card and applies, she starts the
// game, and the board is what she sees.
await step("TableBoards", anya, async () => {
  await home(boris);
  await id(boris, "nav-inbox").click();
  await id(boris, "nav-feed").click();
  const card = id(boris, "table-card").filter({ hasText: `вечер ${run}` });
  await seen(card);
  await card.click();
  await seen(id(boris, "table"));
  await id(boris, "line-input").fill("сыграю");
  await id(boris, "apply").click();
  await id(anya, "table").filter({ hasText: "заявка" }).waitFor({ timeout: 15000 });
  await id(anya, "start-game").click({ timeout: 15000 });
  await id(anya, "turn").filter({ hasNotText: "партия ещё не началась" }).waitFor({ timeout: 15000 });
});

// Blocked: Вера writes, Борис blocks her from her card — Аня's card left his
// feed with the match, so she is not the one to block.
const vera = await person();
await step("Blocked", boris, async () => {
  const vText = `кто со мной на рынок ${run}`;
  await register(vera, "Вера", "40", false);
  await write(vera, vText);
  await home(boris);
  await openCard(boris, vText);
  await id(boris, "block").click();
  await id(boris, "block-confirm-yes").click();
  await toMe(boris, "me-blocked", "blocked");
});

// Statements: a new identity has none, and the web cannot give itself one.
// Аня's identity goes to /out/statement.want; shoot-web.sh writes one
// statement to the stand's database for it and answers with statement.done.
await step("Statements", anya, async () => {
  const identity = await anya.evaluate(() => new Promise((done, fail) => {
    const req = indexedDB.open("xor-vault", 1);
    req.onerror = () => fail(req.error);
    req.onsuccess = () => {
      const get = req.result.transaction("identity").objectStore("identity").get("me");
      get.onsuccess = () => done(get.result?.identityId ?? "");
      get.onerror = () => fail(get.error);
    };
  }));
  if (!identity) throw new Error("no identity in the vault");
  writeFileSync(`${OUT}/statement.want`, identity);
  for (let i = 0; i < 60 && !existsSync(`${OUT}/statement.done`); i++) await anya.waitForTimeout(500);
  if (!existsSync(`${OUT}/statement.done`)) throw new Error("no statement written for the identity (statement.done)");
  // Unlocked with a statement waiting, the face opens it before the feed (App.tsx).
  await anya.goto("/");
  await seen(screen(anya, "unlock"));
  await id(anya, "unlock-pin").fill(PIN);
  await id(anya, "unlock").click();
  await seen(screen(anya, "statements"));
});

// The venue's cabinet (sheets 17 and 26): the sign-in, "sent", then in by the
// letter's link from Mailpit, as web/e2e/specs/adv.spec.ts does.
const venue = await person(ADV);
const email = `shoot-${run}@example.test`;
const venueName = `Пекарня «Колос» ${run}`;
await step("Cabinet-sign-in", venue, async () => {
  await venue.goto("/adv");
  await seen(screen(venue, "adv-sign-in"));
  await id(venue, "adv-email").fill(email);
  await id(venue, "adv-contact").fill("Мария, +357 99 000000");
});
await step("Cabinet-sent", venue, async () => {
  await id(venue, "adv-send").click();
  await seen(id(venue, "adv-sent"));
});
await step("Cabinet-venues", venue, async () => {
  let token = "";
  for (let i = 0; i < 30 && !token; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const mid = found.messages?.[0]?.ID;
    if (mid) {
      const letter = await (await fetch(`${MAILPIT}/api/v1/message/${mid}`)).json();
      token = /https:\/\/adv\.(?:sosed|neighbro)\.place\/enter#([0-9a-f]{64})/.exec(`${letter.Text ?? ""} ${letter.HTML ?? ""}`)?.[1] ?? "";
    }
    if (!token) await venue.waitForTimeout(500);
  }
  if (!token) throw new Error(`no sign-in letter reached ${email}`);
  await venue.goto(`/adv/enter#${token}`);
  await seen(screen(venue, "adv-venues"));
  // A venue, as sheet 17's second phone has one: added, not yet proved.
  await id(venue, "venue-name").fill(venueName);
  await id(venue, "venue-address").fill("Макариу 12, Лимасол");
  await id(venue, "venue-lat").fill("34.6786");
  await id(venue, "venue-lon").fill("33.0413");
  await id(venue, "venue-add").click();
  await id(venue, "venue").filter({ hasText: venueName }).getByTestId("venue-status").filter({ hasText: "не подтверждена" }).waitFor({ timeout: 15000 });
});

// The cabinet is measured with its data, not empty (WD6b): the venue proved by
// its envelope — the code is read from the stand's database by shoot-web.sh,
// as web/e2e/specs/adv.spec.ts reads it — and an offer published.
await step("Cabinet-new-offer", venue, async () => {
  const card = id(venue, "venue").filter({ hasText: venueName });
  await card.getByTestId("venue-envelope").click();
  await card.getByTestId("venue-code").waitFor({ timeout: 15000 });
  writeFileSync(`${OUT}/envelope.want`, venueName);
  for (let i = 0; i < 60 && !existsSync(`${OUT}/envelope.code`); i++) await venue.waitForTimeout(500);
  if (!existsSync(`${OUT}/envelope.code`)) throw new Error("no envelope code read for the venue (envelope.code)");
  const code = readFileSync(`${OUT}/envelope.code`, "utf-8").trim();
  await card.getByTestId("venue-code").fill(code.toLowerCase().replace("-", " "));
  await card.getByTestId("venue-verify").click();
  await card.getByTestId("venue-status").filter({ hasText: /^подтверждена$/ }).waitFor({ timeout: 15000 });
  await id(venue, "adv-tab-offers").click();
  await id(venue, "offer-new").click();
  await id(venue, "offer-venue").waitFor({ timeout: 15000 });
  await id(venue, "offer-text").fill("Второй круассан за полцены");
  await id(venue, "offer-discount").fill("−20 %");
  await id(venue, "offer-conditions").fill("при заказе от двух");
  await id(venue, "offer-promo").fill("КОЛОС20");
  await id(venue, "offer-url").fill("https://kolos.example/");
});
await step("Cabinet-offers", venue, async () => {
  await id(venue, "offer-preview").click();
  await id(venue, "offer-publish").click();
  await id(venue, "offer-published").waitFor({ timeout: 15000 });
  await id(venue, "offer-to-list").click();
  await id(venue, "adv-offer").filter({ hasText: "Второй круассан" }).getByTestId("adv-offer-state").filter({ hasText: "в ленте" }).waitFor({ timeout: 15000 });
});

const stranger = await person();
await step("Offer", stranger, async () => {
  await stranger.goto("/o/webtestlive0001");
  await seen(screen(stranger, "offer-exit"));
  await stranger.waitForTimeout(500);
});
await step("Restore", stranger, async () => {
  await stranger.goto("/");
  await seen(screen(stranger, "splash"));
  await id(stranger, "restore").click();
  await seen(screen(stranger, "restore"));
});
await step("Arrival", stranger, async () => {
  await stranger.goto("/");
  await seen(screen(stranger, "splash"));
  await id(stranger, "arrive").click();
  await seen(screen(stranger, "arrival"));
});

writeFileSync(`${OUT}/shots.tsv`, rows.map((r) => r.join("\t")).join("\n") + "\n");
await browser.close();
console.log(`${rows.filter((r) => r[1] === "ok").length} ok, ${rows.filter((r) => r[1] !== "ok").length} not opened`);
