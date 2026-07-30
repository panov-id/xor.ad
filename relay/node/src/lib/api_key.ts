// Publishable API keys — the only thing that says which tenant a public request
// belongs to. Publishable, not secret: the key ships inside a landing page's
// JavaScript, so it is an identifier, not a credential. What protects it is the
// Origin allowlist below — a stolen key is useless from another site, and the
// worst it buys on its own site is what the site could already do.
//
// Secret keys (server-to-server, hashed, scoped) are a separate type and come
// with the public API — see docs/api-platform_*.md, section 1.

import { config } from "../config.ts";
import { get, list, put, storageEnabled } from "./storage.ts";
import { enabled as databaseEnabled, query } from "./db.ts";
import { isSecretKeyId } from "./secret_key.ts";

export interface PublishableKey {
  id: string; // "ak_pub_7f3c…" — public by design, no hashing
  brand: string; // the tenant this key speaks for
  origins: string[]; // exact Origin values allowed to use it; empty = any
  created_at: string;
  revoked_at: string | null;
  // Daily allowance for public requests made with this key. null = unlimited,
  // which is what a key has until someone sets one.
  quota_events_per_day?: number | null;
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
  if (!ID_PATTERN.test(id)) return null;

  // With a database there is no cache and no TTL: the lookup is a single indexed
  // read, and revocation has to land now rather than within a minute. That is
  // most of why keys moved here.
  if (databaseEnabled()) {
    const rows = await query<PublishableKey>(
      `SELECT id, brand, origins, created_at, revoked_at, quota_events_per_day::int
         FROM api_keys WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
    // A null means the query failed, not that the key is unknown — fall through
    // to storage rather than refusing a caller because the database blinked.
    if (rows !== null) return rows[0] ?? null;
  }

  if (!storageEnabled()) return null;
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

// --- managing them ------------------------------------------------------------
//
// Minting and revoking live here rather than in the route or the CLI tool,
// because both do it and a key issued two ways would eventually be issued two
// shapes.

export async function listPublishableKeys(): Promise<PublishableKey[]> {
  if (databaseEnabled()) {
    const rows = await query<PublishableKey>(
      `SELECT id, brand, origins, created_at, revoked_at, quota_events_per_day::int
         FROM api_keys ORDER BY created_at DESC`,
    );
    if (rows !== null) return rows;
  }
  if (!storageEnabled()) return [];
  const files = await list(keysDir());
  const keys = await Promise.all(files.map((file) => get<PublishableKey>(`${keysDir()}/${file}`)));
  return keys.filter((key): key is PublishableKey => key !== null)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function createPublishableKey(
  brand: string,
  origins: readonly string[],
): Promise<PublishableKey> {
  const key: PublishableKey = {
    // Hex from a UUID: publishable, so there is nothing to hide and no reason to
    // reach for anything cleverer.
    id: `ak_pub_${crypto.randomUUID().replaceAll("-", "")}`,
    brand,
    origins: [...origins],
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  if (databaseEnabled()) {
    const rows = await query<PublishableKey>(
      `INSERT INTO api_keys (id, brand, origins) VALUES ($1, $2, $3)
       RETURNING id, brand, origins, created_at, revoked_at`,
      [key.id, brand, [...origins]],
    );
    if (rows !== null && rows[0]) return rows[0];
    // Falling through on failure would mint a key the database does not know
    // about, which is worse than not minting one.
    throw new Error("could not write the key to the database");
  }
  await put(`${keysDir()}/${key.id}.json`, key);
  invalidatePublishableKeys();
  return key;
}

// Revoking stamps the key rather than deleting it: a key that simply vanished
// would take with it the answer to "what was this, and when did we stop
// trusting it".
export async function revokePublishableKey(id: string): Promise<PublishableKey | null> {
  if (!ID_PATTERN.test(id)) return null;
  if (databaseEnabled()) {
    const rows = await query<PublishableKey>(
      // COALESCE keeps a second revoke from moving the timestamp: when we
      // stopped trusting a key is a fact, and it happened once.
      `UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1
       RETURNING id, brand, origins, created_at, revoked_at`,
      [id],
    );
    if (rows !== null) return rows[0] ?? null;
  }
  if (!storageEnabled()) return null;
  const stored = await get<PublishableKey>(`${keysDir()}/${id}.json`);
  if (!stored) return null;
  if (stored.revoked_at) return stored; // already revoked: saying so twice changes nothing
  const revoked = { ...stored, revoked_at: new Date().toISOString() };
  await put(`${keysDir()}/${id}.json`, revoked);
  invalidatePublishableKeys();
  return revoked;
}

// An origin has to be an origin: a path or a bare hostname in the allowlist
// would never match what a browser sends, and the key would look configured
// while refusing every request.
export function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === value.replace(/\/$/, "");
  } catch {
    return false;
  }
}

// Setting an allowance is a platform decision, so it lives beside the key rather
// than in a settings table: one row, one lifetime, one place to look.
// Both kinds of key, on purpose: the allowance is a column of `api_keys` and
// applies to whoever holds the key, and refusing a secret key here would leave
// /v1 enforcing a limit that nothing could set.
export async function setKeyQuota(
  id: string,
  limit: number | null,
): Promise<PublishableKey | null> {
  if (!(ID_PATTERN.test(id) || isSecretKeyId(id)) || !databaseEnabled()) return null;
  const rows = await query<PublishableKey>(
    `UPDATE api_keys SET quota_events_per_day = $2 WHERE id = $1
     RETURNING id, brand, origins, created_at, revoked_at, quota_events_per_day::int`,
    [id, limit],
  );
  return rows?.[0] ?? null;
}
