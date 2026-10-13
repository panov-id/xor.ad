// A notice under Article 16 DSA on a person's phrase (docs/depth-client_RU.md §3.4, docs/dsa/SPEC_RU.md §3):
// «…» on the card → «report as illegal» → reasons and the declaration are required, name and email are not →
// the node answers 202 with an id (relay/node/src/routes/report.ts) → the card says the reference and leaves
// the item out of the sheet.

import { expect, test } from "../fixtures/address.ts";
import { register, runLabel } from "./helpers.ts";

test("a phrase is reported as illegal from the card's «…»; the node takes it and the card says the reference", async ({ browser }) => {
  test.setTimeout(150_000);
  const phrase = `продаю чужие паспорта ${runLabel()}`;
  const a = await (await browser.newContext()).newPage();
  await register(a);
  await a.getByTestId("write").click();
  await a.getByTestId("text").fill(phrase);
  await a.getByTestId("send").click();
  await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });

  const b = await (await browser.newContext()).newPage();
  await register(b, { name: "Борис", age: "31" });
  await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  await b.getByTestId("card").filter({ hasText: phrase }).click();
  const cardId = await b.locator('[data-screen="card"]').getAttribute("data-id");

  const sent: { status: number; body: Record<string, unknown> }[] = [];
  b.on("request", (r) => {
    if (new URL(r.url()).pathname === "/report") sent.push({ status: 0, body: r.postDataJSON() as Record<string, unknown> });
  });
  const answered = b.waitForResponse((r) => new URL(r.url()).pathname === "/report");

  await b.getByTestId("more").click();
  await expect(b.getByTestId("notice"), "the notice item is in the sheet and styled danger").toHaveClass(/ui-danger/);
  await b.getByTestId("notice").click();

  const send = b.getByTestId("notice-send");
  await expect(send, "nothing to send without reasons").toBeDisabled();
  await b.getByTestId("notice-reason").fill("Offers forged identity documents for sale.");
  await expect(send, "nothing to send without the declaration").toBeDisabled();
  await b.getByTestId("notice-bona").check();
  await expect(send).toBeEnabled();
  await send.click();

  const response = await answered;
  expect(response.status(), "the node accepted the notice").toBe(202);
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toMatchObject({
    target_kind: "feed_message",
    target_id: cardId,
    reason_text: "Offers forged identity documents for sale.",
    notifier_name: null,
    notifier_email: null,
    bona_fide: true,
  });
  const id = String(((await response.json()) as { id: string }).id);
  await expect(b.getByTestId("noticed")).toContainText(id.slice(0, 8));

  await b.getByTestId("more").click();
  await expect(b.getByTestId("more-sheet")).toBeVisible();
  await expect(b.getByTestId("notice"), "a sent notice is not offered twice").toHaveCount(0);
});
