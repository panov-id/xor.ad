// Panel permission catalogue — the full set of things a panel subject may be
// allowed to do. Deliberately flat: a permission is a plain string, not a
// resource/action pair, so a check is one lookup and the catalogue reads as a
// list. The strings are stable identifiers: they travel inside session payloads
// and client-side checks, so renaming one is a migration, not a rename.

export const PERMISSIONS = [
  "waitlist.read",
  "panel_users.read",
  "panel_users.write",
  "logs.client_errors.read",
  "logs.audit.read",
  "logs.server.read",
  "brands.read",
  "brands.write",
  "api_keys.read",
  "api_keys.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
