// The windows the privacy policy promises, checked against the table that
// enforces them. A number that drifts out of one of them is a document that lies.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { COLLECTIONS } from "../tools/prune_objects.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

configured("every collection with a promised window has a row", () => {
  const named = COLLECTIONS.map((collection) => collection.directory).sort();
  assertEquals(named, [
    "audit",
    "client-errors",
    "client-errors-unattributed",
    "server-logs",
    "waitlist",
  ].sort());
});

configured("the windows are the ones the policy states", () => {
  const days = Object.fromEntries(COLLECTIONS.map((c) => [c.directory, c.days]));
  assertEquals(days["audit"], 365, "the audit trail is kept a year");
  assertEquals(days["server-logs"], 30);
  assertEquals(days["client-errors"], 30);
  assertEquals(days["client-errors-unattributed"], 30);
  // Not an age: before launch nothing has expired, and a timer here would throw
  // away the only thing the collection exists for.
  assertEquals(days["waitlist"], null, "the waitlist window arrives with the launch date");
});

configured("every row says why, so a number cannot be changed silently", () => {
  for (const collection of COLLECTIONS) {
    assert(collection.because.length > 20, `${collection.directory} has no reason`);
  }
});
