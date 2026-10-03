// An offer's link against a live node and a seeded offer (docker-compose.web.yml
// seed: one venue, two offers — W5b): `<storefront>/o/<code>` lands on the exit
// screen with the target's domain as the node answers it, "перейти" is the
// node's own 302 — its Location is read, the browser is not sent outside — and
// a switched-off link says so and offers no way on. No registration: the link
// is for anybody, so this spec spends none of the stand's ten an hour.

import { expect, test } from "../fixtures/address.ts";

test("a live offer link: the exit screen names the domain, and the node's 302 points at it", async ({ page }) => {
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  const exits: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/o/webtestlive0001" && r.request().resourceType() !== "document") exits.push(r.status()); });

  await page.goto("/o/webtestlive0001");
  await expect(page.locator('[data-screen="offer-exit"]')).toHaveAttribute("data-state", "ok", { timeout: 15000 });
  expect(exits).toEqual([200]);
  await expect(page.getByTestId("domain")).toHaveText("ourcafe.cy");
  await expect(page.getByTestId("exit")).toHaveAttribute("data-disabled", "false");
  await expect(page.getByTestId("go")).toHaveAttribute("href", "/o/webtestlive0001/go");
  // Sheet 17: the domain stands whole in its own block, the button says "Продолжить";
  // a link opened in a fresh tab has no identity, so no report is offered (WS3).
  await expect(page.getByTestId("go")).toHaveAccessibleName("Продолжить");
  await expect(page.getByTestId("report")).toHaveCount(0);

  // The node's 302, read where the button points, without following it: the
  // browser stays on the page, the Location is the offer's address.
  const go = await page.request.fetch("/o/webtestlive0001/go", { maxRedirects: 0, headers: { accept: "text/html" } });
  expect(go.status()).toBe(302);
  expect(go.headers()["location"]).toBe("https://ourcafe.cy/menu");
  expect(go.headers()["cache-control"]).toContain("no-store");
});

test("a switched-off offer link says so and leads nowhere; a code nobody issued is not found", async ({ page }) => {
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  await page.goto("/o/webtestspent001");
  await expect(page.locator('[data-screen="offer-exit"]')).toHaveAttribute("data-state", "ok", { timeout: 15000 });
  await expect(page.getByTestId("exit")).toHaveAttribute("data-disabled", "true");
  await expect(page.getByTestId("disabled")).toContainText("погашена");
  await expect(page.getByTestId("go")).toHaveCount(0);
  // The node refuses the follow too: 410, nobody is sent.
  const go = await page.request.fetch("/o/webtestspent001/go", { maxRedirects: 0 });
  expect(go.status()).toBe(410);

  await page.goto("/o/nosuchcode0001");
  await expect(page.locator('[data-screen="offer-exit"]')).toHaveAttribute("data-state", "missing", { timeout: 15000 });
  await expect(page.getByTestId("missing")).toContainText("Такой ссылки нет");
});
