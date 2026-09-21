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

// postgres.js rather than @db/postgres, decided by the owner on 2026-09-21
// (open-work G14). The old driver could not receive a NOTIFY at all: a
// connection that was sent one threw "Unexpected simple query message: A" on
// its next query — measured against a live Postgres on 2026-09-20. The chat's
// whole transport is LISTEN/NOTIFY (chat spec §8.1, §8.6) and so is the second
// half of §8.2's promise that a frozen session stops receiving, so the driver
// decided more than it looked like it was deciding.
//
// Both candidates were measured under Deno before the choice: postgres.js took
// a notification in 74ms, node-postgres in 40ms with the connection verified
// alive afterwards. postgres.js won on shape rather than speed — `sql.listen()`
// is a first-class call, and its transaction API maps onto the one this file
// already offers.
//
// It is the node's first npm dependency and, apart from it, its only external
// one at all. That was the price named when the choice was made.
import postgres from "npm:postgres@3.4.4";
import { config } from "../config.ts";
import { log } from "./log.ts";

// Small on purpose: this pool serves control-plane traffic, not the public
// routes, and a node that opens dozens of connections to a shared database
// multiplies by the size of the pool of nodes.
const POOL_SIZE = 4;

// deno-lint-ignore no-explicit-any
type Sql = any;

let pool: Sql | null = null;

export function enabled(): boolean {
  return Boolean(config.databaseUrl);
}

function ensurePool(): Sql {
  if (!pool) {
    pool = postgres(config.databaseUrl, {
      max: POOL_SIZE,
      // Notices are the server talking, not an error, and postgres.js would
      // print them to stderr by default — straight past lib/log.ts and its
      // shape. Routed here so a "table does not exist, skipping" from a
      // migration looks like every other line the node writes.
      onnotice: (notice: { message?: string }) =>
        log("info", "postgres notice", { message: String(notice.message ?? notice) }),
    });
  }
  return pool;
}

// The one place that turns a text-and-parameters query into a postgres.js call.
// `unsafe` names the fact that the text is not a tagged template — the
// parameters are still sent separately and are never interpolated, which is the
// thing that matters. Every caller in this node builds SQL as a constant string
// and passes values as `$1…$n`.
//
// What the driver does to those values on the way out is worth knowing before
// it costs an afternoon. Measured 2026-09-21: a string parameter that looks
// like a timestamp is turned into a JavaScript `Date`, and a `Date` holds
// milliseconds — so "2026-09-21T09:00:00.500900Z" reaches Postgres as
// …500000, with no error and no warning. The feed's cursor was written that
// way first and was undone by this, while reading correctly in the source
// (routes/feed.ts says the same at the cursor). Anything that needs
// microseconds crosses this boundary as digits and is turned back into an
// instant in SQL.
function run<T>(sql: Sql, text: string, args: unknown[]): Promise<T[]> {
  return sql.unsafe(text, args) as Promise<T[]>;
}

// Every query goes through here so a failure has one shape and one place to be
// logged. Returns null rather than throwing: a caller that has a fallback should
// take it, and a caller that does not should say so explicitly.
export async function query<T>(
  text: string,
  args: unknown[] = [],
): Promise<T[] | null> {
  if (!enabled()) return null;
  try {
    return await run<T>(ensurePool(), text, args);
  } catch (error) {
    log("error", "database query failed", { error: String(error), sql: text.slice(0, 120) });
    return null;
  }
}

// For the callers that cannot carry on without an answer — migrations, the
// worker — where swallowing the error would hide a broken deploy.
export async function queryOrThrow<T>(text: string, args: unknown[] = []): Promise<T[]> {
  if (!enabled()) throw new Error("DATABASE_URL is not set");
  return await run<T>(ensurePool(), text, args);
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
  // `sql.begin` owns BEGIN, COMMIT and ROLLBACK: the callback's return value
  // commits, a throw rolls back and is re-thrown. The hand-written version this
  // replaced logged a failed rollback separately, which postgres.js does for
  // itself — what it must not lose is that the *first* error is the one the
  // caller sees, and it does not.
  return await ensurePool().begin(async (tx: Sql) => {
    return await run(<R>(text: string, args: unknown[] = []) => tx.unsafe(text, args) as Promise<R[]>);
  }) as T;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}
