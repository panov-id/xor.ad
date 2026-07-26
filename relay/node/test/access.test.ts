// Unit tests for the access core (src/access/) — pure logic, no net/fs.
// Run: deno test (in node/).
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type AccessSubject,
  ALL_PERMISSIONS,
  can,
  canAll,
  isPermission,
  isRole,
  PERMISSIONS,
  permissionsOf,
  ROLE_PERMISSIONS,
  ROLES,
} from "../src/access/index.ts";

// The tenant is irrelevant to these tests: can() decides on the role alone, and
// spelling `brand: null` at every call site would suggest otherwise.
const subject = (role: AccessSubject["role"]): AccessSubject => ({ role, brand: null });

Deno.test("admin holds every permission in the catalogue", () => {
  assertEquals([...permissionsOf("admin")], [...PERMISSIONS]);
  for (const permission of PERMISSIONS) {
    assert(can(subject("admin"), permission), `admin missing ${permission}`);
  }
});

Deno.test("moderator reads the panel and its logs but writes no users", () => {
  const moderator = subject("moderator");
  assert(can(moderator, "waitlist.read"));
  assert(can(moderator, "panel_users.read"));
  assert(can(moderator, "logs.client_errors.read"));
  assert(can(moderator, "logs.audit.read"));
  assert(!can(moderator, "panel_users.write"));
  assert(!can(moderator, "logs.server.read"));
});

Deno.test("viewer sees the waitlist only — no logs, no users", () => {
  const viewer = subject("viewer");
  assertEquals([...permissionsOf("viewer")], ["waitlist.read"]);
  assert(!can(viewer, "logs.client_errors.read"));
  assert(!can(viewer, "logs.audit.read"));
  assert(!can(viewer, "logs.server.read"));
  assert(!can(viewer, "panel_users.read"));
});

Deno.test("tenant_admin owns its brand and nothing of the platform", () => {
  const tenant = subject("tenant_admin");
  assert(can(tenant, "panel_users.write"));
  assert(can(tenant, "api_keys.write"));
  // The platform is not theirs: node-wide logs and the brand registry stay out.
  assert(!can(tenant, "logs.server.read"));
  assert(!can(tenant, "brands.read"));
  assert(!can(tenant, "brands.write"));
});

Deno.test("access fails closed: no subject, unknown role, unknown permission", () => {
  assert(!can(null, "waitlist.read"));
  assert(!can(undefined, "waitlist.read"));
  // An unrecognised role is denied, not defaulted — a stale session carrying a
  // removed role loses access instead of inheriting someone else's.
  assert(!can({ role: "root", brand: null } as unknown as AccessSubject, "waitlist.read"));
  assertEquals([...permissionsOf("root" as unknown as "admin")], []);
});

Deno.test("canAll requires every permission", () => {
  assert(canAll(subject("admin"), ["panel_users.write", "logs.server.read"]));
  assert(canAll(subject("moderator"), ["waitlist.read", "panel_users.read"]));
  assert(!canAll(subject("moderator"), ["panel_users.read", "panel_users.write"]));
  assert(canAll(subject("viewer"), []), "an empty requirement is vacuously satisfied");
  assert(!canAll(null, ["waitlist.read"]));
});

Deno.test("catalogue integrity: unique, non-wildcard, every role defined", () => {
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

Deno.test("guards recognise their own values", () => {
  assert(isRole("admin"));
  assert(isRole("viewer"));
  assert(!isRole("superuser"));
  assert(!isRole(undefined));
  assert(!isRole("toString"), "prototype keys are not roles");
  assert(isPermission("logs.audit.read"));
  assert(!isPermission("logs.audit"));
  assert(!isPermission(42));
});
