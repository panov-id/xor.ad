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
  ],
  viewer: ["waitlist.read"],
  // A tenant's own administrator: full reach inside their brand, and no reach
  // into the platform. Deliberately not "*" — the wildcard would hand every
  // future platform permission to every tenant the day it is added.
  tenant_admin: [
    "waitlist.read",
    "panel_users.read",
    "panel_users.write",
    "logs.client_errors.read",
    "logs.audit.read",
    "api_keys.read",
    "api_keys.write",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(ROLE_PERMISSIONS, value);
}
