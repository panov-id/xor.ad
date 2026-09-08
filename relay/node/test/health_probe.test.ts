// A health check that cannot fail is a light that is always green.
//
// Until 2026-09-08 `/health` returned `status: "ok"` without asking anything:
// the balancer read it to decide whether to steer traffic here, and a box whose
// Postgres had died kept receiving it. The runbook has a case for exactly that —
// "answers, but no work is getting done" — and no signal existed for it.
//
// The split matters as much as the probe. Liveness stays unconditional, because
// a node that answers can still serve what does not need a database and can say
// which build it is. Readiness is the one that goes 503.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

const { health, ready } = await import("../src/routes/health.ts");

// This suite runs with DATABASE_URL unset, which is the interesting case: the
// node is configured without a database, and "off" is not a failure. A node
// that was meant to run without one must not be steered away from.
configured("health answers 200 and says what it asked", async () => {
  const response = await health();
  assertEquals(response.status, 200, "liveness must not depend on a dependency");
  const body = await response.json();
  assertEquals(body.status, "ok");
  assert("database" in body, "health must report what the database answered");
  assertEquals(body.database, "off", "no DATABASE_URL is 'off', not 'down'");
});

configured("ready is a separate answer from health", async () => {
  const response = await ready();
  const body = await response.json();
  // Configured without a database: nothing is broken, so this is ready.
  assertEquals(response.status, 200);
  assertEquals(body.status, "ready");
  assertEquals(body.database, "off");
});

// The field exists to be read by a machine, so its values are a closed set: a
// balancer rule written against "down" must not be defeated by someone later
// returning "unavailable" or `false`.
configured("the database field is one of three known words", async () => {
  const body = await (await health()).json();
  assert(
    ["ok", "down", "off"].includes(body.database),
    `unexpected database state: ${body.database}`,
  );
});
