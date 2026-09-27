// A node configured without mail (MAIL_TRANSPORT=none) sends nothing and
// counts nothing as failed: deliver() itself stops, so a sender that forgets
// to check cannot light MailFailing on such a node (O1c, 2026-09-27).
import { assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({ MAIL_TRANSPORT: "none" });

const failed = (text: string) =>
  [...text.matchAll(/relay_mail_total\{[^}]*result="failed"[^}]*\} (\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);

configured("with no mail transport, deliver() counts no letter as failed and calls no provider", async () => {
  const { sendAdvertiserLink, sendOfferLinkOff } = await import("../src/lib/mailer.ts");
  const { render } = await import("../src/lib/metrics.ts");
  const brand = { key: "alpha", name: "Alpha", from: "a <a@alpha.test>", domain: "alpha.test", upper: "ALPHA" };
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    const before = failed(render());
    assertEquals(await sendAdvertiserLink("owner@example.test", brand, "https://adv.alpha.test/enter#x"), false);
    assertEquals(await sendOfferLinkOff("owner@example.test", brand, "Кофейня"), false);
    assertEquals(failed(render()) - before, 0, "a node without mail counted its letters as failed");
    assertEquals(calls, 0, "a node without mail called a provider");
  } finally {
    globalThis.fetch = real;
  }
});
