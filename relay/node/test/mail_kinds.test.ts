// Every letter is counted and logged under its own kind (B21, 2026-09-26).
// deliver() labelled all of them kind="dsa" and logged "dsa mail failed" — the
// support digest, the backup and tombstone watchdogs, the moderation stop — and
// the receipt counted itself a second time on top. The kind now comes from the
// sender, out of one list.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "test-key" });
const source = await Deno.readTextFile(new URL("../src/lib/mailer.ts", import.meta.url));

// The exported senders and the first argument each passes to deliver().
function senders(): { name: string; kind: string | null; calls: number }[] {
  const out: { name: string; kind: string | null; calls: number }[] = [];
  const chunks = source.split(/\nexport async function /).slice(1);
  for (const chunk of chunks) {
    const name = chunk.match(/^(\w+)/)![1];
    const body = chunk.split(/\n(?:export |async function deliver\()/)[0];
    const calls = [...body.matchAll(/\bdeliver\(\s*("([a-z_]+)"|[^,\s)]+)/g)];
    if (calls.length === 0) continue;
    out.push({ name, kind: calls[0][2] ?? null, calls: calls.length });
  }
  return out;
}

configured("every sender through deliver() passes its own kind from MAIL_KINDS", async () => {
  const { MAIL_KINDS } = await import("../src/lib/mailer.ts");
  const found = senders();
  assert(found.length >= 12, `only ${found.length} senders found — the parse is broken`);
  const listed = new Set<string>(MAIL_KINDS);
  const byKind = new Map<string, string>();
  for (const { name, kind, calls } of found) {
    assertEquals(calls, 1, `${name} calls deliver() ${calls} times`);
    assert(kind, `${name} calls deliver() without a kind as a string literal`);
    assert(listed.has(kind), `${name} passes kind "${kind}", which is not in MAIL_KINDS`);
    assert(!byKind.has(kind), `${name} and ${byKind.get(kind)} both pass kind "${kind}"`);
    byKind.set(kind, name);
  }
  const unused = [...listed].filter((k) => !byKind.has(k));
  assertEquals(unused, [], `kinds in MAIL_KINDS no sender passes: ${unused.join(", ")}`);
  assert(!/kind: "dsa"/.test(source), "a letter is still labelled kind=\"dsa\"");
});

async function withResendAnswering<T>(status: number, body: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ name: "refused" }), { status }));
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}
const counted = (render: () => string, kind: string, result: string) =>
  Number(render().match(new RegExp(`relay_mail_total\\{[^}]*kind="${kind}"[^}]*result="${result}"[^}]*\\} (\\d+)`))?.[1] ??
    render().match(new RegExp(`relay_mail_total\\{[^}]*result="${result}"[^}]*kind="${kind}"[^}]*\\} (\\d+)`))?.[1] ?? 0);
const allFailed = (render: () => string) =>
  [...render().matchAll(/relay_mail_total\{[^}]*result="failed"[^}]*\} (\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);

configured("a refused support digest is counted as support_digest, not as dsa", async () => {
  const { sendSupportDigest } = await import("../src/lib/mailer.ts");
  const { render } = await import("../src/lib/metrics.ts");
  const before = counted(render, "support_digest", "failed");
  const sent = await withResendAnswering(500, () => sendSupportDigest("support@alpha.test", "alpha", { new: 1, waiting: 1, frozen: 0 }));
  assertEquals(sent, false);
  assertEquals(counted(render, "support_digest", "failed") - before, 1, "the refused digest was not counted under its own kind");
});

configured("a refused receipt is one failure on relay_mail_total, not two", async () => {
  const { sendNoticeReceipt } = await import("../src/lib/mailer.ts");
  const { render } = await import("../src/lib/metrics.ts");
  const before = allFailed(render);
  const sent = await withResendAnswering(500, () => sendNoticeReceipt("notifier@example.test", { id: crypto.randomUUID() }));
  assertEquals(sent, false);
  assertEquals(allFailed(render) - before, 1, "one refused receipt counted as more than one failure");
  assertEquals(counted(render, "notice_receipt", "failed") >= 1, true, "the refused receipt is not under notice_receipt");
});
