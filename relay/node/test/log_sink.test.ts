// Which log levels are copied into storage. The copy itself is fire-and-forget
// I/O (verified live by scripts/verify-server-logs-local.sh); the decision of
// what is worth keeping is pure, and that is what is pinned here.
// Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { log, shouldPersist } from "../src/lib/log.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

configured("only the noteworthy levels are kept", () => {
  assert(shouldPersist("error"));
  assert(shouldPersist("warn"));
  // info is one line per request: keeping it would mean an object per request,
  // which is a cost the panel does not need to pay to show what went wrong.
  assert(!shouldPersist("info"));
});

// The logger threw on a job's id, which arrives from the driver as a bigint that
// JSON.stringify refuses. It threw from inside the failure handler — so the one
// line explaining why a job failed was replaced by a TypeError, and the retry
// path raised instead of returning. Whatever a caller hands over, this must
// produce a line.
configured("a bigint field is logged, not thrown over", () => {
  const printed: string[] = [];
  const original = console.log;
  console.log = (line: string) => printed.push(line);
  try {
    log("info", "job failed, will retry", { id: 9007199254740993n, attempts: 1 });
  } finally {
    console.log = original;
  }
  assertEquals(printed.length, 1);
  const entry = JSON.parse(printed[0]);
  assertEquals(entry.id, "9007199254740993");
  assertEquals(entry.attempts, 1);
});
