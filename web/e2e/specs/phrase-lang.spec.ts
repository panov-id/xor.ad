// W17-LG (owner, 05.10.2026): a phrase goes out in the language of the page
// the person reads, and the node keeps it (relay/node/src/routes/feed.ts;
// what it keeps and what becomes und is feed_publish.test.ts's). The browser
// here speaks ru-RU (playwright.config.ts), so the composer's POST /feed must
// carry lang "ru" — read off the wire, not off the code.

import { expect, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

test("a phrase from the composer carries the page's language to the node", async ({ page }) => {
  const sent: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/feed") sent.push(JSON.parse(r.postData() ?? "{}"));
  });
  await register(page, { name: "Аня", age: "28" });
  await writePhrase(page, `на каком языке ${runLabel()}`);
  expect(sent.length, "the composer sent its phrase").toBeGreaterThanOrEqual(1);
  expect(sent.at(-1)?.lang, "the phrase went out without the page's language").toBe("ru");
});
