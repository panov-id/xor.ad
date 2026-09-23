// A letter the provider refused is not a letter sent. viaResend used to log a
// refusal and return, and every caller counted the letter as delivered — so the
// DSA watchdog believed it had warned someone when Resend had said 401.
import { assertEquals } from "jsr:@std/assert@1";
import { suite, useEnvironment } from "./support/config_env.ts";

const configured = suite({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "test-key" });

const aging = { id: "00000000-0000-0000-0000-000000000000", kind: "chat", age_hours: 30, stage: "remind" as const };

async function withResendAnswering(status: number, body: () => Promise<unknown>): Promise<unknown> {
  const real = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ name: "refused" }), { status }));
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}

configured("a refused letter counts as not sent", async () => {
  const { sendNoticeAging } = await import("../src/lib/mailer.ts");
  const sent = await withResendAnswering(401, () => sendNoticeAging("ops@example.org", aging));
  assertEquals(sent, false, "Resend said 401 and the letter still counted as sent");
});

configured("an accepted letter counts as sent", async () => {
  const { sendNoticeAging } = await import("../src/lib/mailer.ts");
  const sent = await withResendAnswering(200, () => sendNoticeAging("ops@example.org", aging));
  assertEquals(sent, true);
});

configured("a node with no Resend key has sent nothing", async () => {
  useEnvironment({ MAIL_TRANSPORT: "resend" });
  const { sendNoticeAging } = await import("../src/lib/mailer.ts");
  const sent = await withResendAnswering(200, () => sendNoticeAging("ops@example.org", aging));
  assertEquals(sent, false, "no key, and the letter still counted as sent");
});
