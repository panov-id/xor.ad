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
  body?: unknown,
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
    req: new Request(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: found.params,
    url,
  });
  return { status: response.status, body: await response.json() };
}

const ALPHA = { role: "tenant_admin", brand: "alpha" } as const;
const BETA = { role: "tenant_admin", brand: "beta" } as const;
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

// Keys name a tenant, so who may mint and see one is the same boundary as the
// data itself — with a sharper edge: a key minted for the wrong brand would hand
// over a tenant's traffic, not merely show it.
// Writes audit entries, which are fire-and-forget by design: the op sanitizer
// would otherwise attribute that write to whichever test runs next.
Deno.test({
  name: "a tenant mints keys only for itself",
  sanitizeOps: false,
  async fn() {
  const own = await callAs(ALPHA, "POST", "/admin/api-keys", {
    brand: "beta", // ignored: the session decides, not the body
    origins: ["https://alpha.test"],
  });
  assertEquals(own.status, 201);
  assertEquals(own.body.brand, "alpha");
  },
});

// Writes audit entries, which are fire-and-forget by design: the op sanitizer
// would otherwise attribute that write to whichever test runs next.
Deno.test({
  name: "a tenant sees only its own keys",
  sanitizeOps: false,
  async fn() {
  await callAs(BETA, "POST", "/admin/api-keys", { origins: ["https://beta.test"] });
  const { body } = await callAs(ALPHA, "GET", "/admin/api-keys");
  assert(body.length > 0);
  assert(body.every((key: { brand: string }) => key.brand === "alpha"));
  },
});

// Writes audit entries, which are fire-and-forget by design: the op sanitizer
// would otherwise attribute that write to whichever test runs next.
Deno.test({
  name: "a tenant cannot revoke a key it cannot see",
  sanitizeOps: false,
  async fn() {
  const minted = await callAs(BETA, "POST", "/admin/api-keys", { origins: ["https://beta.test"] });
  const { status } = await callAs(ALPHA, "POST", `/admin/api-keys/${minted.body.id}/revoke`);
  assertEquals(status, 404); // not 403: its existence is not alpha's business
  },
});

Deno.test("an origin has to be an origin", async () => {
  const { status, body } = await callAs(ALPHA, "POST", "/admin/api-keys", {
    origins: ["alpha.test/path"],
  });
  assertEquals(status, 422);
  assert(String(body.error).includes("not an origin"));
});

Deno.test("a tenant cannot write the brand registry", async () => {
  const { status } = await callAs(ALPHA, "POST", "/admin/brands", {
    key: "gamma",
    name: "Gamma",
    domain: "gamma.test",
    from: "g <g@gamma.test>",
  });
  assertEquals(status, 403);
});

Deno.test("a seeded brand is not editable through the registry", async () => {
  const { status, body } = await callAs(PLATFORM, "POST", "/admin/brands", {
    key: "alpha", // seeded from BRANDS in this test's environment
    name: "Alpha renamed",
    domain: "alpha.test",
    from: "a <a@alpha.test>",
  });
  assertEquals(status, 409);
  assert(String(body.error).includes("seeded"));
});

// Writes audit entries, which are fire-and-forget by design: the op sanitizer
// would otherwise attribute that write to whichever test runs next.
Deno.test({
  name: "the platform onboards a brand by writing it",
  sanitizeOps: false,
  async fn() {
  const { status, body } = await callAs(PLATFORM, "POST", "/admin/brands", {
    key: "gamma",
    name: "Gamma",
    domain: "gamma.test",
    from: "Gamma <hey@gamma.test>",
  });
  assertEquals(status, 201);
  assertEquals(body.key, "gamma");
  // Visible to this node at once — that is what makes onboarding a write.
  const listed = await callAs(PLATFORM, "GET", "/admin/brands");
  assert(listed.body.some((brand: { key: string }) => brand.key === "gamma"));
  },
});

// Onboarding ends at the brand unless the platform can also create that brand's
// first administrator — nobody inside the tenant exists yet to do it.
Deno.test({
  name: "the platform creates a tenant's first administrator",
  sanitizeOps: false,
  async fn() {
    const created = await callAs(PLATFORM, "POST", "/admin/panel-users", {
      email: "first@beta.test",
      role: "tenant_admin",
      brand: "beta",
    });
    assertEquals(created.status, 200);

    const seen = await callAs(BETA, "GET", "/admin/panel-users");
    assert(seen.body.some((row: { email: string }) => row.email === "first@beta.test"));
    // And alpha still cannot see them.
    const other = await callAs(ALPHA, "GET", "/admin/panel-users");
    assert(!other.body.some((row: { email: string }) => row.email === "first@beta.test"));
  },
});

Deno.test("the platform role cannot be handed to a tenant's operator", async () => {
  const { status } = await callAs(PLATFORM, "POST", "/admin/panel-users", {
    email: "wildcard@beta.test",
    role: "admin",
    brand: "beta",
  });
  assertEquals(status, 422);
});

Deno.test("a tenant cannot touch an operator it cannot see", async () => {
  const { status } = await callAs(ALPHA, "DELETE", "/admin/panel-users/boss@beta.test");
  assertEquals(status, 404); // not 403: existence elsewhere is not their business
});
