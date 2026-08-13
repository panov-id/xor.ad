// Unit tests for the access core (src/access/) — pure logic, no net/fs.
// Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type AccessSubject,
  ALL_PERMISSIONS,
  can,
  canAll,
  isKeyOnlyScope,
  isPermission,
  isRole,
  KEY_ONLY_SCOPES,
  PERMISSIONS,
  permissionsOf,
  ROLE_PERMISSIONS,
  ROLES,
  type Role,
  type UserSubject,
} from "../src/access/index.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

// The tenant is irrelevant to these tests: can() decides on the role alone, and
// spelling `brand: null` at every call site would suggest otherwise.
const subject = (role: Role): UserSubject => ({ role, brand: null });

configured("admin holds every permission in the catalogue", () => {
  assertEquals([...permissionsOf("admin")], [...PERMISSIONS]);
  for (const permission of PERMISSIONS) {
    assert(can(subject("admin"), permission), `admin missing ${permission}`);
  }
});

configured("moderator reads the panel and its logs but writes no users", () => {
  const moderator = subject("moderator");
  assert(can(moderator, "waitlist.read"));
  assert(can(moderator, "panel_users.read"));
  assert(can(moderator, "logs.client_errors.read"));
  assert(can(moderator, "logs.audit.read"));
  assert(!can(moderator, "panel_users.write"));
  assert(!can(moderator, "logs.server.read"));
});

configured("viewer sees the waitlist only — no logs, no users", () => {
  const viewer = subject("viewer");
  assertEquals([...permissionsOf("viewer")], ["waitlist.read"]);
  assert(!can(viewer, "logs.client_errors.read"));
  assert(!can(viewer, "logs.audit.read"));
  assert(!can(viewer, "logs.server.read"));
  assert(!can(viewer, "panel_users.read"));
});

configured("tenant_admin owns its brand and nothing of the platform", () => {
  const tenant = subject("tenant_admin");
  assert(can(tenant, "panel_users.write"));
  assert(can(tenant, "api_keys.write"));
  // The platform is not theirs: node-wide logs and the brand registry stay out.
  assert(!can(tenant, "logs.server.read"));
  assert(!can(tenant, "brands.read"));
  assert(!can(tenant, "brands.write"));
});

configured("access fails closed: no subject, unknown role, unknown permission", () => {
  assert(!can(null, "waitlist.read"));
  assert(!can(undefined, "waitlist.read"));
  // An unrecognised role is denied, not defaulted — a stale session carrying a
  // removed role loses access instead of inheriting someone else's.
  assert(!can({ role: "root", brand: null } as unknown as AccessSubject, "waitlist.read"));
  assertEquals([...permissionsOf("root" as unknown as "admin")], []);
});

configured("canAll requires every permission", () => {
  assert(canAll(subject("admin"), ["panel_users.write", "logs.server.read"]));
  assert(canAll(subject("moderator"), ["waitlist.read", "panel_users.read"]));
  assert(!canAll(subject("moderator"), ["panel_users.read", "panel_users.write"]));
  assert(canAll(subject("viewer"), []), "an empty requirement is vacuously satisfied");
  assert(!canAll(null, ["waitlist.read"]));
});

configured("catalogue integrity: unique, non-wildcard, every role defined", () => {
  assertEquals(new Set(PERMISSIONS).size, PERMISSIONS.length, "duplicate permission");
  assert(!(PERMISSIONS as readonly string[]).includes(ALL_PERMISSIONS));

  for (const role of ROLES) {
    assert(Object.hasOwn(ROLE_PERMISSIONS, role), `role ${role} has no permission list`);
  }
  assertEquals(Object.keys(ROLE_PERMISSIONS).length, ROLES.length, "role map/list drifted");

  // Every granted string is a real permission (or the wildcard) — a typo in the
  // role map would otherwise be a silently dead grant.
  for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
    for (const entry of granted) {
      assert(
        entry === ALL_PERMISSIONS || isPermission(entry),
        `${role} grants unknown permission ${entry}`,
      );
    }
  }
});

configured("guards recognise their own values", () => {
  assert(isRole("admin"));
  assert(isRole("viewer"));
  assert(!isRole("superuser"));
  assert(!isRole(undefined));
  assert(!isRole("toString"), "prototype keys are not roles");
  assert(isPermission("logs.audit.read"));
  assert(!isPermission("logs.audit"));
  assert(!isPermission(42));
});

// --- keys as subjects ----------------------------------------------------------
//
// A key carries its permissions directly. The point of the second subject kind
// is that `can()` stays the one place the question is answered — the core never
// learns whether it is talking about a person or a machine.

configured("a key holds exactly its scopes and nothing adjacent", () => {
  const key = { scopes: ["waitlist.write"] as const, brand: "sosed" };
  assert(can(key, "waitlist.write"));
  assert(!can(key, "waitlist.read"), "write must not imply read");
  assert(!can(key, "panel_users.write"));
});

configured("a key has no wildcard — there is no admin among machines", () => {
  // "*" is a role construct. Handed to a key as a scope it is simply a string
  // that matches no permission, which is the safe way for it to be meaningless.
  const key = { scopes: [ALL_PERMISSIONS] as unknown as typeof PERMISSIONS, brand: null };
  for (const permission of PERMISSIONS) {
    assert(!can(key, permission), `wildcard must not grant ${permission}`);
  }
});

configured("an empty key is denied everything, like a null subject", () => {
  const key = { scopes: [], brand: "sosed" };
  for (const permission of PERMISSIONS) assert(!can(key, permission));
  assert(!canAll(key, ["waitlist.read"]));
});

// The exception that lets a tenant issue a key rests on this being true: the
// scopes are held by nobody, so "you cannot grant what you do not hold" would
// forbid everyone. If a role ever picks one up, the rule and the exception start
// disagreeing about the same scope — and only one of them is checked per request.
configured("the key-only scopes are held by no role, wildcard aside", () => {
  for (const scope of KEY_ONLY_SCOPES) {
    assert(isPermission(scope), `${scope} is not in the catalogue`);
    assert(isKeyOnlyScope(scope));
    for (const role of ROLES) {
      if (role === "admin") continue; // holds everything through the wildcard
      assert(
        !ROLE_PERMISSIONS[role].includes(scope),
        `${role} must not list ${scope} — it is a scope for keys, not for people`,
      );
    }
  }
});

configured("a scope a person can perform is not key-only", () => {
  for (const permission of PERMISSIONS) {
    if (isKeyOnlyScope(permission)) continue;
    assert(!KEY_ONLY_SCOPES.includes(permission));
  }
  // The catalogue grows; this is the pair that must not drift silently.
  assertEquals(KEY_ONLY_SCOPES.length, PERMISSIONS.filter(isKeyOnlyScope).length);
});

configured("waitlist.write exists for keys, and no role but admin holds it", () => {
  assert(isPermission("waitlist.write"));
  for (const role of ROLES) {
    const holds = permissionsOf(role).includes("waitlist.write");
    assertEquals(holds, role === "admin", `${role} should ${role === "admin" ? "" : "not "}hold it`);
  }
});
