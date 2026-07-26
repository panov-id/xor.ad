// Publishable API keys — the only thing that says which tenant a public request
// belongs to. Publishable, not secret: the key ships inside a landing page's
// JavaScript, so it is an identifier, not a credential. What protects it is the
// Origin allowlist below — a stolen key is useless from another site, and the
// worst it buys on its own site is what the site could already do.
//
// Secret keys (server-to-server, hashed, scoped) are a separate type and come
// with the public API — see docs/api-platform_*.md, section 1.

import { config } from "../config.ts";
import { get, storageEnabled } from "./storage.ts";

export interface PublishableKey {
  id: string; // "ak_pub_7f3c…" — public by design, no hashing
  brand: string; // the tenant this key speaks for
  origins: string[]; // exact Origin values allowed to use it; empty = any
  created_at: string;
  revoked_at: string | null;
}

export const keysDir = (): string => `platform/${config.envName}/publishable-keys`;

// Shape check before the storage round-trip: an id that cannot be a key must not
// become a path segment.
const ID_PATTERN = /^ak_pub_[a-z0-9]{16,64}$/;

// Every public request carries a key, so an uncached lookup is a storage read
// per request — and a wrong key is a read per attempt, which makes guessing at
// keys something the platform pays for. Keys never change apart from revocation,
// so both answers are cached, the negative one included. The cost is the same
// one the brand registry already accepts: a revocation lands within the TTL.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; key: PublishableKey | null }>();

export function invalidatePublishableKeys(): void {
  cache.clear();
}

export async function findPublishableKey(id: string): Promise<PublishableKey | null> {
  if (!ID_PATTERN.test(id) || !storageEnabled()) return null;
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.key;
  const stored = await get<PublishableKey>(`${keysDir()}/${id}.json`);
  const key = !stored || stored.revoked_at ? null : stored;
  cache.set(id, { at: Date.now(), key });
  return key;
}

// An empty allowlist accepts any origin — used by the local stand and by
// server-side callers that send no Origin at all.
export function originAllowed(key: PublishableKey, origin: string | null): boolean {
  if (key.origins.length === 0) return true;
  return origin !== null && key.origins.includes(origin);
}
