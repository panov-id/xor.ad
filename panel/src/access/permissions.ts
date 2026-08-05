// Mirrors relay/node/src/access/permissions.ts — the relay is the source of
// truth. The panel carries the catalogue for compile-time safety only; it never
// carries the role -> permissions map, which stays server-side and arrives
// already expanded via /auth/me.

export const PERMISSIONS = [
  "waitlist.read",
  // Writing a lead: not something a person does here — leads arrive from a
  // landing — but a scope a secret key can be issued for, so the key page has to
  // be able to offer it.
  "waitlist.write",
  // Reporting a page view. A tenant counting its own traffic through our counter
  // needs no consent banner, because the record carries no address, no user
  // agent and no identifier — that is the whole offer, and it is why this is
  // worth exposing rather than keeping to our own landings.
  "pageviews.write",
  // Reporting a client-side error, for the same reason: a scope a secret key can
  // be issued for, so the key page has to be able to offer it. Reading them is
  // `logs.client_errors.read` and stays a separate scope.
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
  // Notices under Article 16 DSA — the queue and the decision on it. Separate
  // from the log permissions because a notice carries a name, an email and a
  // copy of someone's message.
  "dsa_notices.read",
  "dsa_notices.decide",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Mirrors the relay's list of the same name. Scopes no person holds and no page
// performs: the key form offers them regardless of the operator's own
// permissions, because the relay accepts them from any issuer for their own
// brand — and without that a tenant would see an empty scope picker.
export const KEY_ONLY_SCOPES: readonly Permission[] = [
  "waitlist.write",
  "pageviews.write",
  "client_errors.write",
];
