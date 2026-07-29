import { type Page } from "@playwright/test";
import { MODERATOR_EMAIL, PANEL_URL } from "./env";
import { mintToken, type PanelRole } from "./token";

// Signs a browser session in without the magic-link email round trip: mint the
// same JWT the relay's /auth/callback would hand back and put it where the panel
// keeps it (localStorage "panel_jwt", see panel/src/providers/api.ts).
//
// The redeem flow itself is not skipped for convenience — it is covered on the
// relay side, where it belongs; driving it through Mailpit here would test the
// mail catcher as much as the panel.
export async function loginAs(page: Page, email: string, role?: PanelRole) {
  const token = await mintToken(email, role ?? (email === MODERATOR_EMAIL ? "moderator" : "admin"));
  // addInitScript rather than a post-load evaluate: the panel reads the token on
  // first render, so a session written after navigation would arrive too late
  // and bounce the test to /login.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["panel_jwt", token],
  );
  await page.goto(PANEL_URL);
  await page.waitForLoadState("networkidle");
}
