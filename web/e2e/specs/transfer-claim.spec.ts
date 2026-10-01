// The second claim on the arrival screen (W12-C2; chat spec §8.2 :2964): a
// code that does not match or has expired is said in the one wording and the
// screen stays on the code for a retry; the claim's own limit — this address's
// allowance or the node's shared brake (transfer.ts 429, claim.miss.*) — is
// said as too many attempts with the seconds, not in the PIN's words.
//
// The refusals come from the route, not the node: ten wrong codes would spend
// this address's hourly allowance on the shared stand and refuse every other
// spec's claim after (limits.tsv transfer.claim.hour), and the shared brake
// would hold a genuine code too. What is under test is the screen's answer to
// each status, and the status is what the route gives.

import { expect, test } from "../fixtures/address.ts";

test("a refused code stays for the retry, and the claim's limit is said with its seconds", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await context.newPage();
  const claims: number[] = [];
  const answers = [
    { status: 404, body: { error: { code: "not_found", message: "that code does not match or has expired" } } },
    { status: 429, headers: { "retry-after": "7" }, body: { error: { code: "rate_limited", message: "too many attempts from this address" } } },
  ];
  await page.route("**/sessions/claim", async (route) => {
    const next = answers[claims.length] ?? answers[answers.length - 1];
    claims.push(next.status);
    await route.fulfill({ status: next.status, headers: { "content-type": "application/json", ...(next.headers ?? {}) }, body: JSON.stringify(next.body) });
  });
  await page.goto("/");
  await page.getByTestId("arrive").click();
  await expect(page.locator('[data-screen="arrival"]')).toBeVisible();
  await page.getByTestId("arrive-code").fill("k7q-m3f-2x9");
  await page.getByTestId("arrive-go").click();
  await expect(page.getByTestId("error")).toContainText("Код не подошёл или истёк", { timeout: 30000 });
  // The retry: the code is still in the field and the button is live.
  await expect(page.getByTestId("arrive-code")).toHaveValue("k7q-m3f-2x9");
  await expect(page.getByTestId("arrive-go")).toBeEnabled();
  await page.getByTestId("arrive-go").click();
  await expect(page.getByTestId("error")).toContainText("Слишком много попыток. Ещё раз через 7 с.", { timeout: 30000 });
  await expect(page.getByTestId("error")).not.toContainText("ПИН");
  await expect(page.getByTestId("error")).not.toContainText("прошлой попытки");
  await expect(page.getByTestId("arrive-code")).toHaveValue("k7q-m3f-2x9");
  expect(claims).toEqual([404, 429]);
  await context.close();
});
