// The decision function. Every "is this allowed" question in the system resolves
// here, so there is exactly one answer to audit and one place to extend.
//
// A subject is anything carrying a role — a session, a stored user, a service
// identity. The core never learns how the subject was authenticated: that is the
// adapter's job. A null subject (unauthenticated, or an unrecognised role) is
// denied rather than defaulted, so a broken caller fails closed.

import { PERMISSIONS, type Permission } from "./permissions.ts";
import { ALL_PERMISSIONS, isRole, type Role, ROLE_PERMISSIONS } from "./roles.ts";

// The tenant a subject acts within is `brand`; null means a platform operator,
// not confined to one. `can()` ignores it on purpose: "may this action happen"
// and "over whose data" are separate questions, and mixing them here would make
// every permission check silently tenant-shaped.
export interface UserSubject {
  role: Role;
  brand: string | null;
}

// A machine. It carries its permissions directly rather than through a role,
// because a key is issued for a job — "write leads", nothing else — and a role
// is a bundle someone else decided the shape of. The strings are the same ones
// roles expand to: a second vocabulary would drift from the first within a
// release, and then two places would have to agree about what "waitlist.read"
// means.
export interface KeySubject {
  scopes: readonly Permission[];
  brand: string | null;
}

export type AccessSubject = UserSubject | KeySubject;

const isKey = (subject: AccessSubject): subject is KeySubject => "scopes" in subject;

// Expand a role into its concrete permissions — used for the wire payload the
// panel consumes, so the client never carries a copy of the role map.
export function permissionsOf(role: Role): readonly Permission[] {
  if (!isRole(role)) return [];
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes(ALL_PERMISSIONS) ? PERMISSIONS : (granted as readonly Permission[]);
}

export function can(subject: AccessSubject | null | undefined, permission: Permission): boolean {
  if (!subject) return false;
  // A key holds exactly what it was granted — no expansion, no wildcard. There
  // is deliberately no equivalent of the `admin` role for keys: a machine that
  // may do everything is a machine nobody can reason about afterwards.
  if (isKey(subject)) return subject.scopes.includes(permission);
  if (!isRole(subject.role)) return false;
  return permissionsOf(subject.role).includes(permission);
}

// Convenience for guards that need all of several permissions at once.
export function canAll(
  subject: AccessSubject | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => can(subject, permission));
}
