// The one paragraph of the Article 17(3) letter that can be wrong in a way
// nobody notices: which content it is about.
//
// The snapshot is taken when a notice arrives so this can be said after the
// content itself has expired. Three states arrive here and they are not
// interchangeable — a copy, an expiry, and "we never had one". Telling somebody
// their post had expired when nobody ever looked would be a falsehood in the one
// letter that must not contain any.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { whatWasRestricted } from "../src/lib/mailer.ts";
import { letter, PLATFORM } from "../src/lib/email_shell.ts";
import { config } from "../src/config.ts";

Deno.test("quotes the author's own words, with when they posted them", () => {
  const lines = whatWasRestricted("feed_message", {
    table: "feed_messages",
    captured_at: "2026-08-09T11:00:00.000Z",
    row: { body: "две табуретки, двор дома 14", created_at: "2026-08-09T09:41:07.000Z" },
  }, "received");

  assertEquals(lines[0].kind, "heading");
  assertStringIncludes(lines[0].value, "2026-08-09 09:41");
  assertEquals(lines[1].kind, "quote");
  assertStringIncludes(lines[1].value, "две табуретки");
});

Deno.test("an offer is quoted from its own column", () => {
  const lines = whatWasRestricted("offer", {
    table: "offers",
    row: { offer_text: "кофе за полцены до полудня", created_at: "2026-08-09T08:00:00.000Z" },
  }, "received");

  assertStringIncludes(lines[1].value, "кофе за полцены");
});

Deno.test("an expired target says so, and does not pretend to a copy", () => {
  const lines = whatWasRestricted("feed_message", null, "target_gone");
  assertStringIncludes(lines[0].value, "expired");
});

Deno.test("an unsnapshottable target says we never held a copy", () => {
  const lines = whatWasRestricted("chat", null, "not_accessible");
  assertStringIncludes(lines[0].value, "no copy");
  // The distinction is the whole point: this must not read as an expiry.
  assertEquals(lines[0].value.includes("expired"), false);
});

Deno.test("nothing to say stays silent rather than guessing", () => {
  // A snapshot that came back empty for a reason we do not model: better an
  // opening paragraph that omits the content than one that invents its fate.
  assertEquals(whatWasRestricted("other", null, "received"), []);
});

// The letters used to go out as one paragraph with line breaks in it — the words
// were right and it read like a pasted note. What must not regress is that the
// styled and the plain versions carry the same content: the text part is what a
// stripped-down client shows, and under Article 17(3) it has to stand alone.
Deno.test("the shell dresses a letter without losing its plain version", () => {
  const brand = config.brands[0];
  const { html, text } = letter({
    brand,
    title: "Something you posted has been restricted",
    blocks: [
      { kind: "text", value: "What was done: removed." },
      { kind: "heading", value: "Facts and circumstances" },
      { kind: "quote", value: "the reason a person wrote" },
      { kind: "reference", value: "Report 27c2a4f5" },
    ],
  });

  // Dressed: the brand's own wordmark and accent, not a bare paragraph.
  assertStringIncludes(html, brand.upper);
  assertStringIncludes(html, "table");
  assert(!html.startsWith("<p>"), "the old shape was a single paragraph");

  // And every block reaches both versions.
  for (const piece of ["What was done: removed.", "the reason a person wrote", "Report 27c2a4f5"]) {
    assertStringIncludes(html, piece);
    assertStringIncludes(text, piece);
  }
  assertStringIncludes(text, "FACTS AND CIRCUMSTANCES");
});

Deno.test("a letter cannot be made to carry markup", () => {
  // The quote block prints somebody's own words — a notifier's reason, an
  // author's post. Those arrive from a form.
  const { html } = letter({
    brand: config.brands[0],
    title: "t",
    blocks: [{ kind: "quote", value: '<img src=x onerror="alert(1)">' }],
  });
  assert(!html.includes("<img"), "content must not become markup");
  assertStringIncludes(html, "&lt;img");
});

// A sign-in link went out wearing СОСЕД and pointing at xor.panov.id, because the
// panel letters reached for config.brands[0] — "the first brand" — which is a
// storefront. On a letter that hands over access, branding that belongs to
// somebody else is not a cosmetic fault: it teaches the reader that the face on
// such a letter means nothing.
Deno.test("a panel letter wears the platform, never a storefront", () => {
  const { html, text } = letter({
    brand: PLATFORM,
    title: "Sign in to the panel",
    blocks: [{ kind: "reference", value: "https://xor.panov.id/auth/callback?token=x" }],
  });

  assertStringIncludes(html, "XOR");
  assertStringIncludes(html, "xor.panov.id");
  assertStringIncludes(html, "#7d9bff"); // the panel's own accent
  assertStringIncludes(text, "xor.panov.id");

  for (const storefront of ["СОСЕД", "sosed.place", "NEIGHBRO", "neighbro.place"]) {
    assert(!html.includes(storefront), `a panel letter must not wear ${storefront}`);
    assert(!text.includes(storefront), `a panel letter must not wear ${storefront}`);
  }
});

// The sign-in letter is the one where a link that is not a link makes the letter
// useless. Some clients autolink a bare URL; that is not a thing to depend on.
Deno.test("a url in a reference block is an actual link", () => {
  const { html, text } = letter({
    brand: PLATFORM,
    title: "Sign in to the panel",
    blocks: [
      { kind: "reference", value: "https://xor.panov.id/auth/callback?token=x" },
      { kind: "reference", value: "Reference: 27c2a4f5" },
    ],
  });

  assertStringIncludes(html, '<a href="https://xor.panov.id/auth/callback?token=x"');
  // A plain reference stays plain — it is an id, not somewhere to go.
  assert(!html.includes('<a href="Reference'), "a reference id must not become a link");
  // And the plain-text part keeps the url readable either way.
  assertStringIncludes(text, "https://xor.panov.id/auth/callback?token=x");
});
