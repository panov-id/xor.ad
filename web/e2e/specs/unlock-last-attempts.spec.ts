// The last three attempts at the PIN (chat spec §8.2 :1331; W14-WP), against
// a live node: a wrong PIN after a reload says the attempts left and nothing
// more while they are many; on the last three it says what the tenth miss
// does — «После этого вход на этом устройстве закроется до бумажного кода» —
// and the right PIN still opens. The node's delays grow from the sixth miss
// (limits.tsv pin.delay.*), so the counter is moved to four in the database,
// as six misses with their waits would come to, and one more miss is made by
// the screen. And the obvious-PIN warning at registration is the core's list.

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";
import { PIN, register } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

test("the last three PIN attempts say what the tenth miss does, and the right PIN still opens", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));

  // The obvious-PIN warning on the way in: the core's list, not a copy.
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill("111111");
  await expect(page.locator('[data-screen="register-2"]')).toContainText("этот ПИН легко угадать");
  await page.getByTestId("pin").fill("123456");
  await expect(page.locator('[data-screen="register-2"]')).toContainText("этот ПИН легко угадать");
  await page.getByTestId("pin").fill("271828");
  await expect(page.locator('[data-screen="register-2"]')).not.toContainText("этот ПИН легко угадать");
  await page.getByTestId("pin").fill("");

  await register(page);
  const identity = await page.evaluate(() => (globalThis as unknown as { xor: { client: { identityId: string } } }).xor.client.identityId);

  // A reload, a wrong PIN: nine left, and no word of the lock yet.
  await page.reload();
  await expect(page.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId("unlock-pin").fill("654321");
  await page.getByTestId("unlock").click();
  await expect(page.getByTestId("error")).toHaveText("ПИН не подходит. Осталось попыток: 9", { timeout: 30000 });

  // Six misses later, as the node would have counted them: four left, no wait.
  const sql = postgres(DATABASE, { max: 1 });
  try {
    const moved = await sql`
      UPDATE vault_shares v SET attempts_left = 4, next_attempt_at = NULL
        FROM sessions s WHERE s.id = v.session AND s.identity = ${identity}::uuid RETURNING v.session`;
    expect(moved.length, "the device's vault row was not found").toBe(1);
  } finally {
    await sql.end();
  }
  // One more miss: three left, and the second sentence.
  await page.getByTestId("unlock-pin").fill("654321");
  await page.getByTestId("unlock").click();
  await expect(page.getByTestId("error"), "the last attempts do not say what the tenth miss does")
    .toHaveText("ПИН не подходит. Осталось попыток: 3 После этого вход на этом устройстве закроется до бумажного кода.", { timeout: 30000 });

  // The seventh miss opens a ten-minute wait (pin.delay.8), and the right PIN
  // inside it is refused as too soon — the node's rule, said on the screen.
  await page.getByTestId("unlock-pin").fill(PIN);
  await page.getByTestId("unlock").click();
  await expect(page.getByTestId("error")).toContainText("Слишком рано после прошлой попытки", { timeout: 30000 });
  // The wait over, as ten minutes would leave it: the right PIN opens.
  const again = postgres(DATABASE, { max: 1 });
  try {
    await again`UPDATE vault_shares v SET next_attempt_at = NULL FROM sessions s WHERE s.id = v.session AND s.identity = ${identity}::uuid`;
  } finally {
    await again.end();
  }
  await page.getByTestId("unlock-pin").fill(PIN);
  await page.getByTestId("unlock").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await context.close();
});

