// Server-to-server keys. The other half of api_key.ts, kept apart because the
// two are opposites in the one way that matters: a publishable key is an
// identifier that ships inside a web page, and a secret key is a credential that
// must never leave a server.
//
// The secret is shown once, at creation, and only its sha256 lands in the
// database. There is no "show me the key again" — the point of hashing is that
// this system cannot answer that question either.
//
// Requires a database: a secret key is looked up by hash on every call and
// revocation has to land at once, which is exactly what the object store cannot
// do. Without DATABASE_URL there are no secret keys, and the routes that need
// one say so rather than falling back to something weaker.

import type { Permission } from "../access/index.ts";
import { PERMISSIONS } from "../access/permissions.ts";
import { enabled as databaseEnabled, query } from "./db.ts";
import { sha256hex } from "./hash.ts";

export interface SecretKey {
  id: string; // "ak_live_7f3c…" — the prefix is what appears in logs and lists
  brand: string;
  name: string;
  scopes: Permission[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// Same shape as the publishable one, different prefix: both are recognisable at
// a glance in a log line, which is when it matters most.
const ID_PATTERN = /^ak_live_[a-z0-9]{16,64}$/;

export const isSecretKeyId = (value: string): boolean => ID_PATTERN.test(value);

// The wire format is `<id>.<secret>`: the id makes the lookup indexed and the
// key identifiable in a log without revealing anything, and the secret is what
// is actually checked. One string for the caller, two jobs.
export function splitSecret(presented: string): { id: string; secret: string } | null {
  const at = presented.indexOf(".");
  if (at <= 0) return null;
  const id = presented.slice(0, at);
  const secret = presented.slice(at + 1);
  if (!ID_PATTERN.test(id) || secret.length < 32) return null;
  return { id, secret };
}

export function areScopes(value: unknown): value is Permission[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && PERMISSIONS.includes(entry as Permission));
}

export interface MintedSecretKey {
  key: SecretKey;
  // The only time this string exists outside the caller's hands. Not stored, not
  // logged, not recoverable.
  secret: string;
}

export async function createSecretKey(
  brand: string,
  name: string,
  scopes: readonly Permission[],
  createdBy: string | null,
): Promise<MintedSecretKey> {
  if (!databaseEnabled()) throw new Error("secret keys need a database");
  const id = `ak_live_${crypto.randomUUID().replaceAll("-", "")}`;
  const secret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const rows = await query<SecretKey>(
    `INSERT INTO api_keys (id, brand, kind, secret_hash, name, scopes, created_by)
     VALUES ($1, $2, 'secret', $3, $4, $5, $6)
     RETURNING id, brand, name, scopes, created_by, created_at, last_used_at, revoked_at`,
    [id, brand, await sha256hex(secret), name, [...scopes], createdBy],
  );
  if (!rows?.[0]) throw new Error("could not write the key to the database");
  return { key: rows[0], secret: `${id}.${secret}` };
}

// Resolve a presented key to its subject, or null. Null covers every reason —
// malformed, unknown, revoked, wrong secret — on purpose: telling a caller which
// of those it was tells them how close they got.
export async function resolveSecretKey(presented: string | null): Promise<SecretKey | null> {
  if (!presented || !databaseEnabled()) return null;
  const parts = splitSecret(presented);
  if (!parts) return null;
  const rows = await query<SecretKey>(
    `SELECT id, brand, name, scopes, created_by, created_at, last_used_at, revoked_at
       FROM api_keys
      WHERE id = $1 AND kind = 'secret' AND secret_hash = $2 AND revoked_at IS NULL`,
    [parts.id, await sha256hex(parts.secret)],
  );
  const key = rows?.[0];
  if (!key) return null;

  // Best-effort and not awaited: "when was this last used" answers whether a key
  // is safe to revoke, and it is not worth a millisecond on the path of a call
  // that has already been authorised.
  void query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [key.id]);
  return key;
}

export async function listSecretKeys(brand: string | null): Promise<SecretKey[]> {
  if (!databaseEnabled()) return [];
  const rows = await query<SecretKey>(
    `SELECT id, brand, name, scopes, created_by, created_at, last_used_at, revoked_at
       FROM api_keys
      WHERE kind = 'secret' AND ($1::text IS NULL OR brand = $1)
      ORDER BY created_at DESC`,
    [brand],
  );
  return rows ?? [];
}

// Revoking stamps rather than deletes, for the same reason the publishable keys
// do: a key that vanished takes with it the answer to what it was.
export async function revokeSecretKey(id: string): Promise<SecretKey | null> {
  if (!databaseEnabled()) return null;
  const rows = await query<SecretKey>(
    `UPDATE api_keys SET revoked_at = now()
      WHERE id = $1 AND kind = 'secret' AND revoked_at IS NULL
      RETURNING id, brand, name, scopes, created_by, created_at, last_used_at, revoked_at`,
    [id],
  );
  return rows?.[0] ?? null;
}
