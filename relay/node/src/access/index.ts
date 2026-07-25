// Public surface of the access core. Callers import from here and nowhere else
// inside the directory, so the internal file layout stays free to change.

export { isPermission, type Permission, PERMISSIONS } from "./permissions.ts";
export { ALL_PERMISSIONS, isRole, type Role, ROLE_PERMISSIONS, ROLES } from "./roles.ts";
export { type AccessSubject, can, canAll, permissionsOf } from "./can.ts";
