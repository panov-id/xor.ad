// The page's Content-Security-Policy (FX5′, web/vite.config.ts): a script that
// is not the page's own does not run — neither one written into the page, nor
// an inline handler, nor eval — and the browser says so as a CSP violation.
// WebAssembly still compiles, because the PIN (Argon2, hash-wasm) needs it.
//
// The policy is the fence the page has: a script on the page could take the
// long key it holds after the PIN, or the PIN as it is typed (X3). Inside one
// page nothing hides a key from that page's own scripts.

import { expect, test } from "../fixtures/address.ts";

test("a script that is not the page's own does not run, and the browser reports the policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  const ran = await page.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>;
    // A script element written into the page, as an injected string would be.
    const script = document.createElement("script");
    script.textContent = "window.__injected = 1";
    document.body.appendChild(script);
    // An inline handler.
    const img = document.createElement("img");
    img.setAttribute("onerror", "window.__handler = 1");
    img.src = "data:,not-an-image";
    document.body.appendChild(img);
    // A string handed to the page's own timer: the page's realm compiles it,
    // so the policy's eval rule applies. (eval called inside this evaluate is
    // the DevTools protocol's, which the policy does not govern — measured:
    // it ran while the page itself refused eval.)
    (window.setTimeout as unknown as (code: string, ms: number) => number)("window.__timer = 1", 0);
    // WebAssembly still compiles: the smallest valid module.
    let wasm = "compiled";
    try {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    } catch (error) {
      wasm = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { injected: w.__injected, handler: w.__handler, timer: w.__timer, wasm };
  });

  expect(ran.injected, "a script written into the page ran").toBeUndefined();
  expect(ran.handler, "an inline handler ran").toBeUndefined();
  expect(ran.timer, "a string given to the page's timer was compiled: eval is allowed").toBeUndefined();
  expect(ran.wasm, "WebAssembly no longer compiles: the PIN would break").toBe("compiled");
  await expect.poll(() => violations.length, { message: "the browser reported no CSP violation" }).toBeGreaterThan(0);

  // The policy travels with the page as a <meta>, and the stand also says it
  // as a header — the header alone carries frame-ancestors.
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(meta).toContain("script-src 'self'");
  expect(meta).not.toContain("unsafe-inline");
  expect(response?.headers()["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
});
