// Screenshots of the faces from the local stand (shots.sh), taken now. The
// landings are asked for by their own hostnames, resolved to the local gateway.
// The panel is shot signed in as the stand's admin: the session JWT is minted
// with the stand's throwaway secret, as panel/tests/helpers/token.ts does.
import { chromium } from "playwright";
const PANEL = "http://localhost:62173";
const shots = [
  ["sosed-desktop", "http://sosed.place/", { width: 1440, height: 900 }, "light"],
  ["neighbro-desktop", "http://neighbro.place/", { width: 1440, height: 900 }, "light"],
  ["sosed-mobile-dark", "http://sosed.place/", { width: 390, height: 844 }, "dark"],
  ["neighbro-mobile-light", "http://neighbro.place/", { width: 390, height: 844 }, "light"],
  ["panel-login", `${PANEL}/login`, { width: 1440, height: 900 }, "light"],
];
const panelScreens = [
  "waitlist", "dsa-notices", "feed-queue", "support", "panel-users", "brands",
  "api-keys", "secret-keys", "logs/client-errors", "logs/audit", "logs/server", "logs/pageviews",
];
for (const p of panelScreens) {
  shots.push([`panel-${p.replace("/", "-")}`, `${PANEL}/${p}`, { width: 1440, height: 900 }, "light", true]);
}

const enc = new TextEncoder();
const b64 = (b) => Buffer.from(b).toString("base64url");
async function mintToken(email) {
  const head = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64(enc.encode(JSON.stringify({
    sub: email, role: "admin", brand: null, env: process.env.NODE_ENV_NAME ?? "local",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET ?? "local-panel-secret"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}
const token = await mintToken("test-admin@xor.ad");

const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP sosed.place 127.0.0.1:8080, MAP neighbro.place 127.0.0.1:8080"],
});
let failed = 0;
for (const [name, url, viewport, scheme, signedIn] of shots) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2, locale: "ru-RU" });
  const page = await ctx.newPage();
  if (signedIn) await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ["panel_jwt", token]);
  const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(2500);
  // A signed-in screen that bounced to /login is a failed shot, not a picture.
  const landed = new URL(page.url()).pathname;
  if (signedIn && landed.startsWith("/login")) { console.log(name, "BOUNCED to /login"); failed++; }
  await page.screenshot({ path: `/out/${name}.png` });
  console.log(name, res?.status(), landed);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
