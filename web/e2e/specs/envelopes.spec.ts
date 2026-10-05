// W17-EN · the panel's page of venue envelopes against the stand's live node
// (GET /admin/envelopes, POST …/sent), after panel/design/venue-envelopes-
// mockup.svg and the owner's answers: the address and the code printed on a
// DL envelope (110 × 220 mm) in English, sent_at marked, the code gone from the
// page once sent. The envelopes are written into the stand's database; the
// printed face lands in results/envelopes/ (a picture and a PDF of the page).

import postgres from "postgres";
import { devices } from "@playwright/test";
import { expect, test } from "../fixtures/address.ts";

const PANEL_URL = process.env.PANEL_URL ?? "";
const SECRET = process.env.PANEL_SESSION_SECRET ?? "";
const ENV_NAME = process.env.PANEL_ENV_NAME ?? "test";
const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

async function panelToken(): Promise<string> {
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const enc = new TextEncoder();
  const header = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64(enc.encode(JSON.stringify({
    sub: "moderator@webtest.invalid", role: "moderator", brand: null, env: ENV_NAME, exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64(sig)}`;
}

test("the envelopes page: the code to print, a DL envelope in English, and the code gone once sent", async ({ browser }) => {
  expect(PANEL_URL && SECRET, "the stand's panel and its session secret (docker-compose.web.yml e2e)").toBeTruthy();
  test.setTimeout(120_000);
  const sql = postgres(DATABASE, { max: 1 });
  const advertiser = crypto.randomUUID();
  const cafe = crypto.randomUUID();
  const envelope = crypto.randomUUID();
  const code = `K7QD-${advertiser.slice(0, 4).toUpperCase()}-9PTE`;
  try {
    await sql`INSERT INTO advertisers (id, email, email_confirmed_at, contact) VALUES (${advertiser}, ${`env-${advertiser}@webtest.invalid`}, now(), 'Вера')`;
    await sql`INSERT INTO venues (id, advertiser_id, name, address, verification_status) VALUES (${cafe}, ${advertiser}, 'Кофейня «Угол»', 'ул. Руставели 12, Тбилиси', 'unverified')`;
    await sql`INSERT INTO venue_envelopes (id, venue_id, code, code_hash, expires_at)
              VALUES (${envelope}, ${cafe}, ${code}, ${envelope.replaceAll("-", "").repeat(2)}, now() + interval '30 days')`;
    // The list's own query, as the node runs it: whether it needs an index of its own.
    const plan = await sql.unsafe(`EXPLAIN SELECT e.id FROM venue_envelopes e JOIN venues v ON v.id = e.venue_id
      WHERE e.used_at IS NULL AND e.burned_at IS NULL AND e.expires_at > now() ORDER BY e.created_at LIMIT 200`);
    console.log(`[plan] ${plan.map((r) => Object.values(r)[0]).join(" / ")}`);

    const page = await (await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } })).newPage();
    await page.context().setExtraHTTPHeaders({});
    const token = await panelToken();
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ["panel_jwt", token]);
    await page.goto(PANEL_URL);
    await page.getByRole("link", { name: "Envelopes to post" }).click();
    await expect(page.getByRole("heading", { name: "Envelopes to post" })).toBeVisible();
    const row = page.locator(`[data-testid="envelope-row"][data-id="${envelope}"]`);
    await expect(row).toContainText("Кофейня «Угол»");
    await expect(row).toContainText("ул. Руставели 12, Тбилиси");
    await expect(row.getByTestId("envelope-row-code")).toHaveText(code);
    await page.mouse.move(640, 600); // off the menu link just pressed, so its hover does not paint the picture
    await page.screenshot({ path: "results/envelopes/page.png" });

    // Print: the one envelope, DL, the address in the window and the code in English.
    await row.getByTestId("envelope-print").click();
    await page.emulateMedia({ media: "print" });
    const face = page.getByTestId("envelope-face");
    await expect(face).toBeVisible();
    await expect(face.getByTestId("envelope-code")).toHaveText(code);
    await expect(face.getByTestId("envelope-to")).toContainText("ул. Руставели 12, Тбилиси");
    await expect(face).toContainText("Your code");
    await expect(face).toContainText("Enter it in the cabinet within 30 days.");
    const box = await face.boundingBox();
    // 220 × 110 mm at 96 px to the inch.
    expect(Math.round(box!.width), "the envelope is not DL wide").toBe(Math.round(220 / 25.4 * 96));
    expect(Math.round(box!.height), "the envelope is not DL tall").toBe(Math.round(110 / 25.4 * 96));
    await face.screenshot({ path: "results/envelopes/envelope-dl.png" });
    await page.pdf({ path: "results/envelopes/envelope-dl.pdf", preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: "screen" });

    // Sent: the code leaves the page.
    await row.getByTestId("envelope-sent").click();
    await expect(row).toHaveAttribute("data-sent", "yes", { timeout: 15000 });
    await expect(row, "the code is still on the page after the envelope was sent").not.toContainText(code);
    await expect(row).toContainText("of 5 tries left");
  } finally {
    await sql`DELETE FROM venue_envelopes WHERE id = ${envelope}`;
    await sql`DELETE FROM venues WHERE id = ${cafe}`;
    await sql`DELETE FROM advertisers WHERE id = ${advertiser}`;
    await sql.end();
  }
});
