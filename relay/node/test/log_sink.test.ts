// Which log levels are copied into storage. The copy itself is fire-and-forget
// I/O (verified live by scripts/verify-server-logs-local.sh); the decision of
// what is worth keeping is pure, and that is what is pinned here.
// Run: deno test (in node/).
import { assert } from "jsr:@std/assert@1";
import { shouldPersist } from "../src/lib/log.ts";

Deno.test("only the noteworthy levels are kept", () => {
  assert(shouldPersist("error"));
  assert(shouldPersist("warn"));
  // info is one line per request: keeping it would mean an object per request,
  // which is a cost the panel does not need to pay to show what went wrong.
  assert(!shouldPersist("info"));
});
