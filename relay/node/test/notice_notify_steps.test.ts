// The standing DSA letters job runs every step whatever the one before did
// (review panel G4, B47, 2026-09-26): the decision letters' retry threw and the
// night path's summary after it — the path for a threat to life — did not run.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

configured("a failing step of the DSA letters job does not stop the ones after it", async () => {
  const { runNoticeNotify } = await import("../src/lib/scheduled.ts");
  const ran: string[] = [];
  const failure = new Error("the decision letters could not be read");
  await assertRejects(
    () => runNoticeNotify([
      () => { ran.push("arrival"); return Promise.resolve(); },
      () => { ran.push("decision"); return Promise.reject(failure); },
      () => { ran.push("night path summary"); return Promise.resolve(); },
    ]),
    Error,
    "the decision letters could not be read",
  );
  assertEquals(ran, ["arrival", "decision", "night path summary"], "a step after the failing one did not run");
});

configured("the first failure is the one the job reports", async () => {
  const { runNoticeNotify } = await import("../src/lib/scheduled.ts");
  let caught: unknown = null;
  try {
    await runNoticeNotify([
      () => Promise.reject(new Error("first")),
      () => Promise.reject(new Error("second")),
    ]);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error && caught.message === "first", `reported ${String(caught)}`);
});
