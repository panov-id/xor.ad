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

const { health, ready, forgetProbe } = await import("../src/routes/health.ts");

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

// A node with a database but no VAULT_SHARE_KEY answers 503 on the whole feed
// and the likes (lib/cursor.ts) while it looks alive (review panel 2026-09-24,
// operations lens). Readiness says so; liveness stays 200 and names it. A node
// without a database serves no feed, so the key is not asked of it.
Deno.test("a node with a database and no vault key is not ready, and says why", async () => {
  const { readiness } = await import("../src/routes/health.ts");
  assertEquals(readiness({ database: "ok", databaseEnabled: true, vaultKey: true }), { ok: true, reasons: [] });
  assertEquals(readiness({ database: "ok", databaseEnabled: true, vaultKey: false }),
    { ok: false, reasons: ["vault_key_missing"] }, "a node that cannot serve the feed was called ready");
  assertEquals(readiness({ database: "down", databaseEnabled: true, vaultKey: false }),
    { ok: false, reasons: ["database_down", "vault_key_missing"] });
  assertEquals(readiness({ database: "off", databaseEnabled: false, vaultKey: false }), { ok: true, reasons: [] },
    "a node without a database was held to a key it has no use for");
  // No database where one is meant to be: a deploy that lost DATABASE_URL.
  for (const env of ["staging", "prod"]) {
    assertEquals(readiness({ database: "off", databaseEnabled: false, vaultKey: false, env }),
      { ok: false, reasons: ["database_off"] }, `a ${env} node without a database was called ready`);
  }
  for (const env of ["dev", "local"]) {
    assertEquals(readiness({ database: "off", databaseEnabled: false, vaultKey: false, env }), { ok: true, reasons: [] },
      `a ${env} stand without a database, which is meant to run so, was called not ready`);
  }
});

configured("health names whether the vault key is set, and stays 200 either way", async () => {
  const response = await health();
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.vault_key, "missing", "health does not say the key is missing");
});

// ready() hands readiness() the node's own env: without that line the pure
// rule above stays green and a staging node with no database still answers
// ready (the verifier of d60fdac removed it and the unit run stayed 204+36).
const staging = suite({ NODE_ENV_NAME: "staging" });
staging("a staging node with no database answers /ready 503 and names database_off", async () => {
  forgetProbe();
  const response = await ready();
  const body = await response.json();
  assertEquals(response.status, 503, "a staging node without a database answered ready");
  assertEquals(body.env, "staging");
  assertEquals(body.reasons, ["database_off"]);
});
