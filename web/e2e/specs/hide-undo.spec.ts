// «Hide» sits in the card's «…» menu, not on its main bar (owner, 14.10.2026); after it the feed stands a row
// «hidden · return» for 5 s. «return» calls DELETE /hidden/<id> and the phrase is back in the feed. After the
// 5 s the row goes and the phrase stays hidden.

import { expect, test } from "../fixtures/address.ts";
import { register, runLabel } from "./helpers.ts";

test("hide from the menu → «hidden · return» → return → the phrase is back", async ({ browser }) => {
  test.setTimeout(150_000);
  const phrase = `кто на рынок к десяти? ${runLabel()}`;
  const a = await (await browser.newContext()).newPage();
  await register(a);
  await a.getByTestId("write").click();
  await a.getByTestId("text").fill(phrase);
  await a.getByTestId("send").click();
  await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });

  const b = await (await browser.newContext()).newPage();
  await register(b, { name: "Борис", age: "31" });
  await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  const mine = b.getByTestId("card").filter({ hasText: phrase });

  // First round: «return» inside the 5 s.
  await mine.click();
  await b.getByTestId("more").click();
  await b.getByTestId("hide").click();
  await expect(b.getByTestId("hidden-undo"), "the undo row stands on the feed").toBeVisible({ timeout: 15000 });
  await expect(mine, "the phrase is out of the feed").toHaveCount(0);
  await b.getByTestId("hidden-undo").click();
  await expect(b.getByTestId("hidden-undo"), "the row goes after «return»").toHaveCount(0);
  await expect(mine, "the phrase is back").toHaveCount(1, { timeout: 15000 });

  // Second round: no «return» — the row goes in 5 s, the phrase stays hidden.
  await mine.click();
  await b.getByTestId("more").click();
  await b.getByTestId("hide").click();
  await expect(b.getByTestId("hidden-undo")).toBeVisible({ timeout: 15000 });
  await expect(b.getByTestId("hidden-undo"), "the row goes by itself").toHaveCount(0, { timeout: 10000 });
  await expect(mine).toHaveCount(0);
});
