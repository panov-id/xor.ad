// The database, and the rule about when it is allowed to matter.
//
// Control state lives here — keys, brands, quotas, the queue — because object
// storage cannot do atomic counters, leases or conditional writes. Everything
// else stays in storage (docs/state-decision_*.md).
//
// The rule: accepting data must never depend on this. A signup, a page view or
// an error report has to survive the database being unreachable, because those
// are the requests a visitor is waiting on. So callers ask `enabled()` and have
// a way to carry on without an answer — and the node keeps its old behaviour
// when DATABASE_URL is unset, which is also what a local stand without Postgres
// gets.

import { Pool, type PoolClient } from "jsr:@db/postgres@0.19";
import { config } from "../config.ts";
import { log } from "./log.ts";

// Small on purpose: this pool serves control-plane traffic, not the public
// routes, and a node that opens dozens of connections to a shared database
// multiplies by the size of the pool of nodes.
const POOL_SIZE = 4;

let pool: Pool | null = null;

export function enabled(): boolean {
  return Boolean(config.databaseUrl);
}

function ensurePool(): Pool {
  if (!pool) pool = new Pool(config.databaseUrl, POOL_SIZE, true);
  return pool;
}

// Every query goes through here so a failure has one shape and one place to be
// logged. Returns null rather than throwing: a caller that has a fallback should
// take it, and a caller that does not should say so explicitly.
export async function query<T>(
  text: string,
  args: unknown[] = [],
): Promise<T[] | null> {
  if (!enabled()) return null;
  let client: PoolClient | undefined;
  try {
    client = await ensurePool().connect();
    const result = await client.queryObject<T>(text, args);
    return result.rows;
  } catch (error) {
    log("error", "database query failed", { error: String(error), sql: text.slice(0, 120) });
    return null;
  } finally {
    client?.release();
  }
}

// For the callers that cannot carry on without an answer — migrations, the
// worker — where swallowing the error would hide a broken deploy.
export async function queryOrThrow<T>(text: string, args: unknown[] = []): Promise<T[]> {
  if (!enabled()) throw new Error("DATABASE_URL is not set");
  const client = await ensurePool().connect();
  try {
    return (await client.queryObject<T>(text, args)).rows;
  } finally {
    client.release();
  }
}

// One connection, one transaction, for the few places where two writes have to
// be one fact. Everything else here is a single statement and needs none of it.
//
// The queue is why this exists. Deciding a notice writes a statement of reasons
// and then marks the notice decided, and those had been two independent writes:
// a failure between them left a statement attached to a notice the queue still
// offered, and two operators pressing at once wrote two statements and two
// letters for one notice.
//
// The callback gets a `query` of the same shape as the module's, bound to the
// one connection — a caller reaching for the module's own would silently be on a
// different connection, outside the transaction, which is the classic way to
// write a transaction that is not one.
export async function transaction<T>(
  run: (query: <R>(text: string, args?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  if (!enabled()) throw new Error("DATABASE_URL is not set");
  const client = await ensurePool().connect();
  const scoped = async <R>(text: string, args: unknown[] = []): Promise<R[]> =>
    (await client.queryObject<R>(text, args)).rows;
  try {
    await scoped("BEGIN");
    const result = await run(scoped);
    await scoped("COMMIT");
    return result;
  } catch (error) {
    // Rolling back can itself fail — a dropped connection, for one — and the
    // error worth reporting is the first one, not the tidy-up.
    await scoped("ROLLBACK").catch((rollbackError) =>
      log("error", "rollback failed", { error: String(rollbackError) })
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}
