// The decision function. Every "is this allowed" question in the system resolves
// here, so there is exactly one answer to audit and one place to extend.
//
// A subject is anything carrying a role — a session, a stored user, a service
// identity. The core never learns how the subject was authenticated: that is the
// adapter's job. A null subject (unauthenticated, or an unrecognised role) is
// denied rather than defaulted, so a broken caller fails closed.

import { PERMISSIONS, type Permission } from "./permissions.ts";
import { ALL_PERMISSIONS, isRole, type Role, ROLE_PERMISSIONS } from "./roles.ts";

export interface AccessSubject {
  role: Role;
}

// Expand a role into its concrete permissions — used for the wire payload the
// panel consumes, so the client never carries a copy of the role map.
export function permissionsOf(role: Role): readonly Permission[] {
  if (!isRole(role)) return [];
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes(ALL_PERMISSIONS) ? PERMISSIONS : (granted as readonly Permission[]);
}

export function can(subject: AccessSubject | null | undefined, permission: Permission): boolean {
  if (!subject || !isRole(subject.role)) return false;
  return permissionsOf(subject.role).includes(permission);
}

// Convenience for guards that need all of several permissions at once.
export function canAll(
  subject: AccessSubject | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => can(subject, permission));
}
