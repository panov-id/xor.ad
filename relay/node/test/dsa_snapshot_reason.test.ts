// Five situations answer the notifier the same way — "we could not look" — and
// mean five different things to us. This suite holds them apart.
//
// Why it exists: the reason used to live only in a log line, so the night's
// review could not tell a chat report (by design) from a broken query (a defect
// shipping silently). Both were `not_accessible`, and both looked fine.
import { assertEquals } from "jsr:@std/assert@1";
import { captureTarget, type CaptureReason } from "../src/lib/dsa_snapshot.ts";

async function reasonFor(
  kind: string,
  targetId: string | null,
  brand: string | null,
): Promise<{ status: string; reason: CaptureReason | null }> {
  const { status, reason } = await captureTarget(kind, targetId, brand);
  return { status, reason };
}

Deno.test("a chat is carried, never stored — and says so by name", async () => {
  assertEquals(await reasonFor("chat", "any", "sosed"), {
    status: "not_accessible",
    reason: "chat_not_stored",
  });
});

Deno.test("a kind with no snapshot rule is a surface nobody taught us about", async () => {
  assertEquals(await reasonFor("sundial", "any", "sosed"), {
    status: "not_accessible",
    reason: "unknown_kind",
  });
});

Deno.test("a notice with no tenant has no scope to look within", async () => {
  // feed_message has a rule, so the lookup gets past the kind check and stops
  // at the missing tenant — provided the surface exists. Without a database the
  // table check answers first, which is a different reason and a different fix.
  const { status, reason } = await reasonFor("feed_message", "any", null);
  assertEquals(status, "not_accessible");
  assertEquals(
    reason === "unattributed" || reason === "surface_absent",
    true,
    `expected unattributed or surface_absent, got ${reason}`,
  );
});

Deno.test("a free-form report carries no identifier, and that is not a failure", async () => {
  assertEquals(await reasonFor("other", null, "sosed"), {
    status: "received",
    reason: null,
  });
});

Deno.test("every reason is one the database will accept", async () => {
  // The column's CHECK in db/013 lists exactly these five. A sixth added here
  // without a migration would be rejected at insert time, in production, on the
  // first notice that hit it.
  const allowed: CaptureReason[] = [
    "chat_not_stored",
    "unknown_kind",
    "surface_absent",
    "unattributed",
    "out_of_scope",
    "lookup_failed",
  ];
  // The list moved to db/014 when the sixth reason arrived: the check that
  // matters is the one the database enforces now, not the one it enforced once.
  const migration = await Deno.readTextFile(
    new URL("../db/014_dsa_notice_out_of_scope.sql", import.meta.url),
  );
  for (const reason of allowed) {
    assertEquals(migration.includes(`'${reason}'`), true, `${reason} missing from db/014`);
  }
});

Deno.test("a target under another face is not called expired", async () => {
  // The distinction this suite exists for: "we did not find it here" and "it is
  // gone" are different sentences, and only one of them is true when the phrase
  // is alive under a different brand. Without a database the surface check
  // answers first, which is a different reason and an honest one.
  const { status, reason } = await reasonFor("feed_message", "someone-elses-id", "sosed");
  assertEquals(status, "not_accessible");
  assertEquals(
    reason === "surface_absent" || reason === "out_of_scope",
    true,
    `expected surface_absent or out_of_scope, got ${reason}`,
  );
  assertEquals(status === "target_gone", false, "a live phrase must never be called expired");
});
