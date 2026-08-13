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

// A stand-in for Mailpit, on a port the OS picks. The SMTP client is a lock-step
// dialogue that never parses a reply code, so "250 ok" to everything is a
// faithful enough peer — and it lets these tests read the letter that was
// actually built, rather than trust that one would have been.
const mailbox: string[] = [];
const smtpServer = Deno.listen({ hostname: "127.0.0.1", port: 0 });
(async () => {
  for await (const conn of smtpServer) {
    (async () => {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const buffer = new Uint8Array(8192);
      let letter = "";
      try {
        await conn.write(encoder.encode("220 fake\r\n"));
        while (true) {
          const read = await conn.read(buffer);
          if (read === null) break;
          letter += decoder.decode(buffer.subarray(0, read));
          await conn.write(encoder.encode("250 ok\r\n"));
        }
      } catch {
        // The client closes mid-dialogue; nothing here to report.
      } finally {
        if (letter) mailbox.push(letter);
        try {
          conn.close();
        } catch { /* already closed by the client */ }
      }
    })();
  }
})();

Deno.env.set("MAIL_TRANSPORT", "smtp");
Deno.env.set("MAIL_SMTP_HOST", "127.0.0.1");
Deno.env.set("MAIL_SMTP_PORT", String((smtpServer.addr as Deno.NetAddr).port));
Deno.env.set(
  "BRANDS",
  JSON.stringify([
    { key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" },
    { key: "beta", name: "Beta", domain: "beta.test", from: "b <b@beta.test>" },
  ]),
);

const { config } = await import("../src/config.ts");
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
    env: config.envName,
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

// The last-admin guard keeps a scope reachable. Whether it should bind depends
// on who is asking: a tenant removing its own last operator locks the tenant out,
// the platform removing it does not — the platform is the way back in.
Deno.test({
  name: "a tenant cannot remove its own last administrator",
  sanitizeOps: false,
  async fn() {
    const { status } = await callAs(ALPHA, "DELETE", "/admin/panel-users/boss@alpha.test");
    assertEquals(status, 409);
  },
});

Deno.test({
  name: "the platform can remove a tenant's last administrator",
  sanitizeOps: false,
  async fn() {
    // A tenant of its own, so removing its only operator disturbs nothing else.
    await callAs(PLATFORM, "POST", "/admin/brands", {
      key: "delta",
      name: "Delta",
      domain: "delta.test",
      from: "d <d@delta.test>",
    });
    await callAs(PLATFORM, "POST", "/admin/panel-users", {
      email: "only@delta.test",
      role: "tenant_admin",
      brand: "delta",
    });
    const { status } = await callAs(PLATFORM, "DELETE", "/admin/panel-users/only@delta.test");
    assertEquals(status, 200);
  },
});

Deno.test({
  name: "the platform still cannot remove its own last administrator",
  sanitizeOps: false,
  async fn() {
    const { status } = await callAs(PLATFORM, "DELETE", "/admin/panel-users/boss@platform.test");
    assertEquals(status, 409); // nobody would be left to sign in and undo it
  },
});

Deno.test({
  name: "a tenant cannot touch an operator it cannot see",
  // The preceding delete writes its audit entry after answering; that write lands
  // in whichever test runs next.
  sanitizeOps: false,
  async fn() {
    const { status } = await callAs(ALPHA, "DELETE", "/admin/panel-users/boss@beta.test");
    assertEquals(status, 404); // not 403: existence elsewhere is not their business
  },
});

// --- invitations ---------------------------------------------------------------
//
// Self-service tenant registration is deliberately absent: a tenant is
// registered by the platform, and the invitation is what tells them so. The
// letter is really built and really handed to a peer (the fake SMTP above), so
// these tests read what the recipient would read.

async function magicTokensFor(email: string): Promise<{ email: string; exp: number }[]> {
  const platform = scopedForBrand(null);
  // `list` answers with names relative to the directory, and takes it without a
  // trailing slash — same shape the admin routes read their collections with.
  const dir = `panel/${ENV_NAME}/magic`;
  const names = await platform.list(dir);
  const tokens = await Promise.all(
    names.map((name) => platform.get<{ email: string; exp: number }>(`${dir}/${name}`)),
  );
  return tokens.filter((token): token is { email: string; exp: number } =>
    token !== null && token.email === email
  );
}

const daysUntil = (exp: number): number => (exp - Date.now()) / 86_400_000;

// The fake server files a letter once the client hangs up, which happens after
// sendSmtp has already returned — so the mailbox is read with a deadline rather
// than immediately.
async function letterContaining(fragment: string, timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = mailbox.find((letter) => letter.includes(fragment));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return "";
}

Deno.test({
  name: "the platform onboarding a tenant's operator invites them for a week",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    mailbox.length = 0;
    const { status, body } = await callAs(PLATFORM, "POST", "/admin/panel-users", {
      email: "invited@alpha.test",
      role: "tenant_admin",
      brand: "alpha",
    });
    assertEquals(status, 200);
    assertEquals((body as { invited: boolean }).invited, true);

    const tokens = await magicTokensFor("invited@alpha.test");
    assertEquals(tokens.length, 1, "one invitation, not one per attempt");
    // A sign-in link lives fifteen minutes; an invitation read out of an inbox
    // the next morning must not be one of those.
    const days = daysUntil(tokens[0].exp);
    assert(days > 6 && days <= 7, `expected ~7 days, got ${days}`);

    const letter = await letterContaining("invited@alpha.test");
    assert(letter, "the invitation should have reached a mail server");
    assert(letter.includes("invited to"), "the letter should say what it is");
    assert(letter.includes("/auth/callback?token="), "and carry a way in");
    assert(letter.includes("7 days"), "and say how long it lasts");
  },
});

Deno.test({
  name: "a sign-in link is the short-lived one, and stays that way",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const url = new URL("https://relay.test/auth/request-link");
    const found = match("POST", url.pathname);
    assert(found);
    const response = await found.h({
      req: new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "boss@alpha.test" }),
      }),
      params: found.params,
      url,
    });
    // 204: the route answers the same way for a member and a stranger, so it has
    // nothing to say back.
    assertEquals(response.status, 204);

    const tokens = await magicTokensFor("boss@alpha.test");
    assertEquals(tokens.length, 1);
    const minutes = (tokens[0].exp - Date.now()) / 60_000;
    assert(minutes > 14 && minutes <= 15, `expected ~15 minutes, got ${minutes}`);
  },
});

Deno.test({
  name: "a tenant adding its own operator sends nothing — those people it tells itself",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { status } = await callAs(ALPHA, "POST", "/admin/panel-users", {
      email: "moderator@alpha.test",
      role: "moderator",
    });
    assertEquals(status, 200);
    assertEquals((await magicTokensFor("moderator@alpha.test")).length, 0);
  },
});

Deno.test({
  name: "a tenant cannot re-invite an operator of a brand it cannot see",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { status } = await callAs(BETA, "POST", "/admin/panel-users/invited@alpha.test/invite");
    assertEquals(status, 404); // not 403: existence elsewhere is not their business
  },
});

// Last on purpose: it takes the mail server away, and nothing after it could
// send. What it guards is that a letter which never went out leaves no key
// behind — an unused week-long way in that nobody was ever told about.
Deno.test({
  name: "an invitation that could not be sent leaves no token behind",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    smtpServer.close();
    const { status, body } = await callAs(PLATFORM, "POST", "/admin/panel-users", {
      email: "unreachable@beta.test",
      role: "tenant_admin",
      brand: "beta",
    });
    // The operator exists either way: a delivery problem is not a reason to
    // lose the account that was just created.
    assertEquals(status, 200);
    assertEquals((body as { invited: boolean }).invited, false);
    assertEquals((await magicTokensFor("unreachable@beta.test")).length, 0);
  },
});
