// Tests for the relay adapter over the access core: session JWT -> subject ->
// permission check. Run: deno test (in node/).
//
// The guard reads config.session.secret, which is captured when config.ts is
// imported — so the secret is set before the dynamic imports below.
import { assert, assertEquals } from "jsr:@std/assert@1";

const SECRET = "guard-test-secret";
Deno.env.set("SESSION_SECRET", SECRET);

import { suite } from "./support/config_env.ts";

// The guard reads config.session.secret, so this suite names it rather than
// hoping the process still holds it.
const configured = suite({ SESSION_SECRET: SECRET });

const { config } = await import("../src/config.ts");
const { isDenied, requirePermission } = await import("../src/lib/access_guard.ts");
const { sign } = await import("../src/lib/jwt.ts");

const HOUR_FROM_NOW = () => Math.floor(Date.now() / 1000) + 3600;

async function requestAs(
  role: string,
  options: { secret?: string; exp?: number; email?: string; brand?: string | null; env?: string } = {},
): Promise<Request> {
  const token = await sign(
    {
      sub: options.email ?? `${role}@example.com`,
      role,
      brand: options.brand ?? null, // default: a platform operator, as before tenancy
      // The environment that minted it; authed() refuses a token from another.
      env: options.env ?? config.envName,
      exp: options.exp ?? HOUR_FROM_NOW(),
    },
    options.secret ?? SECRET,
  );
  return new Request("https://relay.test/admin/panel-users", {
    headers: { authorization: `Bearer ${token}` },
  });
}

const status = async (request: Request, permission: Parameters<typeof requirePermission>[1]) => {
  const result = await requirePermission(request, permission);
  return isDenied(result) ? result.response.status : 200;
};

configured("guard admits a permitted caller and hands back the actor", async () => {
  const result = await requirePermission(await requestAs("admin"), "panel_users.write");
  assert(!isDenied(result));
  if (isDenied(result)) return;
  assertEquals(result.user.email, "admin@example.com");
  assertEquals(result.user.role, "admin");
});

configured("guard answers 403 when authenticated but under-privileged", async () => {
  assertEquals(await status(await requestAs("moderator"), "panel_users.write"), 403);
  assertEquals(await status(await requestAs("moderator"), "logs.server.read"), 403);
  assertEquals(await status(await requestAs("viewer"), "logs.client_errors.read"), 403);
  // ...and 200 for what the role does hold.
  assertEquals(await status(await requestAs("moderator"), "logs.audit.read"), 200);
  assertEquals(await status(await requestAs("viewer"), "waitlist.read"), 200);
});

configured("guard answers 401 for anything it cannot trust", async () => {
  const bare = new Request("https://relay.test/admin/panel-users");
  assertEquals(await status(bare, "waitlist.read"), 401);

  const garbage = new Request("https://relay.test/admin/panel-users", {
    headers: { authorization: "Bearer not-a-token" },
  });
  assertEquals(await status(garbage, "waitlist.read"), 401);

  const foreign = await requestAs("admin", { secret: "someone-elses-secret" });
  assertEquals(await status(foreign, "waitlist.read"), 401);

  const expired = await requestAs("admin", { exp: Math.floor(Date.now() / 1000) - 60 });
  assertEquals(await status(expired, "waitlist.read"), 401);

  // A validly signed session whose role no longer exists is rejected outright,
  // not silently downgraded to "no permissions".
  const removedRole = await requestAs("superuser");
  assertEquals(await status(removedRole, "waitlist.read"), 401);
});

// Every environment used to sign with the same secret, so a token minted by the
// dev node — the environment with the weaker way in — verified on prod byte for
// byte. The secrets are separate now; this is what makes a mix-up a refusal
// rather than a working session on the wrong node.
configured("guard answers 401 to a session from another environment", async () => {
  const elsewhere = await requestAs("admin", { env: "prod" });
  assertEquals(await status(elsewhere, "waitlist.read"), 401);

  const local = await requestAs("admin", { env: config.envName });
  assertEquals(await status(local, "waitlist.read"), 200);
});

// Sessions minted before the claim existed carry no environment at all. They
// were signed with the shared secret being retired, so they are not grandfathered
// in: a transition window here would be the very hole this closes.
configured("guard answers 401 to a session predating the environment claim", async () => {
  const { sign } = await import("../src/lib/jwt.ts");
  const legacy = await sign(
    // Deliberately the old shape: the type no longer admits it, and a real old
    // token still has it. The ignore has to be the last thing on its own line —
    // deno reads whatever follows the rule name as more rule names, which is how
    // one comment turned into seven lint errors.
    // deno-lint-ignore no-explicit-any
    { sub: "a@example.com", role: "admin", brand: null, exp: HOUR_FROM_NOW() } as any,
    SECRET,
  );
  const request = new Request("https://relay.test/admin/panel-users", {
    headers: { authorization: `Bearer ${legacy}` },
  });
  assertEquals(await status(request, "waitlist.read"), 401);
});
