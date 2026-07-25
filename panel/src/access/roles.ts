// Role names only — the panel needs the vocabulary for the invite select and the
// role badges. Mirrors the ROLES list in the relay access core; the permission
// map deliberately does not live here.

export const ROLES = ["admin", "moderator", "viewer"] as const;

export type Role = (typeof ROLES)[number];
