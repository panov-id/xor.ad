// Somebody has to be told a report arrived — and told only what belongs in a
// shared inbox.
//
// Intake used to send a receipt to the notifier and nothing to us: a moderator
// found a report by opening the page, while the storefronts promise in public
// that we examine reports and the specification puts 72 hours on it. A queue
// read by chance does not keep a promise with a clock on it.
//
// The letter is built by its own function so it can be read without sending
// anything, which is also how the second half of this is checked: what the
// letter must NOT carry.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

const { noticeArrivedBlocks } = await import("../src/lib/mailer.ts");

const textOf = (blocks: { kind: string; value: string }[]) =>
  blocks.map((b) => b.value).join("\n");

configured("the letter names the report and where it landed", () => {
  const body = textOf(noticeArrivedBlocks({
    id: "21b6ec3d-a8eb-4070-813d-81c8f44164a7",
    kind: "feed_message",
    queue: "tenant",
  }));
  assert(body.includes("21b6ec3d"), "a reference is the one thing a moderator needs to find it");
  assert(body.includes("feed message"), "what the report is about, in words");
  assert(body.includes("72 hours"), "the clock is named, since that is why this letter exists");
  assert(body.includes("your queue"), "a tenant's report is in the tenant's queue");
});

configured("a platform report says so, and names the face it came through", () => {
  const body = textOf(noticeArrivedBlocks({
    id: "abc12345-0000-4000-8000-000000000001",
    kind: "offer",
    queue: "platform",
    receivedVia: "sosed",
  }));
  assert(body.includes("platform queue"), "the platform queue is a different place to look");
  assert(body.includes("sosed"), "which storefront it was filed through");
});

// The half that matters more. This letter goes to a shared address, over the
// least private hop in the system, and is kept by a mail provider — so the
// report's content and the person who sent it stay out of it. Everything needed
// to examine the report is in the panel, behind a login.
configured("the letter carries neither the reason text nor the notifier", () => {
  const body = textOf(noticeArrivedBlocks({
    id: "abc12345-0000-4000-8000-000000000001",
    kind: "feed_message",
    queue: "tenant",
  })).toLowerCase();
  for (const forbidden of ["reason", "notifier", "email", "@"]) {
    assert(!body.includes(forbidden), `the letter must not carry "${forbidden}"`);
  }
});

configured("a notice with no id still produces a letter", () => {
  // Free-form reports have no target and can have no id yet; a letter that
  // throws here would take the notice down with it.
  const body = textOf(noticeArrivedBlocks({ id: null, kind: "other", queue: "platform" }));
  assert(body.includes("Reference: —"), "an absent reference is shown as absent");
  assertEquals(typeof body, "string");
});
