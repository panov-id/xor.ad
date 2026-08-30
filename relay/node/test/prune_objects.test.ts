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
    // Added 2026-08-30. It had been written since the CSP endpoint was built and
    // swept by nothing — the list here is the list of promises, and this one was
    // being kept by nobody because it had never been made.
    "csp-reports",
    "server-logs",
    "waitlist",
  ].sort());
});

// The numbers are read out of the documents that promise them, not copied here.
// Copied, this test was a mirror: changing a window in the code and in the test
// together left both green while the register went on promising something else,
// which is the only way this can actually be wrong.
const read = (path: string) => Deno.readTextFileSync(new URL(path, import.meta.url));

function promised(text: string, pattern: RegExp, what: string): number {
  const found = text.match(pattern);
  assert(found, `the document no longer states ${what}`);
  return Number(found![1]);
}

configured("the windows are the ones the documents promise", () => {
  const register = read("../../../docs/article-30-register_EN.md");
  const offers = read("../../../docs/offers/SPEC_EN.md");

  const logsAndErrors = promised(
    register,
    // The register gained CSP reports in this sentence on 2026-08-30; the shape
    // is deliberately narrow, so the day the sentence changes this goes red and
    // somebody reads why rather than the number drifting quietly.
    /Server logs, client errors and CSP reports (\d+) days/,
    "how long server logs and client errors are kept",
  );
  const auditTrail = promised(
    offers,
    /audit log[^.]*already pruned \((\d+) days\)/,
    "how long the audit trail is kept",
  );

  const days = Object.fromEntries(COLLECTIONS.map((c) => [c.directory, c.days]));
  assertEquals(days["server-logs"], logsAndErrors);
  assertEquals(days["client-errors"], logsAndErrors);
  assertEquals(days["client-errors-unattributed"], logsAndErrors);
  assertEquals(days["audit"], auditTrail);
  // Not an age: before launch nothing has expired, and a timer here would throw
  // away the only thing the collection exists for.
  assertEquals(days["waitlist"], null, "the waitlist window arrives with the launch date");
});

configured("every row carries its own reason", () => {
  // It used to check the sentence was longer than twenty characters, which any
  // sentence is. What it is worth checking is that a row was thought about
  // rather than copied: a duplicated reason is the signature of a pasted row,
  // and a reason that is just the directory name is no reason at all.
  //
  // The number itself is guarded by the test above, against the document that
  // promises it — which is where a silent change would actually do harm.
  const seen = new Map<string, string>();
  for (const collection of COLLECTIONS) {
    const because = collection.because.trim();
    assert(because.length > 0, `${collection.directory} has no reason`);
    assert(
      because.toLowerCase() !== collection.directory.toLowerCase(),
      `${collection.directory}: the reason repeats the name instead of explaining it`,
    );
    const twin = seen.get(because);
    assert(
      !twin,
      `${collection.directory} and ${twin} give the same reason — one of them was pasted`,
    );
    seen.set(because, collection.directory);
  }

  // The one window that is absent has to say why it is absent, or "no window"
  // reads as "nobody got to it".
  for (const collection of COLLECTIONS.filter((c) => c.days === null)) {
    assert(
      /launch/i.test(collection.because),
      `${collection.directory} has no window and does not say it is waiting on the launch`,
    );
  }
});
