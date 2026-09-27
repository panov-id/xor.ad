// deno-suite: own-process — in deno.json's --ignore for its own process, not for a database (scripts/check-db-suites.sh).
// What reaches the console past log()'s own lines (SC1): a rejection nobody
// handles and an error thrown out of a callback, which Deno printed as they
// were — the database's address and port, a caller's address — and the
// config's complaint about bad JSON, which quoted the text it choked on,
// a sender's mailbox or a mail provider's key.
//
// Its own process (run by scripts/run-relay-database-tests.sh from the
// --ignore list; no database needed): the handler it installs is the whole
// process's, and a unit suite sharing it would end at the first stray
// rejection of another test.

import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("STORAGE_TRANSPORT", "none");
Deno.env.set("RESEND_KEYS", '{"sosed":re_SECRETKEY123}'); // a parse error that quotes its text
Deno.env.set("BRANDS", '[{"key":"a","from":x <boss@mail.example>}]');

const lines: string[] = [];
const original = { log: console.log, error: console.error, warn: console.warn };
const catchLine = (...args: unknown[]) => lines.push(args.map(String).join(" "));
console.log = catchLine;
console.error = catchLine;
console.warn = catchLine;
const { installUncaughtScrub } = await import("../src/lib/log.ts");
const { scrubAddresses } = await import("../src/lib/scrub.ts");
const exits: number[] = [];
installUncaughtScrub((code) => exits.push(code));
const pooled = { sanitizeOps: false, sanitizeResources: false };
const restore = () => Object.assign(console, original);

Deno.test({ name: "the config's complaint about bad JSON names the error, not the text it choked on", ...pooled, fn: () => {
  const said = lines.filter((line) => line.includes("[config] bad"));
  assertEquals(said.length, 2, `the config said: ${JSON.stringify(lines)}`);
  for (const line of said) {
    assert(!line.includes("SECRETKEY") && !line.includes("boss@"), `the config printed its secret: ${line}`);
  }
} });

Deno.test({ name: "a rejection nobody handles is one scrubbed error line, and the process still ends", ...pooled, fn: async () => {
  lines.length = 0;
  Promise.reject(new Error("connect ECONNREFUSED 10.0.17.2:5432 from 198.51.100.4 for [2001:db8::7]:443"));
  await new Promise((done) => setTimeout(done, 50));
  restore();
  const line = lines.find((l) => l.includes("uncaught rejection"));
  assert(line, `no line for the rejection: ${JSON.stringify(lines)}`);
  for (const address of ["10.0.17.2", "198.51.100.4", "2001:db8::7"]) {
    assert(!line.includes(address), `${address} reached the console: ${line}`);
  }
  assertEquals(exits, [1], "the process did not end as it did before");
} });

// The price of the scrub on the longest field it reads, where B106 once hung
// the node: measured, printed for the hand-over, bounded loosely.
Deno.test({ name: "the scrub reads its longest field in linear time", ...pooled, fn: () => {
  const worst = ["1.".repeat(4096), "a@".repeat(4096), ":".repeat(8192), "[::".repeat(2730), "10.0.0.1:5432 ".repeat(585)];
  let slowest = 0;
  for (const text of worst) {
    const started = performance.now();
    scrubAddresses(text);
    slowest = Math.max(slowest, performance.now() - started);
  }
  console.log(`SC1 price: slowest 8 KB worst-case field scrubbed in ${slowest.toFixed(2)} ms`);
  assert(slowest < 500, `a field of 8 KB took ${slowest.toFixed(0)} ms`);
} });
