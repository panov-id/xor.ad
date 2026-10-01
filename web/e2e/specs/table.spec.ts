// A dots table in the web, all by the screen (W8, W11, W15): Женя sets it from
// the feed, Аня sits by its card and applies, Женя starts the game; whoever
// the node says moves takes an edge by clicking it, and the other one's screen
// shows it taken. The table's own link /t/<id> opens it after the PIN.

import { expect, test } from "../fixtures/address.ts";
import { newTable, PIN, register, runLabel, unlock, twoAtATable, writePhrase } from "./helpers.ts";

// The node as the e2e process reaches it (network_mode service:web), and a
// panel session as the node signs one (moderation-path.spec.ts panelToken).
const NODE_URL = process.env.WEB_NODE_URL ?? "http://node:8080";
const SECRET = process.env.PANEL_SESSION_SECRET ?? "";
const ENV_NAME = process.env.PANEL_ENV_NAME ?? "test";
async function panelToken(): Promise<string> {
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const enc = new TextEncoder();
  const header = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64(enc.encode(JSON.stringify({
    sub: "moderator@webtest.invalid", role: "moderator", brand: null, env: ENV_NAME, exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64(sig)}`;
}

// W13-TN · a table's name the rules flag waits for the queue; the moderator
// refuses it (POST /admin/table-queue/names/:id/refuse — the panel has no page
// for tables yet, so the decision goes to the node as the panel would send
// it); the author's open table hears the name_verdict frame and says the name
// was not accepted, while the table goes on without one (chat spec §6.1).
test("a refused table name is said to the author on the table, which lives on without one", async ({ browser }) => {
  expect(SECRET, "the stand's panel session secret (docker-compose.web.yml e2e)").toBeTruthy();
  test.setTimeout(120_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  zhenya.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  await register(zhenya, { name: "Женя", age: "30" });
  const run = runLabel();
  for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) await writePhrase(zhenya, `${text} ${run}`);
  // "тг" is the messenger as people write it: the rules flag it, the name waits.
  await newTable(zhenya, { name: `пиши в тг ${run}`, kind: "dots", set: "2x2" });
  const table = zhenya.getByTestId("table");
  const id = (await table.getAttribute("data-id"))!;
  await expect(table).not.toContainText(`пиши в тг ${run}`);
  await expect(zhenya.getByTestId("table-name-refused")).toHaveCount(0);

  // The moderator refuses the name.
  const refused = await fetch(`${NODE_URL}/admin/table-queue/names/${id}/refuse`, {
    method: "POST", headers: { authorization: `Bearer ${await panelToken()}` },
  });
  expect(refused.status, `the node did not take the refusal: ${refused.status} ${await refused.text()}`).toBeLessThan(300);

  // The author hears it on the open table, and the table goes on.
  await expect(zhenya.getByTestId("table-name-refused"), "the author was not told the name was refused").toBeVisible({ timeout: 20000 });
  await expect(zhenya.getByTestId("table-name-refused")).toHaveText("имя стола не принято — стол живёт без имени");
  await expect(table).toHaveAttribute("data-id", id);
  await expect(table).not.toContainText(`пиши в тг ${run}`);
  await expect(zhenya.getByTestId("turn")).toBeVisible();
});

test("a dots game begun on the screen, a move on one screen shows on the other, and the link opens it after the PIN", async ({ browser }) => {
  test.setTimeout(180_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });
  await twoAtATable(zhenya, anya, { name: `точки ${runLabel()}`, kind: "dots", set: "2x2" });
  await expect(zhenya.getByTestId("dots")).toBeVisible();
  await expect(zhenya.getByTestId("table")).toContainText("сидят");

  // Whoever's turn it is sees "ваш ход"; the other one the name.
  const mover = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход") ? zhenya : anya;
  const other = mover === zhenya ? anya : zhenya;
  await expect(mover.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await expect(other.locator("[data-taken]")).toHaveCount(0);
  // An edge is a button with a box of its own (W11), pressed as a person
  // presses it; its name says which edge.
  const edge = mover.getByRole("button", { name: /^ребро [hv]:\d+:\d+$/ }).first();
  await expect(edge).toHaveAttribute("aria-label", /^ребро /);
  await edge.click();
  await expect(other.locator("[data-taken]")).toHaveCount(1, { timeout: 15000 });
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });

  // The table's own link, after a reload: the PIN, then the same table.
  const id = (await zhenya.getByTestId("table").getAttribute("data-id"))!;
  await zhenya.evaluate(() => sessionStorage.clear());
  await zhenya.goto(`/t/${id}`);
  await unlock(zhenya, PIN);
  await expect(zhenya.getByTestId("table")).toHaveAttribute("data-id", id, { timeout: 30000 });
  await expect(zhenya.locator("[data-taken]")).toHaveCount(1, { timeout: 15000 });
});
