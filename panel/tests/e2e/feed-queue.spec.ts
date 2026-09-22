import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { ADMIN_EMAIL } from "../helpers/env";

// Three phrases sent to the stand through POST /feed by the runner
// (scripts/run-panel-tests.sh → scripts/seed-local-phrase.sh) before the suite
// starts: the page must show what a person sent, and the verdicts must reach
// the node. No side door into storage: what disappears from the page
// disappeared because the route applied the verdict.
const REFUSED = process.env.FEED_QUEUE_REFUSE_TEXT ?? "";
const PUBLISHED = process.env.FEED_QUEUE_PUBLISH_TEXT ?? "";
const NAME_REFUSED = process.env.FEED_QUEUE_NAME_REFUSE_TEXT ?? "";

test.describe("feed queue — a person gives the verdict", () => {
  test.skip(!REFUSED || !PUBLISHED || !NAME_REFUSED, "the runner seeds two phrases and names them in the environment");

  test("refuse asks once more, then the phrase is gone; publish goes at once", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);
    await page.getByRole("link", { name: "Feed queue" }).click();
    await expect(page.getByRole("heading", { name: "Feed queue" })).toBeVisible();

    const toRefuse = page.getByRole("row", { name: new RegExp(REFUSED) });
    await expect(toRefuse).toBeVisible();
    await toRefuse.getByRole("button", { name: "Refuse", exact: true }).click();
    // The first press arms; nothing has left yet.
    await expect(toRefuse.getByText("Refuse for good?")).toBeVisible();
    await expect(toRefuse).toBeVisible();
    await toRefuse.getByRole("button", { name: "Yes, refuse" }).click();
    await expect(page.getByRole("row", { name: new RegExp(REFUSED) })).toHaveCount(0, { timeout: 15000 });

    const toPublish = page.getByRole("row", { name: new RegExp(PUBLISHED) });
    await expect(toPublish).toBeVisible();
    // A third phrase: its name is refused. The phrase stays, marked, and
    // Publish is off until a new name comes (§8.2) — which only the author's
    // signing key can send, so it ends here and the row outlives the run.
    const nameRefused = page.getByRole("row", { name: new RegExp(NAME_REFUSED) });
    await expect(nameRefused).toBeVisible();
    await nameRefused.getByRole("button", { name: "Refuse name" }).click();
    await expect(nameRefused.getByText("name rejected")).toBeVisible({ timeout: 15000 });
    await expect(nameRefused.getByRole("button", { name: "Publish" })).toBeDisabled();

    await toPublish.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("row", { name: new RegExp(PUBLISHED) })).toHaveCount(0, { timeout: 15000 });
  });
});
