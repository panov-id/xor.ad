// Panel permission catalogue — the full set of things a panel subject may be
// allowed to do. Deliberately flat: a permission is a plain string, not a
// resource/action pair, so a check is one lookup and the catalogue reads as a
// list. The strings are stable identifiers: they travel inside session payloads
// and client-side checks, so renaming one is a migration, not a rename.

export const PERMISSIONS = [
  "waitlist.read",
  // Writing a lead is not something a person does through the panel — leads
  // arrive from a landing. It exists for the public API, where a tenant's own
  // server posts them with a secret key, and it is granted to keys rather than
  // to roles. `admin` picks it up through the wildcard, which is what the
  // wildcard is for.
  "waitlist.write",
  // Reporting a page view. A tenant counting its own traffic through our counter
  // needs no consent banner, because the record carries no address, no user
  // agent and no identifier — that is the whole offer, and it is why this is
  // worth exposing rather than keeping to our own landings.
  "pageviews.write",
  // Reporting a client-side error. Same shape as the two above: not an action a
  // person performs in the panel, but one a tenant's own front-end performs
  // through the public API. Reading them is `logs.client_errors.read` and stays
  // separate — sending us a report says nothing about being allowed to read
  // everyone's.
  "client_errors.write",
  "panel_users.read",
  "panel_users.write",
  "logs.client_errors.read",
  "logs.audit.read",
  "logs.server.read",
  "logs.pageviews.read",
  "brands.read",
  "brands.write",
  "api_keys.read",
  "api_keys.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Scopes that exist for keys and for nothing else: no panel page performs them
// and no role holds them, which is why a tenant cannot be refused one on the
// grounds of not holding it. They are the whole of what a tenant's own server
// does through the public API, and the brand it does it in comes from the
// session, never from the scope — so issuing one widens what a key may do and
// never what a person may do.
export const KEY_ONLY_SCOPES: readonly Permission[] = [
  "waitlist.write",
  "pageviews.write",
  "client_errors.write",
];

export const isKeyOnlyScope = (value: string): boolean =>
  (KEY_ONLY_SCOPES as readonly string[]).includes(value);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
