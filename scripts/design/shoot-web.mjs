// Every screen of the web face at 375x812, light and dark (WD0). Run by
// scripts/design/shoot-web.sh inside the stand's network: two people, Аня and
// Борис, walk the screens the way the e2e specs do (web/e2e/specs/helpers.ts),
// and each screen is shot once per scheme. A screen that does not open is a
// line in shots.tsv with the reason, and the walk goes on.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const URL_ = process.env.WEB_URL ?? "http://localhost:4173";
const OUT = "/out";
const PIN = "123456";
const T = 30000;
const rows = [];

const browser = await chromium.launch();
let ip = 10;
async function person() {
  const context = await browser.newContext({
    baseURL: URL_,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    // The stand's node counts registrations per address (web/e2e/fixtures/address.ts).
    extraHTTPHeaders: { "x-origin-token": "web-test-origin-token", "x-client-ip": `203.0.113.${ip++}` },
  });
  return context.newPage();
}

const screen = (page, name) => page.locator(`[data-screen="${name}"]`);
const id = (page, t) => page.getByTestId(t);
async function seen(locator) { await locator.first().waitFor({ state: "visible", timeout: T }); }

async function shoot(page, name) {
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
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
await step("Card-liked", anya, async () => { await id(anya, "like").click(); await seen(id(anya, "liked")); });
await step("Likes", boris, async () => {
  await home(boris);
  await id(boris, "likes").click();
  await seen(screen(boris, "likes"));
});
await step("Card-matched", boris, async () => {
  await home(boris);
  await openCard(boris, aText);
  await id(boris, "like").click();
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
  await home(anya);
  const back = id(anya, "table-card").filter({ hasText: `вечер ${run}` });
  if (await back.count()) await back.first().click();
  await seen(id(anya, "table"));
  await id(anya, "start-game").click({ timeout: 15000 });
  await anya.waitForTimeout(1500);
});

await step("Blocked", boris, async () => {
  await home(boris);
  await openCard(boris, aText);
  await id(boris, "block").click();
  await id(boris, "block-confirm-yes").click();
  await toMe(boris, "me-blocked", "blocked");
});
await step("Statements", anya, async () => {
  await toMe(anya, "me-statements", "statements");
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
