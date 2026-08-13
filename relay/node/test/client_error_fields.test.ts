// What a public caller may leave in our logs.
//
// The processing register promises that "personal data is not written to logs —
// not an email address, not the text of a message, not an identifier". Two
// fields here were quietly at odds with that: `page_url` was kept whole, query
// string included, on the page a person was actually on with whatever they had
// typed still in the address; and `extra` was stored exactly as it arrived —
// any shape, any depth, any size, chosen by whoever posted it.
//
// The landings' real use of `extra` is one small marker of which environment the
// page thought it was, and that survives. The freedom to post an object does not.

import { assertEquals } from "jsr:@std/assert@1";
import { extraFields, pagePath } from "../src/routes/client_error.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

configured("the page address keeps the path and drops the query", () => {
  assertEquals(
    pagePath("https://neighbro.place/legal?email=someone%40example.com&token=abc"),
    "https://neighbro.place/legal",
  );
  assertEquals(pagePath("https://neighbro.place/rules#section-4"), "https://neighbro.place/rules");
  // Not a URL at all — still no query survives.
  assertEquals(pagePath("/local/page?secret=1"), "/local/page");
  assertEquals(pagePath(undefined), null);
});

configured("extra is flattened, bounded, and refuses what it cannot describe", () => {
  assertEquals(extraFields({ env: "dev", attempt: 3, ok: true }), {
    env: "dev",
    attempt: "3",
    ok: "true",
  });
  // Nested shapes are dropped rather than serialised: a value we cannot describe
  // is a value we should not keep.
  assertEquals(extraFields({ env: "dev", payload: { email: "a@b.c" }, list: [1, 2] }), {
    env: "dev",
  });
  assertEquals(extraFields({ note: "x".repeat(500) })?.note.length, 200);
  assertEquals(Object.keys(extraFields(Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`k${i}`, "v"]),
  )) ?? {}).length, 12);
  assertEquals(extraFields("just a string"), null);
  assertEquals(extraFields([1, 2, 3]), null);
  assertEquals(extraFields(null), null);
});
