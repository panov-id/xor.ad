// The Telegram shell on the local stand. Telegram's own script runs against a stand-in for the native client (TelegramWebviewProxy).
// Proves: the script loads only for a page Telegram opened, the client gets ready, expand and the back button, the back button
// goes back, and the launch data reaches no request. Does not prove a real client's storage or geolocation: that needs a token.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:5174";
const SECRET = "SENTINELinitData";
const browser = await chromium.launch();
async function open(hash) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  const seen = [];
  page.on("request", (r) => seen.push(r.url() + JSON.stringify(r.headers()) + (r.postData() ?? "")));
  await page.addInitScript(() => { window.sent = []; window.TelegramWebviewProxy = { postEvent: (e, d) => window.sent.push([e, d]) }; });
  await page.goto(BASE + "/" + hash);
  await page.waitForSelector('[data-testid="splash-terms"]');
  return { page, seen };
}
const plain = await open("");
assert.ok(!plain.seen.some((r) => r.includes("telegram-web-app.js")), "a plain page got Telegram's script");
assert.equal(await plain.page.evaluate(() => window.sent.length), 0, "a plain page spoke to the client");
const { page, seen } = await open(`#tgWebAppData=${SECRET}&tgWebAppVersion=8.0&tgWebAppPlatform=android`);
const events = () => page.evaluate(() => window.sent.map((s) => s[0]));
assert.ok((await events()).includes("web_app_ready"), "no ready: " + (await events()));
assert.ok((await events()).includes("web_app_expand"), "no expand: " + (await events()));
await page.evaluate(() => history.pushState({ gate: "t", i: 1 }, "", "/t"));
const before = page.url();
await page.evaluate(() => window.Telegram.WebView.receiveEvent("back_button_pressed"));
await page.waitForFunction((u) => location.href !== u, before, { timeout: 5000 });
assert.ok(!page.url().includes(SECRET), "launch data stayed in the address: " + page.url());
await page.reload();
await page.waitForSelector('[data-testid="splash-terms"]');
assert.ok((await events()).includes("web_app_ready"), "the shell is off after a reload");
const leaked = seen.filter((r) => r.includes(SECRET));
assert.equal(leaked.length, 0, "launch data left the page: " + leaked[0]?.slice(0, 200));
// 18+ in Telegram; 13 stays elsewhere.
const LAUNCH = `#tgWebAppData=${SECRET}&tgWebAppVersion=8.0&tgWebAppPlatform=android`;
async function atAge(hash, age) {
  const { page: p } = await open(hash);
  await p.click('[data-testid="start"]');
  await p.waitForSelector('[data-screen="register-1"]');
  await p.fill('[data-testid="name"]', "Ana"); await p.check('[data-testid="consent"]');
  await p.fill('[data-testid="age"]', String(age));
  if (!(await p.locator('[data-testid="next"]').isEnabled())) return { p, passed: false };
  await p.click('[data-testid="next"]');
  return { p, passed: await p.waitForSelector('[data-screen="register-2"]', { timeout: 2500 }).then(() => true, () => false) };
}
assert.equal((await atAge(LAUNCH, 17)).passed, false, "17 passed registration in Telegram");
assert.equal((await atAge(LAUNCH, 18)).passed, true, "18 was refused in Telegram");
assert.equal((await atAge("", 13)).passed, true, "13 was refused outside Telegram");
// the entry: a seat whose profile says 15, in Telegram
const { p: young } = await atAge(LAUNCH, 18);
await young.route(/\/(profile|me)(\?|$)/, async (r) => { const a = await r.fetch(); const j = await a.json().catch(() => ({})); await r.fulfill({ response: a, json: { ...j, age: 15 } }); });
await young.fill('[data-testid="pin"]', "472913"); await young.waitForSelector('[data-screen="register-2b"]');
await young.fill('[data-testid="pin-again"]', "472913"); await young.waitForSelector('[data-screen="register-3"]', { timeout: 120000 });
const code = (await young.locator('[data-testid="paper-code"]').textContent()).replace(/[^A-Z0-9]/gi, "");
await young.click('[data-testid="wrote"]'); await young.waitForSelector('[data-screen="register-3-check"]');
const pair = (await young.locator('[data-testid="paper-groups"]').getAttribute("data-pair")).split(",").map(Number);
for (const [i, g] of pair.entries()) await young.locator('[data-testid="paper-groups"] input').nth(i).fill(code.slice((g - 1) * 4, g * 4));
await young.click('[data-testid="confirm"]');
await young.waitForSelector('[data-testid="telegram-young"]', { timeout: 30000 }).catch(() => assert.fail("a person of 15 entered in Telegram"));
console.log(`OK telegram shell: ${seen.length} requests, 0 with launch data; events ${(await events()).join(",").slice(0, 200)}`);
await browser.close();
