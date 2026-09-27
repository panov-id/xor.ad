// A phrase of two lines from the composer's textarea is published (V10, the V5
// caveat): the node refuses CR as a character nobody can see (lib/names.ts),
// and a textarea given a CRLF sends it as is (measured 27.09.2026), so the node
// folds CRLF to LF before the check (V11). Checked two ways — Enter typed (the
// page sends LF), and a CRLF pasted in (the page sends CRLF, the node folds it).

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
  test(`a two-line phrase, ${how}, goes to the node with its line break and is published`, async ({ page }) => {
    test.setTimeout(90_000);
    await register(page, { name: "Дина", age: "31" });
    await page.getByTestId("write").click();
    await expect(page.locator('[data-screen="composer"]')).toBeVisible();
    await write(page.getByTestId("text"));
    const sent = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/feed");
    await page.getByTestId("send").click();
    const answer = await sent;
    const body = answer.request().postData() ?? "";
    expect(body, "the phrase is not in the request").toContain("первая строка");
    expect(body, "the line break was lost before the node").toContain("\\n");
    if (how === "Enter typed") expect(body.includes("\\r"), `Enter typed a CR: ${body}`).toBe(false);
    expect(answer.status(), `the node refused a line break: ${await answer.text()}`).toBeLessThan(300);
    await expect(page.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });
  });
}
