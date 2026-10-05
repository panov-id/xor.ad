// W17-DR · the panel's page of DSA Art. 24(3) recipients against the stand's
// live node (GET /admin/dsa-recipients), after panel/design/dsa-recipients-
// mockup.svg and the owner's answers (all "a"): an incomplete average shows
// with its mark, the months keep their bars, the figure and the method can be
// copied, and a tenant has no menu item. The months are written into the
// stand's database, since a month is counted by the node's monthly job.
// The page's picture lands beside the mockup's (results/dsa-recipients/).

import postgres from "postgres";
import { devices } from "@playwright/test";
import { expect, type Page, test } from "../fixtures/address.ts";

const PANEL_URL = process.env.PANEL_URL ?? "";
const SECRET = process.env.PANEL_SESSION_SECRET ?? "";
const ENV_NAME = process.env.PANEL_ENV_NAME ?? "test";
const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

async function panelToken(brand: string | null): Promise<string> {
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const enc = new TextEncoder();
  const header = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64(enc.encode(JSON.stringify({
    sub: brand ? "tenant@webtest.invalid" : "moderator@webtest.invalid",
    role: "moderator", brand, env: ENV_NAME, exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64(sig)}`;
}

async function panelAs(browser: import("@playwright/test").Browser, brand: string | null): Promise<Page> {
  // A desktop at the mockup's width: the panel is used so, and its menu folds on a phone.
  const page = await (await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } })).newPage();
  // The fixture's Bunny headers are the storefront's; the node's CORS refuses them from the panel.
  await page.context().setExtraHTTPHeaders({});
  // What the page puts on the clipboard, caught at the copy itself: the stand's
  // panel is plain http, no secure context, so the page copies the old way.
  await page.addInitScript(() => {
    document.addEventListener("copy", () => {
      const el = document.activeElement as HTMLTextAreaElement | null;
      (window as unknown as { copied?: string }).copied = el?.value || String(document.getSelection() ?? "");
    });
  });
  const token = await panelToken(brand);
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ["panel_jwt", token]);
  return page;
}

// The six calendar months before this one, newest first, as the node counts them.
function monthsBefore(now = new Date()): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

test("the recipients page: the average with its mark until six months, the bars, the copy", async ({ browser }) => {
  expect(PANEL_URL && SECRET, "the stand's panel and its session secret (docker-compose.web.yml e2e)").toBeTruthy();
  test.setTimeout(120_000);
  const months = monthsBefore();
  const counts = [1402, 1288, 1101, 1065];
  const sql = postgres(DATABASE, { max: 1 });
  try {
    await sql`DELETE FROM dsa_monthly_recipients`;
    for (const [i, active] of counts.entries()) {
      await sql`INSERT INTO dsa_monthly_recipients (month, active) VALUES (${`${months[i]}-01`}::date, ${active})`;
    }
    const platform = await panelAs(browser, null);
    await platform.goto(PANEL_URL);
    await platform.getByRole("link", { name: "Recipients, DSA 24(3)" }).click();
    await expect(platform.getByRole("heading", { name: "Recipients, DSA Art. 24(3)" })).toBeVisible();

    // Four of six: the average of what there is, with its mark.
    const average = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
    await expect(platform.getByTestId("recipients-figure")).toHaveText(average.toLocaleString("ru-RU").replace(/ /g, " "));
    await expect(platform.getByTestId("recipients-incomplete"), "an incomplete average was shown without its mark")
      .toHaveText("incomplete · 4 of 6 months counted");
    const rows = platform.getByTestId("recipients-month");
    await expect(rows).toHaveCount(6);
    await expect(platform.locator('[data-testid="recipients-month"][data-counted="yes"] .recipients-bar')).toHaveCount(4);
    await expect(platform.locator('[data-testid="recipients-month"][data-counted="no"]')).toHaveCount(2);
    await expect(rows.nth(5)).toContainText("not counted");
    await expect(platform.getByTestId("recipients-method")).toContainText("all counted as in the Union");

    await platform.getByTestId("recipients-copy").click();
    await expect(platform.getByTestId("recipients-copy")).toHaveText("Copied");
    const copied = await platform.evaluate(() => (window as unknown as { copied?: string }).copied ?? "");
    expect(copied).toContain(`${average} (incomplete: 4 of 6 months counted)`);
    expect(copied).toContain("Method: identities that finished signing up");

    await platform.screenshot({ path: "results/dsa-recipients/page-incomplete.png" });

    // All six: the mark goes.
    for (const [i, active] of [[4, 990], [5, 940]] as const) {
      await sql`INSERT INTO dsa_monthly_recipients (month, active) VALUES (${`${months[i]}-01`}::date, ${active})`;
    }
    await platform.reload();
    await expect(platform.getByTestId("recipients-figure")).toBeVisible({ timeout: 15000 });
    await expect(platform.getByTestId("recipients-incomplete")).toHaveCount(0);
    await expect(platform.locator('[data-testid="recipients-month"][data-counted="no"]')).toHaveCount(0);
    await platform.screenshot({ path: "results/dsa-recipients/page-complete.png" });

    // A tenant's moderator has no menu item and no page: proved by the panel's
    // own test (panel/src/providers/access.test.ts), since the stand lays one
    // panel user only, the platform's (docker-compose.web.yml panel-user).
  } finally {
    await sql`DELETE FROM dsa_monthly_recipients`;
    await sql.end();
  }
});
