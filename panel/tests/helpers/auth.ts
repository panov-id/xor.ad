import { type Page } from "@playwright/test";
import { PANEL_URL } from "./env";
import { generateMagicLink } from "./admin";

// Signs a browser session in the same way a real user would, but without
// SMTP: generate the magic link via the Admin API and let the app's
// supabase-js client consume the tokens from the redirect URL hash.
export async function loginAs(page: Page, email: string) {
  const link = await generateMagicLink(email, PANEL_URL);
  await page.goto(link);
  // The verify endpoint redirects to PANEL_URL with tokens in the hash;
  // supabase-js (detectSessionInUrl) stores the session, then the app
  // navigates to the first authenticated resource.
  await page.waitForURL((url) => url.origin === new URL(PANEL_URL).origin && !url.hash.includes("access_token"), {
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
}
