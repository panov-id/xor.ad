// Every spec comes from an address of its own, the way the storefronts reach
// the node in production: Bunny puts the visitor's address in X-Client-IP and
// proves itself with X-Origin-Token (relay/node/src/lib/client_ip.ts). The
// stand's node gets the same token (docker-compose.web.yml ORIGIN_TOKEN), and
// this fixture stamps both headers on every context a spec opens — the `page`
// it is given and the contexts it makes itself with browser.newContext(). So
// the ten-registrations-an-hour ceiling (rate_limit.ts IDENTITY_CREATE_LIMITS)
// counts per spec, not per run, as it counts per household in production; the
// ceiling itself is untouched, and a spec that registers eleven still meets it.
//
// The address is a function of the spec's file name, so a run is repeatable
// and two specs never share one.

import { test as base, type Browser, type BrowserContextOptions } from "@playwright/test";

export { expect, type BrowserContext, type Page } from "@playwright/test";

export const ORIGIN_TOKEN = "web-test-origin-token";

// 203.0.113.0/24 is documentation space (RFC 5737): never routed, never a real neighbour.
export function addressFor(file: string): string {
  let h = 0;
  for (const c of file.replace(/^.*\//, "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `203.0.113.${(h % 250) + 1}`;
}

export const headersFor = (file: string): Record<string, string> => ({
  "x-origin-token": ORIGIN_TOKEN,
  "x-client-ip": addressFor(file),
});

export const test = base.extend<{ stamped: void }>({
  // The context Playwright makes for `page`.
  contextOptions: async ({ contextOptions }, use, testInfo) => {
    await use({ ...contextOptions, extraHTTPHeaders: { ...(contextOptions.extraHTTPHeaders ?? {}), ...headersFor(testInfo.file) } });
  },
  // The contexts a spec makes itself: browser.newContext() carries the same
  // headers for as long as this test runs, and is given back afterwards.
  stamped: [async ({ browser }, use, testInfo) => {
    const original = browser.newContext.bind(browser);
    const headers = headersFor(testInfo.file);
    (browser as Browser).newContext = (options: BrowserContextOptions = {}) =>
      original({ ...options, extraHTTPHeaders: { ...(options.extraHTTPHeaders ?? {}), ...headers } });
    await use();
    (browser as Browser).newContext = original;
  }, { auto: true }],
});
