// Mirrors relay/node/src/access/permissions.ts — the relay is the source of
// truth. The panel carries the catalogue for compile-time safety only; it never
// carries the role -> permissions map, which stays server-side and arrives
// already expanded via /auth/me.

export const PERMISSIONS = [
  "waitlist.read",
  "panel_users.read",
  "panel_users.write",
  "logs.client_errors.read",
  "logs.audit.read",
  "logs.server.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
