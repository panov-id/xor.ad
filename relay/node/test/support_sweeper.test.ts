// The support digest when one storefront's letter is refused (B15, 2026-09-26).
// support_sweeper.ts promises "a failed letter is logged and counted", and only
// its catch counted — while deliver() catches every refusal and answers false,
// so the counter never moved. A refused letter is now counted as failed, the
// other storefront's still goes, and the next day's pass sees the unsent one
// again: nothing is marked sent that did not leave.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
Deno.env.set("NODE_ENV_NAME", "test");
// Resend, with a key for beta only: alpha's letter is refused ("no Resend key
// for brand alpha"), beta's goes to a stubbed provider that answers 200.
Deno.env.set("MAIL_TRANSPORT", "resend");
Deno.env.set("RESEND_API_KEY", "");
Deno.env.set("RESEND_KEYS", JSON.stringify({ digestbeta: "re_test_beta" }));
Deno.env.set("BRANDS", JSON.stringify([
  { key: "digestalpha", name: "DAlpha", domain: "dalpha.test", from: "a <a@dalpha.test>" },
  { key: "digestbeta", name: "DBeta", domain: "dbeta.test", from: "b <b@dbeta.test>" },
]));

const realFetch = globalThis.fetch;
const letters: string[] = [];
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.resend.com/")) {
    letters.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
  }
  return await realFetch(input as Request, init);
}) as typeof fetch;

const { queryOrThrow } = await import("../src/lib/db.ts");
const { render } = await import("../src/lib/metrics.ts");
const { sendSupportDigests, supportDigest } = await import("../src/lib/support_sweeper.ts");

const failed = () => Number(render().match(/relay_support_digest_total\{result="failed"\} (\d+)/)?.[1] ?? 0);

Deno.test({ name: "a digest that fails for one storefront is counted as failed, and the other is sent", sanitizeOps: false, sanitizeResources: false, async fn() {
  for (const [key, domain] of [["digestalpha", "dalpha.test"], ["digestbeta", "dbeta.test"]]) {
    await queryOrThrow(
      `INSERT INTO brands (key, name, domain, sender, upper) VALUES ($1, $1, $2, 'x <x@' || $2 || '>', upper($1)) ON CONFLICT (key) DO NOTHING`,
      [key, domain]);
    await queryOrThrow(
      `INSERT INTO support_requests (public_no, body, brand) VALUES ($1, 'помогите', $2)`,
      [crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase().replace(/[ILOU]/g, "A"), key]);
  }
  // The database is shared with the suites that ran before this one, and their
  // storefronts may have a day to report too (or a tombstone, which gives every
  // face a line). Every face but digestbeta has no Resend key here, so each of
  // their lines is a refused letter: that many failures a pass, digestalpha
  // among them.
  const faces = new Set((await queryOrThrow<{ key: string }>(`SELECT key FROM brands`)).map((r) => r.key));
  const lines = (await supportDigest()).filter((l) => faces.has(l.brand));
  const refused = lines.filter((l) => l.brand !== "digestbeta").length;
  assert(lines.some((l) => l.brand === "digestalpha") && refused >= 1, `digestalpha has no digest line: ${JSON.stringify(lines)}`);
  const before = failed();
  const sent = await sendSupportDigests();
  assert(letters.some((l) => l.includes("support@dbeta.test")), "beta's digest was not sent");
  assert(!letters.some((l) => l.includes("support@dalpha.test")), "alpha's digest left without a key");
  assert(sent >= 1, `sent ${sent}`);
  assertEquals(failed() - before, refused, `${refused} refused digest(s), digestalpha's among them, not counted as failed (relay_support_digest_total{result="failed"})`);

  // The next pass: the table still holds alpha's day, so alpha is tried again,
  // refused again, and counted again; beta goes again.
  letters.length = 0;
  await sendSupportDigests();
  assert(letters.some((l) => l.includes("support@dbeta.test")), "beta's digest was not sent on the next pass");
  assertEquals(failed() - before, 2 * refused, "the next pass did not try the unsent digests again");
}});
