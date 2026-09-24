// The migration runner's order guard (review panel 2026-09-24, O3/D1). Run:
// deno test (in node/). No database: the rule is a function of two lists.
import { assertEquals } from "jsr:@std/assert@1";
import { planMigrations } from "../src/lib/migration_order.ts";

const ON_DISK = ["034_hidden_messages.sql", "039_support_requests.sql", "045_dsa_notice_counts.sql"];

Deno.test("a fresh database applies every file, in name order", () => {
  const plan = planMigrations(ON_DISK, []);
  assertEquals(plan.pending, ON_DISK);
  assertEquals(plan.outOfOrder, []);
  assertEquals(plan.ghosts, []);
});

Deno.test("a file above everything recorded is simply pending", () => {
  const plan = planMigrations([...ON_DISK, "046_next.sql"], ON_DISK);
  assertEquals(plan.pending, ["046_next.sql"]);
  assertEquals(plan.outOfOrder, []);
});

// The squash left gaps (035–038, 040). A new file in one would run between
// 034 and 039 on a fresh database and after 045 on one that has 045: the same
// files, two schemas' histories, and not a word from the runner.
Deno.test("a pending file that sorts below a recorded one is refused, naming both", () => {
  const plan = planMigrations([...ON_DISK, "036_new.sql"].sort(), ON_DISK);
  assertEquals(plan.outOfOrder, [{ file: "036_new.sql", highest: "045_dsa_notice_counts.sql" }]);
});

// A name recorded but gone from disk — the squash's five on the local stand,
// or a newer image's files after a rollback — is reported, never refused: the
// rollback path has to keep working.
Deno.test("recorded names with no file are reported as ghosts, and do not block", () => {
  const plan = planMigrations(ON_DISK, [...ON_DISK, "040_support_brand.sql"]);
  assertEquals(plan.ghosts, ["040_support_brand.sql"]);
  assertEquals(plan.outOfOrder, []);
  assertEquals(plan.pending, []);
});

// A ghost counts as recorded history: a new 040_x.sql sorts below the ghost
// 040_support_brand.sql and would run in a different place than on a fresh
// database, so it is refused like any other.
Deno.test("the highest recorded name includes ghosts", () => {
  const plan = planMigrations(["039_support_requests.sql", "040_a.sql"], ["039_support_requests.sql", "040_support_brand.sql"]);
  assertEquals(plan.outOfOrder, [{ file: "040_a.sql", highest: "040_support_brand.sql" }]);
});
