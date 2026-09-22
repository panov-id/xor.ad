// Role definitions — the only place where "what may this role do" is written
// down. Flat by design: no inheritance between roles, so a role's full power is
// readable in one line and a change to it is a reviewable diff.
//
// The wildcard "*" means every permission in the catalogue, present and future:
// admin must never silently lose access when a new permission is added.

import type { Permission } from "./permissions.ts";

export const ROLES = ["admin", "moderator", "viewer", "tenant_admin"] as const;

export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS = "*" as const;

export const ROLE_PERMISSIONS: Record<Role, readonly (Permission | typeof ALL_PERMISSIONS)[]> = {
  admin: [ALL_PERMISSIONS],
  moderator: [
    "waitlist.read",
    "panel_users.read",
    "logs.client_errors.read",
    "logs.audit.read",
    "logs.pageviews.read",
    // Reports that something published here is illegal. This is the moderator's
    // job before it is anyone's, and the role lists its permissions explicitly —
    // a new one does not arrive on its own the way it does for admin.
    "dsa_notices.read",
    "dsa_notices.decide",
    "dsa_notices.escalate",
    "feed_queue.read",
    "feed_queue.decide",
    "support.read",
    "support.answer",
  ],
  viewer: ["waitlist.read"],
  // A tenant's own administrator: full reach inside their brand, and no reach
  // into the platform. Deliberately not "*" — the wildcard would hand every
  // future platform permission to every tenant the day it is added.
  tenant_admin: [
    // Their own brand's support requests (protocol §4.10a, 2026-09-22).
    "support.read",
    "support.answer",
    "waitlist.read",
    "panel_users.read",
    "panel_users.write",
    "logs.client_errors.read",
    "logs.audit.read",
    "logs.pageviews.read",
    "api_keys.read",
    "api_keys.write",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(ROLE_PERMISSIONS, value);
}
