// W15-NC storm against node-postgres, no guard: does the process survive, does the
// pool answer afterwards, does LISTEN (re-subscribed on error) hear a NOTIFY after it?
import pg from "npm:pg@8.13.1";

const url = Deno.env.get("DATABASE_URL")!;
let uncaught = 0;
globalThis.addEventListener("error", (e) => { uncaught++; console.error("UNCAUGHT", e.error); });
globalThis.addEventListener("unhandledrejection", (e) => { uncaught++; console.error("UNHANDLED", e.reason); });

const pool = new pg.Pool({ connectionString: url, max: 4 });
let poolErrors = 0;
pool.on("error", () => poolErrors++); // idle client died: pg's documented contract

const heard: string[] = [];
let listener: pg.Client | null = null;
let relistens = 0;
let stopping = false;
async function subscribe(): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  client.on("notification", (m) => heard.push(m.payload ?? ""));
  let gone = false;
  const retry = () => {
    if (gone) return; // one client, one replacement, however many errors it emits
    gone = true;
    relistens++;
    if (listener === client) listener = null;
    client.end().catch(() => {});
    const again = () => subscribe().catch(() => setTimeout(again, 100));
    if (!stopping) setTimeout(again, 100);
  };
  client.on("error", retry);
  client.on("end", retry);
  await client.connect();
  await client.query("LISTEN w15nc_probe");
  listener = client;
}
await subscribe();

const admin = new pg.Client({ connectionString: url });
await admin.connect();
let kills = 0, failed = 0, ok = 0;
const end = Date.now() + 10_000;
const writer = async () => {
  while (Date.now() < end) {
    const a = "x".repeat(Math.floor(Math.random() * 2000));
    const b = "y".repeat(Math.floor(Math.random() * 1500));
    await pool.query("SELECT length($1::text) + length($2::text) AS n", [a, b]).then(() => ok++, () => failed++);
  }
};
const killer = async () => {
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 200));
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()",
    ).then(() => kills++, () => {});
  }
};
const t0 = Date.now();
await Promise.all([...Array(20)].map(writer).concat([killer()]));
const stormMs = Date.now() - t0;

for (let i = 0; i < 50 && !heard.includes("after"); i++) {
  await admin.query("SELECT pg_notify('w15nc_probe', 'after')").catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
}
const after = await pool.query("SELECT 1 AS n").then((r) => r.rows[0].n, (e) => `ERR ${e.message}`);
console.log(JSON.stringify({ stormMs, kills, ok, failed, poolErrors, relistens, uncaught, selectAfter: after, heardAfter: heard.includes("after") }));
stopping = true;
await listener?.end().catch(() => {});
await admin.end().catch(() => {});
await pool.end().catch(() => {});
Deno.exit(uncaught === 0 && after === 1 && heard.includes("after") && kills > 0 ? 0 : 1);
