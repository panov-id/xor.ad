// A phrase of two lines from the composer's textarea reaches the node without
// a CR (V10, the V5 caveat): the node refuses CR as a character nobody can
// see (lib/names.ts), so a browser that sent CRLF would get 400 on a plain
// line break. Checked two ways — Enter typed, and a CRLF pasted in — on the
// request as it leaves the page, and on the node's answer.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

for (const [how, write] of [
  ["Enter typed", async (text: import("@playwright/test").Locator) => {
    await text.fill("первая строка");
    await text.press("Enter");
    await text.pressSequentially("вторая строка");
  }],
  ["CRLF pasted", async (text: import("@playwright/test").Locator) => {
    await text.fill("первая строка\r\nвторая строка");
  }],
] as const) {
  test(`a two-line phrase, ${how}, leaves the page with LF only and is published`, async ({ page }) => {
    // Known defect (V10, 27.09.2026): a CRLF set into the textarea leaves the
    // page as "\r\n" (measured), and the node refuses CR since V5. Expected to
    // fail until the composer or the node folds CRLF to LF; then drop this.
    test.fail(how === "CRLF pasted");
    test.setTimeout(90_000);
    await register(page, { name: "Дина", age: "31" });
    await page.getByTestId("write").click();
    await expect(page.locator('[data-screen="composer"]')).toBeVisible();
    await write(page.getByTestId("text"));
    const sent = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/feed");
    await page.getByTestId("send").click();
    const body = (await sent).postData() ?? "";
    expect(body, "the phrase is not in the request").toContain("первая строка");
    expect(body.includes("\\r") || body.includes("\r"), `a CR left the page: ${body}`).toBe(false);
    expect(body, "the line break was lost before the node").toContain("\\n");
    await expect(page.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });
  });
}
