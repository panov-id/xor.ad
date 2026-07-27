// Tenant isolation, end to end: real admin routes, real storage (fs in a temp
// dir), real session tokens. The unit under test is the boundary itself, so a
// mock of it would test nothing.
import { assert, assertEquals } from "jsr:@std/assert@1";

const SECRET = "tenancy-test-secret";
const ENV_NAME = "test";
const storageDir = await Deno.makeTempDir();

// Env before the first import: config.ts captures it at module load.
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", SECRET);
Deno.env.set("NODE_ENV_NAME", ENV_NAME);
Deno.env.set(
  "BRANDS",
  JSON.stringify([
    { key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" },
    { key: "beta", name: "Beta", domain: "beta.test", from: "b <b@beta.test>" },
  ]),
);

const { match } = await import("../src/lib/router.ts");
const { sign } = await import("../src/lib/jwt.ts");
const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
const { sha256hex } = await import("../src/lib/hash.ts");
await import("../src/routes/admin.ts"); // registers the routes as a side effect

async function seed(): Promise<void> {
  for (const brand of ["alpha", "beta"]) {
    await scopedForBrand(brand).put(
      `waitlist/${ENV_NAME}/${await sha256hex(`lead@${brand}.test`)}.json`,
      { email: `lead@${brand}.test`, brand, created_at: "2026-07-25T10:00:00.000Z" },
    );
  }
  const platform = scopedForBrand(null);
  for (
    const [email, role, brand] of [
      ["boss@platform.test", "admin", null],
      ["boss@alpha.test", "tenant_admin", "alpha"],
      ["boss@beta.test", "tenant_admin", "beta"],
    ] as const
  ) {
    await platform.put(`panel/${ENV_NAME}/users/${await sha256hex(email)}.json`, {
      email,
      role,
      brand,
      created_at: "2026-07-25T10:00:00.000Z",
    });
  }
  // Page views, one per tenant plus one from before tenancy: the fixture the
  // merged-scope tests read, seeded here so no test depends on another running
  // first.
  for (const brand of ["alpha", "beta"]) {
    await scopedForBrand(brand).put(`pageviews/${ENV_NAME}/${brand}-view.json`, {
      path: "/",
      lang: "en",
      brand,
      received_at: "2026-07-27T09:00:00.000Z",
    });
  }
  await platform.put(`pageviews/${ENV_NAME}/legacy-view.json`, { path: "/", lang: "ru" });

  // One trail for everyone, so what a tenant may read out of it is the thing
  // worth a test. The platform's own entry carries no brand at all — the shape
  // of every record written before tenancy.
  for (
    const [file, actorBrand] of [
      ["alpha-invite", "alpha"],
      ["beta-invite", "beta"],
      ["platform-invite", null],
    ] as const
  ) {
    await platform.put(`audit/${ENV_NAME}/${file}.json`, {
      at: "2026-07-25T11:00:00.000Z",
      actor_email: `boss@${actorBrand ?? "platform"}.test`,
      actor_role: actorBrand ? "tenant_admin" : "admin",
      actor_brand: actorBrand,
      action: "panel_users.create",
      target: `new@${actorBrand ?? "platform"}.test`,
      outcome: "applied",
    });
  }
}
await seed();

// deno-lint-ignore no-explicit-any
type Body = any;

async function callAs(
  subject: { role: string; brand: string | null },
  method: string,
  path: string,
): Promise<{ status: number; body: Body }> {
  const token = await sign({
    sub: `boss@${subject.brand ?? "platform"}.test`,
    role: subject.role,
    brand: subject.brand,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, SECRET);
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const response = await found.h({
    req: new Request(url, { method, headers: { authorization: `Bearer ${token}` } }),
    params: found.params,
    url,
  });
  return { status: response.status, body: await response.json() };
}

const ALPHA = { role: "tenant_admin", brand: "alpha" } as const;
const PLATFORM = { role: "admin", brand: null } as const;

Deno.test("a tenant sees its own leads and no one else's", async () => {
  const { status, body } = await callAs(ALPHA, "GET", "/admin/waitlist");
  assertEquals(status, 200);
  assertEquals(body.map((row: { email: string }) => row.email), ["lead@alpha.test"]);
});

Deno.test("the platform sees every tenant's leads, each labelled", async () => {
  const { body } = await callAs(PLATFORM, "GET", "/admin/waitlist");
  const brands = body.map((row: { brand: string }) => row.brand).sort();
  assertEquals(brands, ["alpha", "beta"]);
});

Deno.test("a tenant cannot read another tenant's log by asking for it", async () => {
  const { status } = await callAs(ALPHA, "GET", "/admin/logs-client-errors?brand=beta");
  assertEquals(status, 403);
});

Deno.test("a tenant sees only its own operators", async () => {
  const { body } = await callAs(ALPHA, "GET", "/admin/panel-users");
  assertEquals(body.map((row: { email: string }) => row.email), ["boss@alpha.test"]);
});

Deno.test("the platform reads every tenant at once, each row saying whose it is", async () => {
  const { status, body } = await callAs(PLATFORM, "GET", "/admin/logs-pageviews");
  assertEquals(status, 200);
  // Both tenants' views, merged and labelled — the default that stopped the panel
  // from showing an empty archive.
  assertEquals(body.scope.mode, "all");
  assertEquals([...body.scope.of].sort(), ["alpha", "beta"]);
  assertEquals(
    [...new Set(body.rows.map((row: { scope: string }) => row.scope))].sort(),
    ["alpha", "beta"],
  );
});

Deno.test("the pre-migration archive is a scope you ask for by name", async () => {
  const { status, body } = await callAs(PLATFORM, "GET", "/admin/logs-pageviews?brand=platform");
  assertEquals(status, 200);
  assertEquals(body.scope.mode, "one");
  // Seeded above, in the root rather than under a tenant.
  assertEquals(body.rows.length, 1);
  assertEquals(body.rows[0].scope, "platform");
});

Deno.test("page views are a tenant's own traffic, not everyone's", async () => {
  const own = await callAs(ALPHA, "GET", "/admin/logs-pageviews");
  assertEquals(own.status, 200);
  assertEquals(own.body.rows.map((row: { brand: string }) => row.brand), ["alpha"]);

  const foreign = await callAs(ALPHA, "GET", "/admin/logs-pageviews?brand=beta");
  assertEquals(foreign.status, 403);
});

Deno.test("a tenant reads only its own entries in the shared audit trail", async () => {
  const { status, body } = await callAs(ALPHA, "GET", "/admin/logs-audit");
  assertEquals(status, 200);
  assertEquals(
    body.rows.map((row: { actor_email: string }) => row.actor_email),
    ["boss@alpha.test"],
  );
  // The counts are part of the boundary: a total taken from the whole trail
  // would tell a tenant how much activity it cannot see.
  assertEquals(body.total, 1);
  assertEquals(body.matched, 1);
});

Deno.test("the platform reads the whole audit trail", async () => {
  const { body } = await callAs(PLATFORM, "GET", "/admin/logs-audit");
  assertEquals(body.rows.length, 3);
});

Deno.test("a tenant cannot touch an operator it cannot see", async () => {
  const { status } = await callAs(ALPHA, "DELETE", "/admin/panel-users/boss@beta.test");
  assertEquals(status, 404); // not 403: existence elsewhere is not their business
});
