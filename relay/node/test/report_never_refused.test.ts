// A notice under Article 16 may not be refused because of a key.
//
// The route already says so in its own comment — "refusing a report of illegal
// content is refusing a legal obligation" — but the refusal it guarded against
// was its own rate limit, while an earlier one sat in tenant resolution: an
// unknown, revoked or over-quota publishable key answered 401 or 429 before the
// notice was ever stored. The counter that pays for the quota is shared with
// page views, so a storefront that got shared around could stop accepting
// reports of illegal content for the rest of the day.
//
// These tests do not assert a happy path — there is no database here, so the
// route ends at "could not store the notice". They assert the narrower thing
// that matters: whatever happens, it is not a refusal aimed at the key.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({ NODE_ENV_NAME: "test", MAIL_TRANSPORT: "none", REQUIRE_API_KEY: "true" });

// Env before the first import: config.ts captures it at module load.
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("REQUIRE_API_KEY", "true");

const { report } = await import("../src/routes/report.ts");

const notice = (headers: Record<string, string> = {}) =>
  new Request("https://node.test/report", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      target_kind: "feed_message",
      target_id: "00000000-0000-4000-8000-000000000001",
      reason_text: "This names a private address and invites people to go there.",
      bona_fide: true,
      source: "neighbro.place",
    }),
  });

// 401 and 403 are the key saying no; 429 from this route would be the quota,
// since the per-address limit is far from reached by a single request.
const refusedForTheKey = (status: number) => status === 401 || status === 403 || status === 429;

configured("a notice with no api key is not refused, even when keys are required", async () => {
  const response = await report(notice());
  const body = await response.json();
  assert(
    !refusedForTheKey(response.status),
    `refused with ${response.status}: ${JSON.stringify(body)}`,
  );
});

configured("a notice with an unknown api key is not refused", async () => {
  const response = await report(notice({ "x-api-key": "pk_no_such_key_at_all" }));
  const body = await response.json();
  assert(
    !refusedForTheKey(response.status),
    `refused with ${response.status}: ${JSON.stringify(body)}`,
  );
  // And the reason it did not go through is the missing database, not the key —
  // otherwise this test would pass for the wrong reason the day storage returns.
  assertEquals(response.status, 503);
});
