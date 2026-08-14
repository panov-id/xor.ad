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

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

configured("quotes the author's own words, with when they posted them", () => {
  const lines = whatWasRestricted("feed_message", {
    table: "feed_messages",
    captured_at: "2026-08-09T11:00:00.000Z",
    row: { text: "две табуретки, двор дома 14", created_at: "2026-08-09T09:41:07.000Z" },
  }, "received");

  assertEquals(lines[0].kind, "heading");
  assertStringIncludes(lines[0].value, "2026-08-09 09:41");
  assertEquals(lines[1].kind, "quote");
  assertStringIncludes(lines[1].value, "две табуретки");
});

// This differed from the case above only by an argument the function ignored,
// and its fixture named a column a real offer snapshot does not carry — so the
// branch that runs in production was covered by nothing. Both are fixed here:
// the columns are the offer's own, and the date is asserted, which is what makes
// the two cases actually different.
configured("an offer is quoted from its own columns", () => {
  const lines = whatWasRestricted("offer", {
    table: "offers",
    row: { offer_text: "кофе за полцены до полудня", published_at: "2026-08-09T08:00:00.000Z" },
  }, "received");

  assertEquals(lines[0].kind, "heading");
  assertStringIncludes(lines[0].value, "2026-08-09 08:00");
  assertStringIncludes(lines[1].value, "кофе за полцены");
});

// The kind decides which columns are read, so a row carrying the other
// surface's columns yields no quote rather than the wrong one. Before, whichever
// column happened to be present won, and the kind was not consulted at all.
configured("the kind decides which columns are read", () => {
  const asOffer = whatWasRestricted("offer", {
    table: "offers",
    row: { text: "это фраза, а не оффер", created_at: "2026-08-09T08:00:00.000Z" },
  }, "received");
  assert(
    !asOffer.some((line) => line.value.includes("это фраза")),
    "a feed message's columns were read for an offer",
  );

  const asFeed = whatWasRestricted("feed_message", {
    table: "feed_messages",
    row: { offer_text: "это оффер, а не фраза", published_at: "2026-08-09T08:00:00.000Z" },
  }, "received");
  assert(
    !asFeed.some((line) => line.value.includes("это оффер")),
    "an offer's columns were read for a feed message",
  );
});

configured("an expired target says so, and does not pretend to a copy", () => {
  const lines = whatWasRestricted("feed_message", null, "target_gone");
  assertStringIncludes(lines[0].value, "expired");
});

configured("an unsnapshottable target says we never held a copy", () => {
  const lines = whatWasRestricted("chat", null, "not_accessible");
  assertStringIncludes(lines[0].value, "no copy");
  // The distinction is the whole point: this must not read as an expiry.
  assertEquals(lines[0].value.includes("expired"), false);
});

configured("nothing to say stays silent rather than guessing", () => {
  // A snapshot that came back empty for a reason we do not model: better an
  // opening paragraph that omits the content than one that invents its fate.
  assertEquals(whatWasRestricted("other", null, "received"), []);
});

// The letters used to go out as one paragraph with line breaks in it — the words
// were right and it read like a pasted note. What must not regress is that the
// styled and the plain versions carry the same content: the text part is what a
// stripped-down client shows, and under Article 17(3) it has to stand alone.
configured("the shell dresses a letter without losing its plain version", () => {
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
  // Not `!startsWith("<p>")`, which is true of anything starting with anything
  // else. The old shape was the letter as one undifferentiated run, so what says
  // it is gone is that the kinds of block look different from each other: a
  // quote carries its rule down the left, a heading its letter-spacing.
  assertStringIncludes(html, "border-left", "the quote is not set apart from the text");
  assertStringIncludes(html, "letter-spacing", "the heading is not set apart from the text");

  // And the plain version keeps the same distinctions with the only means it
  // has, which is what makes it a version rather than a fallback: the heading
  // uppercased, the quote indented.
  assertStringIncludes(text, "FACTS AND CIRCUMSTANCES");
  assertStringIncludes(text, "  the reason a person wrote");

  // And every block reaches both versions.
  for (const piece of ["What was done: removed.", "the reason a person wrote", "Report 27c2a4f5"]) {
    assertStringIncludes(html, piece);
    assertStringIncludes(text, piece);
  }
  assertStringIncludes(text, "FACTS AND CIRCUMSTANCES");
});

configured("a letter cannot be made to carry markup", () => {
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
configured("a panel letter wears the platform, never a storefront", () => {
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
configured("a url in a reference block is an actual link", () => {
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

// An English letter arrived headed СОСЕД, because the brand's identity carried a
// Russian name. Everything here is written in English first; a rendering in
// another script is a translation, and translations belong with the other
// translations rather than in the identity every letter reads.
configured("an operational letter is English, wordmark included", () => {
  const sosed = config.brands.find((b) => b.key === "sosed")!;

  const { html, text } = letter({
    brand: sosed,
    title: "Your report has been received",
    blocks: [{ kind: "text", value: "We received your report." }],
  });

  assertStringIncludes(html, "SOSED");
  // No Cyrillic anywhere in a letter whose every sentence is English.
  assert(!/[А-Яа-яЁё]/.test(html), "an English letter must not be headed in Cyrillic");
  assert(!/[А-Яа-яЁё]/.test(text), "the plain part must match");
});

configured("the Russian welcome still says сосед", async () => {
  const { welcomeEmail } = await import("../src/lib/welcome.ts");
  const sosed = config.brands.find((b) => b.key === "sosed")!;

  // Moving the name out of the identity must not take it out of the language it
  // belongs to: the landing greets Russian readers as сосед, and so does this.
  assertStringIncludes(welcomeEmail("ru", { brand: sosed }).html, "сосед");
  assertStringIncludes(welcomeEmail("en", { brand: sosed }).html, "Sosed");
});

// Article 16(5) asks what was decided, and the specification names four
// answers: removed, kept, the content was already gone, unreachable. The letter
// had two sentences for the four, so the two facts about the content — that it
// had expired, or that we never held it — were both reported as "we did not
// agree with your report". That is not a wording problem: it tells a notifier
// their report was dismissed on the merits when nobody ever looked at anything.
configured("the notifier is told which of the four outcomes happened", async () => {
  const { decisionOutcome } = await import("../src/lib/mailer.ts");

  assertStringIncludes(decisionOutcome("upheld", "received"), "has been restricted");
  assertStringIncludes(decisionOutcome("rejected", "received"), "the content stays");

  // These two hold whichever way the decision went, so they are said instead of
  // the decision — and neither may read as a disagreement.
  for (const decision of ["upheld", "rejected"] as const) {
    const gone = decisionOutcome(decision, "target_gone");
    assertStringIncludes(gone, "already gone");
    assert(!gone.includes("did not agree"), "an expired target is reported as a disagreement");

    const unreachable = decisionOutcome(decision, "not_accessible");
    assertStringIncludes(unreachable, "could not reach");
    assert(
      !unreachable.includes("did not agree"),
      "content we never held is reported as a disagreement",
    );
    // And the two must not read alike: "expired" and "we never had it" are
    // different answers, and the second is the one that must not sound like age.
    assert(gone !== unreachable);
  }

  // No state at all — an older notice, or a kind that never had one — falls back
  // to the decision rather than inventing a fact about the content.
  assertStringIncludes(decisionOutcome("upheld"), "has been restricted");
});
