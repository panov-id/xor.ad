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

// node-postgres, since W15-NC (2026-10-09). postgres.js 3.4.4 was chosen on
// 2026-09-21 over the first driver, which could not receive a NOTIFY at all,
// and it then took the whole process down when a connection broke under load:
// 20 writers with backends killed every 50–250 ms crashed it in 12 runs of 12
// (3.4.4 and 3.4.7, Deno 2.1.4 and 2.5.6) — a null socket written to after
// close, an unhandled "terminating connection", "May not write null values to
// stream". No guard around it held. The same storm against pg 8.13.1 left the
// process alive in 6 of 6, the pool answering and LISTEN hearing afterwards
// (docs/reviews/PANEL_2026-10-09_pg-driver-plan.md).
//
// What pg does not do for us and this file does instead: keep a LISTEN
// connection alive (it is an ordinary client to pg), check that a COMMIT
// committed, refuse `undefined` as a parameter, and tell "the database is not
// there" apart from "the database said no" (DbUnavailable below).
//
// It is still the node's only external dependency.
import pg from "npm:pg@8.13.1";
import { config } from "../config.ts";
import { log } from "./log.ts";

// Small on purpose: this pool serves control-plane traffic, not the public
// routes, and a node that opens dozens of connections to a shared database
// multiplies by the size of the pool of nodes.
const POOL_SIZE = 4;

// A query that hangs is worse for this node than a query that fails, and the
// difference is the whole reason these two exist. `query()` turns an error into
// null and the route answers 503; a connection waiting on a lock that will
// never be released answers nothing at all, holds a quarter of the pool, and
// moves no counter — four of them and the node is silent on every route that
// touches the database, with `storage_failed` still at zero. Raised by the
// operations lens of the review panel, 2026-09-21.
//
// Fifteen seconds is far longer than anything the routes do (the slowest is
// the feed's five radius attempts) and far shorter than a night. The tools are
// a different matter: a migration or a sweep over millions of rows may legally
// take minutes, so they set their own through RELAY_DB_TIMEOUT_MS rather than
// inheriting a limit written for a web request.
// Read when the pool is built rather than when this module loads, so a tool
// can raise it before its first query without a second pool or an import dance.
function statementTimeoutMs(): number {
  const named = Number(Deno.env.get("RELAY_DB_TIMEOUT_MS"));
  return Number.isFinite(named) && named > 0 ? named : 15_000;
}

// Values come back as postgres.js returned them, so nothing outside this file
// notices the change of driver. Two types differ: pg reads a `date` (and each
// element of a `date[]`) as local midnight (a day early east of UTC — measured at TZ=Asia/Nicosia) and an
// `interval` as an object. postgres.js read the first as UTC midnight and left
// the second a string.
const DATE = 1082;
const DATE_ARRAY = 1182;
const TEXT_ARRAY = 1009;
const INTERVAL = 1186;
const types = {
  getTypeParser(oid: number, format?: string) {
    if (oid === DATE) return (value: string) => new Date(value);
    if (oid === DATE_ARRAY) {
      // The elements as text, by pg's own array parser, then the same rule.
      const elements = pg.types.getTypeParser(TEXT_ARRAY, "text");
      return (value: string) =>
        (elements(value) as (string | null)[]).map((day) => day === null ? null : new Date(day));
    }
    if (oid === INTERVAL) return (value: string) => value;
    // deno-lint-ignore no-explicit-any
    return pg.types.getTypeParser(oid, format as any);
  },
};

// An `?options=` in DATABASE_URL is kept, and ours go after it: Postgres takes
// the last `-c` for a setting. Left in the URL, pg would let it replace ours
// outright — a DSN with `-c statement_timeout=0` ran the node with no timeout
// at all (W15-NC, NC-D).
//
// The same for the two timeouts given as keys of their own
// (`?statement_timeout=0`): pg sends those as settings of the connection, and
// they beat any `-c` (measured; security lens H3, 2026-10-09). They are turned
// into `-c` and put before ours, like the rest of `?options=`.
const OUR_SETTINGS = ["statement_timeout", "idle_in_transaction_session_timeout"];
function splitOptions(dsn: string): { connectionString: string; options: string } {
  const keys = ["options", ...OUR_SETTINGS];
  if (!keys.some((key) => new RegExp(`[?&]${key}=`).test(dsn))) return { connectionString: dsn, options: "" };
  const url = new URL(dsn);
  const options = [url.searchParams.get("options") ?? ""];
  for (const key of OUR_SETTINGS) {
    const value = url.searchParams.get(key);
    if (value !== null) options.push(`-c ${key}=${value}`);
  }
  for (const key of keys) url.searchParams.delete(key);
  return { connectionString: url.toString(), options: options.join(" ").trim() };
}

// pg reads PGPASSFILE (or ~/.pgpass) when the DSN carries no password: whoever sets the node's env owns DATABASE_URL anyway.
function clientConfig(): pg.ClientConfig {
  const timeout = statementTimeoutMs();
  const { connectionString, options } = splitOptions(config.databaseUrl);
  return {
    connectionString,
    // Both, because they catch different halves: the first bounds a statement
    // the server is running, the second bounds a transaction that is running
    // nothing at all — the shape a dropped connection leaves behind, holding
    // its locks.
    options: `${options} -c statement_timeout=${timeout} -c idle_in_transaction_session_timeout=${timeout}`.trim(),
    // Meant for a peer that vanished without a FIN — a box gone, a firewall
    // dropping — which the LISTEN connection would otherwise never notice.
    // It does NOT take effect under Deno (2.1.4 and 2.5.6, measured
    // 2026-10-09 in /proc/net/tcp): pg's socket gets no keepalive timer, with
    // or without keepAliveInitialDelayMillis, even set after connect, while a
    // Deno.connect socket with setKeepAlive(true) does. Kept for the day
    // Deno's node:net honours it; until then nothing here detects a silent
    // peer (security lens H4, open).
    keepAlive: true,
    // pg waits for a connection forever by default: the LISTEN connect to a
    // server that never answered held a room's opening for good (security
    // lens H2, 2026-10-09). For the pool the same number also bounds the wait
    // for a free slot. No longer than a statement may run: the same promise
    // for the step before it.
    connectionTimeoutMillis: statementTimeoutMs(),
    types,
  };
}

let pool: pg.Pool | null = null;

export function enabled(): boolean {
  return Boolean(config.databaseUrl);
}

function ensurePool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      ...clientConfig(),
      max: POOL_SIZE,
      // connectionTimeoutMillis comes from clientConfig(): four connects
      // hanging on a dropped SYN would leave every route silent, the thing
      // statementTimeoutMs() exists to prevent.
      // Idle connections are kept, as postgres.js kept them (idle_timeout 0):
      // four at most, and one that dies idle is dropped through "error" below.
      // pg's default of ten seconds also arms a timer per idle client, which
      // the test sanitizers of every database suite would count as a leak.
      idleTimeoutMillis: 0,
    });
    // An idle connection that dies emits here, and an EventEmitter error with
    // no listener ends the process — pg's documented contract. The pool drops
    // that client by itself; this only has to be heard. `client` is not
    // logged: its connection parameters carry the password.
    pool.on("error", (error: Error) => log("warn", "database connection dropped", { error: String(error) }));
    // Notices are the server talking, not an error. Routed to lib/log.ts so a
    // "table does not exist, skipping" from a migration looks like every other
    // line the node writes.
    pool.on("connect", (client: pg.PoolClient) => client.on("notice", onNotice));
  }
  return pool;
}

function onNotice(notice: { message?: string }): void {
  log("info", "postgres notice", { message: String(notice.message ?? notice) });
}

// The database could not be reached (refused, reset, timed out) — as opposed
// to a query the database itself refused. Callers answer 503, not 500.
// Contract for W15-NC: db.ts throws it, routes/profile.ts classifies by it.
export class DbUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DbUnavailable";
  }
}

// What a failure from the driver means. Anything with an SQLSTATE came from
// the server and stays as it is — a caller may act on 55P03 or 23505 — except
// the classes that say the session itself is gone: 08 (connection exception)
// and 57P01–57P03 (the backend was terminated or the server is going down).
// Everything without one is the socket or pg's own bookkeeping —
// ECONNREFUSED, ECONNRESET, "Connection terminated unexpectedly", "timeout
// exceeded when trying to connect", "Client has encountered a connection error
// and is not queryable" (the last two have no code at all, measured 2026-10-09).
function unavailable(error: unknown): unknown {
  if (error instanceof DbUnavailable) return error;
  if (error instanceof pg.DatabaseError) {
    const code: string = (error as { code?: string }).code ?? "";
    if (!code.startsWith("08") && !/^57P0[123]$/.test(code)) return error;
  }
  return new DbUnavailable(`database unavailable: ${String(error)}`, { cause: error });
}

// The one place that turns a text-and-parameters query into a driver call. The
// parameters are sent separately and are never interpolated; every caller in
// this node builds SQL as a constant string and passes values as `$1…$n`.
//
// `undefined` is refused here because pg would send it as NULL: a field the
// caller forgot would become a quiet NULL write where postgres.js refused it.
// Inside arrays too, at any depth — `[1, undefined]` reached Postgres as
// {1,NULL} (security lens H5, 2026-10-09). Objects are not looked into: they
// cross as JSON text, where JSON.stringify already drops an undefined field.
//
// No parameters means no parameter list at all. pg then uses the simple
// protocol, which is what lets tools/migrate_db.ts send a migration file of
// many statements as one — and the answer to many statements is many results,
// of which the last is the one a caller means.
//
// Strings reach Postgres as written. postgres.js turned a string that looked
// like a timestamp into a `Date` and so cut microseconds to milliseconds
// (measured 2026-09-21); routes/feed.ts still carries its cursor as digits,
// which is right under either driver.
function holdsUndefined(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.some(holdsUndefined));
}

async function exec<T>(
  on: pg.Pool | pg.PoolClient,
  text: string,
  args: unknown[],
): Promise<T[]> {
  const hole = args.findIndex(holdsUndefined);
  if (hole >= 0) {
    throw new TypeError(`undefined passed in parameter $${hole + 1}: ${text.slice(0, 80)}`);
  }
  let result;
  try {
    result = await on.query(text, args.length ? args : undefined);
  } catch (error) {
    throw unavailable(error);
  }
  const last = Array.isArray(result) ? result[result.length - 1] : result;
  return (last?.rows ?? []) as T[];
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
    return await exec<T>(ensurePool(), text, args);
  } catch (error) {
    log("error", "database query failed", { error: String(error), sql: text.slice(0, 120) });
    return null;
  }
}

// For the callers that cannot carry on without an answer — migrations, the
// worker — where swallowing the error would hide a broken deploy.
export async function queryOrThrow<T>(text: string, args: unknown[] = []): Promise<T[]> {
  if (!enabled()) throw new Error("DATABASE_URL is not set");
  return await exec<T>(ensurePool(), text, args);
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
export type Query = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// What a test puts between a transaction and its statements: every statement
// goes through it, and `next` sends it on.
export type Around = <R>(text: string, args: unknown[], next: Query) => Promise<R[]>;

// One transaction's connection and what it has seen: the first statement that
// failed, which is the error the caller gets if COMMIT turns out to have rolled
// back, and a counter for savepoint names.
type Tx = { client: pg.PoolClient; failed?: unknown; savepoints: number };

// The transaction behind each query function handed out, so savepoint() below
// can open a savepoint on it, and the test's Around, so a savepoint's
// statements go through it too.
const scopes = new WeakMap<Query, { tx: Tx; around?: Around }>();

function queryOn(tx: Tx, around?: Around): Query {
  const plain: Query = async <R>(text: string, args: unknown[] = []) => {
    try {
      return await exec<R>(tx.client, text, args);
    } catch (error) {
      tx.failed ??= error;
      throw error;
    }
  };
  const query: Query = around ? <R>(text: string, args: unknown[] = []) => around<R>(text, args, plain) : plain;
  scopes.set(query, { tx, around });
  return query;
}

// For tests: the transaction's own query function, with every statement —
// those of its savepoints too — handed to `around` first. A plain wrapper
// function is not a transaction's, and savepoint() refuses it.
export function intercepted(run: Query, around: Around): Query {
  const known = scopes.get(run);
  if (!known) throw new Error("intercepted() takes the query function of a transaction() or of a savepoint()");
  return queryOn(known.tx, around);
}

async function connect(): Promise<pg.PoolClient> {
  try {
    return await ensurePool().connect();
  } catch (error) {
    throw unavailable(error);
  }
}

// The callback's return value commits, a throw rolls back and is re-thrown —
// the first error, never the rollback's.
//
// Two things pg leaves to the caller. A statement that failed inside the
// callback and was caught there, without a savepoint, has aborted the
// transaction, and the server answers the COMMIT that follows with the tag
// ROLLBACK and no error: the callback "succeeded" and nothing was written
// (measured 2026-10-09). So the tag is checked, and that statement's error is
// thrown — the same outcome postgres.js gave by rejecting the whole begin
// (B69). And a connection whose ROLLBACK or COMMIT failed is in a state nobody
// knows; it is destroyed rather than handed back, where the next caller's
// statements could run inside what is left of this transaction.
export async function transaction<T>(run: (query: Query) => Promise<T>): Promise<T> {
  if (!enabled()) throw new Error("DATABASE_URL is not set");
  const client = await connect();
  // A connection that breaks between statements emits rather than rejects,
  // and nobody else is listening while it is checked out.
  const heard = (error: Error) => log("warn", "database connection dropped", { error: String(error) });
  client.on("error", heard);
  const tx: Tx = { client, savepoints: 0 };
  let broken = false;
  try {
    try {
      await exec(client, "BEGIN", []);
    } catch (error) {
      broken = true;
      throw error;
    }
    let result: T;
    try {
      result = await run(queryOn(tx));
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollback) {
        broken = true;
        log("warn", "rollback failed", { error: String(rollback) });
      }
      throw error;
    }
    let commit: pg.QueryResult;
    try {
      commit = await client.query("COMMIT");
    } catch (error) {
      broken = true;
      throw unavailable(error);
    }
    if (commit.command !== "COMMIT") {
      throw tx.failed ?? new Error(`transaction rolled back at COMMIT (${commit.command})`);
    }
    return result;
  } finally {
    client.off("error", heard);
    client.release(broken);
  }
}

// Whether `run` is a query function a transaction() or a savepoint() handed
// out. A wrapper around one is not: its statements would run, but savepoint()
// cannot open a savepoint on it and refuses — a refusal that, met only at the
// step that needs the savepoint, takes that step's whole transaction back
// (verifier on B70; B81). Asked up front by the callers that will need one.
export function inTransaction(run: Query): boolean {
  return scopes.has(run);
}

// A step that may go back alone, inside a transaction: its statements run on a
// savepoint, a throw from it rolls back to the savepoint and is re-thrown, and
// the transaction goes on if the caller catches it — the caught failure is
// forgotten, so COMMIT commits. A failure inside the step that the step itself
// caught is not undone by anything and still rolls the transaction back.
export async function savepoint<T>(run: Query, step: (run: Query) => Promise<T>): Promise<T> {
  const known = scopes.get(run);
  if (!known) throw new Error("savepoint() takes the query function of a transaction() or of a savepoint()");
  const { tx } = known;
  const name = `step_${++tx.savepoints}`;
  const failedBefore = tx.failed;
  await exec(tx.client, `SAVEPOINT ${name}`, []);
  let result: T;
  try {
    result = await step(queryOn(tx, known.around));
  } catch (error) {
    try {
      await exec(tx.client, `ROLLBACK TO SAVEPOINT ${name}`, []);
      tx.failed = failedBefore;
    } catch (rollback) {
      tx.failed ??= rollback;
    }
    throw error;
  }
  await exec(tx.client, `RELEASE SAVEPOINT ${name}`, []);
  return result;
}

// LISTEN, on a connection of its own that this file keeps alive — to pg it is
// an ordinary client. The chat room waits on it for rows written by any node
// (chat/relay.ts).
//
// listen() never rejects. chat/relay.ts keeps the promise (`??=`) per channel,
// so one refusal while the database was down would have made the node deaf
// until a restart. The channel is registered at once; the connection, and the
// LISTEN on every registered channel, are this file's business, retried with a
// growing delay for as long as it takes.
//
// A notification sent while the connection is down is not kept for anyone, so
// a gap is reported: listenWasLost() when an established connection drops, and
// again when it comes back after failed attempts — a room opened during the
// outage was waiting on a connection that did not exist.
const channels = new Map<string, Set<(payload: string) => void>>();
let listener: pg.Client | null = null;
let connecting: Promise<void> | null = null;
let retryTimer: number | undefined;
let failedAttempts = 0;
let lostSince = 0;
// Bumped by closePool(): a connection or a timer of an older generation does
// nothing when it lands.
let generation = 0;

const RETRY_FIRST_MS = 100;
const RETRY_CEILING_MS = 30_000;

// A database that goes silent without a FIN — a box gone, a firewall dropping
// — is never noticed by the LISTEN connection on its own: TCP keepalive does
// not take effect under Deno (clientConfig()), and a LISTEN connection sends
// nothing, so it stays "up" while every room on the node is deaf (security
// lens H4, measured by NC-H 2026-10-09). So the node asks: SELECT 1 on the
// LISTEN connection every PING_EVERY, and no answer within PING_TIMEOUT drops
// it like any other loss — listenWasLost() closes the rooms 1012, and the
// usual backoff reconnects.
//
// The period is the statement timeout (15 s, or RELAY_DB_TIMEOUT_MS): the
// same promise already made for a query — the node gives a silent database no
// longer than a statement may run — and a query every 15 s on one connection
// per node is nothing to the database. The answer gets 5 s at most: a SELECT 1
// on a live connection comes back in milliseconds, and 5 s leaves room for a
// database busy enough to queue it without calling that a loss. A room is deaf
// for 20 s at most.
const PING_TIMEOUT_CEILING_MS = 5_000;
function pingEveryMs(): number {
  return statementTimeoutMs();
}
function pingTimeoutMs(): number {
  return Math.min(PING_TIMEOUT_CEILING_MS, statementTimeoutMs());
}

function ident(channel: string): string {
  return `"${channel.replaceAll('"', '""')}"`;
}

class ListenSilent extends Error {
  constructor(ms: number) {
    super(`the LISTEN connection did not answer SELECT 1 within ${ms} ms`);
    this.name = "ListenSilent";
  }
}

function startListening(): Promise<void> {
  if (listener) return Promise.resolve();
  // A retry is already scheduled: wait for it rather than try now. Otherwise
  // every room opened while the database is down is an attempt of its own, and
  // whoever holds tickets sets the pace instead of the backoff (22 attempts in
  // a second, measured; security lens H1, 2026-10-09).
  if (retryTimer !== undefined) return Promise.resolve();
  connecting ??= connectListener(generation).finally(() => (connecting = null));
  return connecting;
}

async function connectListener(born: number): Promise<void> {
  const client = new pg.Client(clientConfig());
  let gone = false;
  let pingTimer: number | undefined;
  const drop = (error?: unknown) => {
    if (gone) return; // one client, one replacement, however many events it emits
    gone = true;
    clearTimeout(pingTimer);
    client.end().catch(() => {});
    // end() sends Terminate and waits for the server to close: a silent server
    // never does, and the socket would stay open for good. Cut it.
    if (error instanceof ListenSilent) {
      (client as unknown as { connection?: { stream?: { destroy(): void } } }).connection?.stream?.destroy();
    }
    if (listener === client) {
      listener = null;
      lostSince = Date.now();
      log("warn", "database LISTEN connection lost", { error: String(error ?? "ended") });
      listenWasLost();
    }
    retryLater(born);
  };
  client.on("error", drop);
  client.on("end", () => drop());
  client.on("notice", onNotice);
  client.on("notification", (message: { channel: string; payload?: string }) => {
    for (const callback of channels.get(message.channel) ?? []) {
      try {
        callback(message.payload ?? "");
      } catch (error) {
        log("error", "LISTEN callback failed", { channel: message.channel, error: String(error) });
      }
    }
  });
  try {
    await client.connect();
    for (const channel of channels.keys()) await client.query(`LISTEN ${ident(channel)}`);
  } catch (error) {
    if (failedAttempts === 0 && !lostSince) {
      log("warn", "database LISTEN connection failed", { error: String(error) });
    }
    failedAttempts++;
    drop(error);
    return;
  }
  if (born !== generation || gone) {
    if (!gone) {
      gone = true;
      await client.end().catch(() => {});
    }
    return;
  }
  listener = client;
  // One ping at a time: the next is scheduled when the last has answered, so a
  // slow answer never stacks queries on the connection.
  const ping = () => {
    pingTimer = setTimeout(async () => {
      let timer: number | undefined;
      const silent = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ListenSilent(pingTimeoutMs())), pingTimeoutMs());
      });
      try {
        await Promise.race([client.query("SELECT 1"), silent]);
      } catch (error) {
        drop(error);
        return;
      } finally {
        clearTimeout(timer);
      }
      if (!gone) ping();
    }, pingEveryMs());
    Deno.unrefTimer(pingTimer);
  };
  ping();
  if (failedAttempts > 0 || lostSince) {
    log("info", "database LISTEN connection restored", {
      attempts: failedAttempts,
      downMs: lostSince ? Date.now() - lostSince : undefined,
    });
  }
  if (failedAttempts > 0) listenWasLost();
  failedAttempts = 0;
  lostSince = 0;
}

function retryLater(born: number): void {
  if (born !== generation || retryTimer !== undefined) return;
  const ceiling = Math.min(RETRY_CEILING_MS, RETRY_FIRST_MS * 2 ** Math.min(failedAttempts, 16));
  // Jitter, so a pool of nodes that lost the same database does not come back
  // to it in step.
  const delay = ceiling / 2 + Math.random() * ceiling / 2;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (born === generation) startListening();
  }, delay);
}

export async function listen(channel: string, onPayload: (payload: string) => void): Promise<void> {
  if (!enabled()) return;
  let callbacks = channels.get(channel);
  if (!callbacks) channels.set(channel, callbacks = new Set());
  callbacks.add(onPayload);
  await startListening();
  // Connected before this channel was registered: LISTEN on it now. Twice on
  // the same channel is harmless, and a failure here is a dropped connection,
  // which LISTENs every channel again when it comes back.
  await listener?.query(`LISTEN ${ident(channel)}`).catch(() => {});
}

// For /health: whether this node is hearing the database right now. `off` — no
// database configured; `idle` — nothing has asked to listen yet (a node that
// served no chat room); `up` — connected and listening; `down` — something
// listens and the connection is not there, so notifications are being lost.
export type ListenState = "off" | "idle" | "up" | "down";
export function listenState(): ListenState {
  if (!enabled()) return "off";
  if (listener) return "up";
  return channels.size === 0 ? "idle" : "down";
}

// Called once each time the LISTEN connection drops: notifications sent while
// it was down are lost, so chat/relay.ts closes its rooms with 1012 and the
// clients reconnect and reread. Returns the unsubscribe. Contract for W15-NC;
// the pg rewrite of listen() calls these.
const listenLost = new Set<() => void>();
export function onListenLost(callback: () => void): () => void {
  listenLost.add(callback);
  return () => listenLost.delete(callback);
}
export function listenWasLost(): void {
  for (const callback of listenLost) callback();
}

// Stops everything this file started — the retry timer, the LISTEN connection,
// the pool — so a tool that calls it exits on its own instead of being held
// open by a socket or a timer.
export async function closePool(): Promise<void> {
  generation++;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  channels.clear();
  failedAttempts = 0;
  lostSince = 0;
  const closing = listener;
  listener = null;
  await connecting?.catch(() => {});
  await closing?.end().catch(() => {});
  const ending = pool;
  pool = null;
  await ending?.end();
}
