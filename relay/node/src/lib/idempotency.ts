// Idempotency for the public API: the same request twice must do the work once
// and answer the same thing both times.
//
// A client that times out and retries has no way of knowing whether the first
// call landed. Without this, the honest choices are "retry and risk a duplicate"
// or "do not retry and risk losing it" — so the table has been in the schema
// since 001, waiting for the API that needs it.
//
// The stored key is the caller's `Idempotency-Key` *and* a hash of the body: the
// same key with a different body is a different request wearing a borrowed name,
// and replaying the first answer to it would be a lie.

import { enabled as databaseEnabled, query } from "./db.ts";
import { sha256hex } from "./hash.ts";

export interface StoredResponse {
  status: number;
  body: unknown;
}

const cell = async (brand: string, key: string, body: string): Promise<string> =>
  `${brand}:${key}:${(await sha256hex(body)).slice(0, 32)}`;

export async function recall(
  brand: string,
  key: string,
  body: string,
): Promise<StoredResponse | null> {
  if (!databaseEnabled()) return null;
  const rows = await query<{ response: StoredResponse | string }>(
    `SELECT response FROM idempotency WHERE key = $1`,
    [await cell(brand, key, body)],
  );
  const stored = rows?.[0]?.response ?? null;
  // Rows written before 2026-09-24 hold the answer as a JSON string (see
  // remember); they live a day before the sweep takes them, so read both.
  return typeof stored === "string" ? JSON.parse(stored) as StoredResponse : stored;
}

export async function remember(
  brand: string,
  key: string,
  body: string,
  response: StoredResponse,
): Promise<void> {
  if (!databaseEnabled()) return;
  // First write wins: two concurrent retries of the same request must not race
  // into two different stored answers.
  await query(
    // `::text::jsonb`, the trap src/lib/jobs.ts names: a string handed to a
    // jsonb parameter is encoded a second time, and the row held a JSON string
    // that /v1 replayed as a 200 with no body (loop, 2026-09-24).
    `INSERT INTO idempotency (key, brand, response) VALUES ($1, $2, $3::text::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [await cell(brand, key, body), brand, JSON.stringify(response)],
  );
}
