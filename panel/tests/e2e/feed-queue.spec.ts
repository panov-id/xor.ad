import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { ADMIN_EMAIL } from "../helpers/env";

// Two phrases sent to the stand through POST /feed by the runner
// (scripts/run-panel-tests.sh → scripts/seed-local-phrase.sh) before the suite
// starts: the page must show what a person sent, and the verdicts must reach
// the node. No side door into storage: what disappears from the page
// disappeared because the route applied the verdict.
const REFUSED = process.env.FEED_QUEUE_REFUSE_TEXT ?? "";
const PUBLISHED = process.env.FEED_QUEUE_PUBLISH_TEXT ?? "";

test.describe("feed queue — a person gives the verdict", () => {
  test.skip(!REFUSED || !PUBLISHED, "the runner seeds two phrases and names them in the environment");

  test("refuse asks once more, then the phrase is gone; publish goes at once", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);
    await page.getByRole("link", { name: "Feed queue" }).click();
    await expect(page.getByRole("heading", { name: "Feed queue" })).toBeVisible();

    const toRefuse = page.getByRole("row", { name: new RegExp(REFUSED) });
    await expect(toRefuse).toBeVisible();
    await toRefuse.getByRole("button", { name: "Refuse" }).click();
    // The first press arms; nothing has left yet.
    await expect(toRefuse.getByText("Refuse for good?")).toBeVisible();
    await expect(toRefuse).toBeVisible();
    await toRefuse.getByRole("button", { name: "Yes, refuse" }).click();
    await expect(page.getByRole("row", { name: new RegExp(REFUSED) })).toHaveCount(0, { timeout: 15000 });

    const toPublish = page.getByRole("row", { name: new RegExp(PUBLISHED) });
    await expect(toPublish).toBeVisible();
    await toPublish.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("row", { name: new RegExp(PUBLISHED) })).toHaveCount(0, { timeout: 15000 });
  });
});
