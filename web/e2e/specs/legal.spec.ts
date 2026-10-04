// The legal revisions on the web face (W13-LC; chat spec §8.2 :851-858,
// screen 15), against a live node whose face has a manifest (W14-LS). Runs
// with the node's gate off (default) and on (LEGAL_REQUIRED=1
// scripts/run-web-tests.sh); the third case only with it on.
//   1 · registration: the consent shows each text's link with its revision
//       date, and the three revisions are recorded on the node;
//   2 · a revision changed since this device accepted: the first entry into
//       the feed opens screen 15 with that document marked, boxed, accepted;
//   3 · gate on, nothing accepted on the node: a phrase is refused with the
//       way out, screen 15 from "me" accepts, and the phrase goes.

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";
import { register, runLabel, unlock, PIN } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";
const GATE = process.env.LEGAL_REQUIRED === "1";

type Xor = { xor: { client: { identityId: string } } };
const identityOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (globalThis as unknown as Xor).xor.client.identityId);

async function acceptedOnNode(identity: string): Promise<string[]> {
  const sql = postgres(DATABASE, { max: 1 });
  try {
    const rows = await sql<{ document: string }[]>`SELECT DISTINCT document FROM legal_acceptances WHERE identity = ${identity}::uuid ORDER BY document`;
    return rows.map((r) => r.document);
  } finally {
    await sql.end();
  }
}

test("registration shows the texts' links and records the three revisions on the node", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await expect(page.getByTestId("legal-links")).toBeVisible({ timeout: 15000 });
  for (const doc of ["terms", "privacy", "guidelines"]) {
    await expect(page.getByTestId(`legal-link-${doc}`)).toHaveAttribute("href", doc === "guidelines" ? /\/rules\.html$/ : new RegExp(`/legal\\.html\\?doc=${doc}$`));
  }
  await expect(page.getByTestId("legal-links")).toContainText("редакция от 2026-09-");
  await register(page);
  const identity = await identityOf(page);
  await expect.poll(() => acceptedOnNode(identity), { timeout: 15000 }).toEqual(["guidelines", "privacy", "terms"]);
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-legal").click();
  await expect(page.locator('[data-screen="legal"]')).toHaveAttribute("data-pending", "0");
  await expect(page.getByTestId("legal-all")).toHaveText("всё принято");
});

test("a revision changed since this device accepted opens screen 15 on the way into the feed", async ({ page }) => {
  await register(page);
  const identity = await identityOf(page);
  await expect.poll(() => acceptedOnNode(identity), { timeout: 15000 }).toHaveLength(3);
  // This device accepted an older guidelines: as if the manifest moved on since.
  await page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("xor-legal:") && k.endsWith(id))!;
    const kept = JSON.parse(localStorage.getItem(key)!);
    kept.guidelines = "0".repeat(64);
    localStorage.setItem(key, JSON.stringify(kept));
  }, identity);
  await page.reload();
  await unlock(page, PIN);
  const screen = page.locator('[data-screen="legal"]');
  await expect(screen, "the changed revision did not open screen 15").toBeVisible({ timeout: 20000 });
  await expect(screen).toHaveAttribute("data-pending", "1");
  await expect(page.getByTestId("legal-doc-guidelines")).toHaveAttribute("data-changed", "yes");
  await expect(page.getByTestId("legal-doc-terms")).toHaveAttribute("data-changed", "no");
  await expect(page.getByTestId("legal-accept")).toBeDisabled();
  await page.getByTestId("legal-guidelines").check();
  await page.getByTestId("legal-accept").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
});

test("gate on: a phrase is refused until the revisions are accepted on screen 15", async ({ page }) => {
  test.skip(!GATE, "the node's gate is off in this run (LEGAL_REQUIRED=1 scripts/run-web-tests.sh)");
  await register(page);
  const identity = await identityOf(page);
  await expect.poll(() => acceptedOnNode(identity), { timeout: 15000 }).toHaveLength(3);
  // Nothing accepted on the node, nothing kept on this device: a moved-in identity.
  const sql = postgres(DATABASE, { max: 1 });
  try {
    await sql`DELETE FROM legal_acceptances WHERE identity = ${identity}::uuid`;
  } finally {
    await sql.end();
  }
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("xor-legal:")) localStorage.removeItem(k); });

  const text = `после документов ${runLabel()}`;
  await page.getByTestId("write").click();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  await expect(page.getByTestId("refused")).toHaveText("сначала примите новые редакции документов: «я» → «документы»", { timeout: 15000 });

  await page.goto("/");
  await unlock(page, PIN);
  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-legal").click();
  await expect(page.locator('[data-screen="legal"]')).toHaveAttribute("data-pending", "3");
  for (const doc of ["terms", "privacy", "guidelines"]) await page.getByTestId(`legal-${doc}`).check();
  await page.getByTestId("legal-accept").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => acceptedOnNode(identity), { timeout: 15000 }).toEqual(["guidelines", "privacy", "terms"]);

  await page.getByTestId("nav-feed").click();
  await page.getByTestId("write").click();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  await expect(page.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });
});
