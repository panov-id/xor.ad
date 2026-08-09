// The one paragraph of the Article 17(3) letter that can be wrong in a way
// nobody notices: which content it is about.
//
// The snapshot is taken when a notice arrives so this can be said after the
// content itself has expired. Three states arrive here and they are not
// interchangeable — a copy, an expiry, and "we never had one". Telling somebody
// their post had expired when nobody ever looked would be a falsehood in the one
// letter that must not contain any.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { whatWasRestricted } from "../src/lib/mailer.ts";

Deno.test("quotes the author's own words, with when they posted them", () => {
  const lines = whatWasRestricted("feed_message", {
    table: "feed_messages",
    captured_at: "2026-08-09T11:00:00.000Z",
    row: { body: "две табуретки, двор дома 14", created_at: "2026-08-09T09:41:07.000Z" },
  }, "received");

  assertStringIncludes(lines[0], "2026-08-09 09:41");
  assertStringIncludes(lines[1], "две табуретки");
});

Deno.test("an offer is quoted from its own column", () => {
  const lines = whatWasRestricted("offer", {
    table: "offers",
    row: { offer_text: "кофе за полцены до полудня", created_at: "2026-08-09T08:00:00.000Z" },
  }, "received");

  assertStringIncludes(lines[1], "кофе за полцены");
});

Deno.test("an expired target says so, and does not pretend to a copy", () => {
  const lines = whatWasRestricted("feed_message", null, "target_gone");
  assertStringIncludes(lines[0], "expired");
});

Deno.test("an unsnapshottable target says we never held a copy", () => {
  const lines = whatWasRestricted("chat", null, "not_accessible");
  assertStringIncludes(lines[0], "no copy");
  // The distinction is the whole point: this must not read as an expiry.
  assertEquals(lines[0].includes("expired"), false);
});

Deno.test("nothing to say stays silent rather than guessing", () => {
  // A snapshot that came back empty for a reason we do not model: better an
  // opening paragraph that omits the content than one that invents its fate.
  assertEquals(whatWasRestricted("other", null, "received"), []);
});
