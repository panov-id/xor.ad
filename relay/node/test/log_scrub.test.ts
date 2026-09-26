// No address survives into a log line (B106, from the coordinator's verifier
// on B98). withoutAddresses cut mailboxes from the errors that reached it, and
// nothing cut an IP: 198.51.100.7 from a RAISE, the database's own address and
// port in postgres.js's connection errors ("write CONNECTION_CLOSED
// 10.0.17.2:5432"), a caller's address in dispatch's "handler threw". Error and
// warn lines are copied into object storage as well (lib/log.ts). The scrub
// sits in log() itself, the one place every line goes through, so a caller
// that forgets it cannot leak.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { log } from "../src/lib/log.ts";
import { MAX_FIELD, scrubAddresses } from "../src/lib/scrub.ts";

import { suite } from "./support/config_env.ts";

const configured = suite({});

function printedBy(level: "info" | "warn" | "error", fields: Record<string, unknown>, msg = "something failed") {
  const printed: string[] = [];
  const out = console.log, err = console.error;
  console.log = (line: string) => printed.push(line);
  console.error = (line: string) => printed.push(line);
  try {
    log(level, msg, fields);
  } finally {
    console.log = out;
    console.error = err;
  }
  assertEquals(printed.length, 1, "log() printed no line, or more than one");
  return { raw: printed[0], entry: JSON.parse(printed[0]) as Record<string, unknown> };
}

configured("an IP, with a port or without, IPv4 or IPv6, leaves no trace in an error line", () => {
  const { raw, entry } = printedBy("error", {
    error: "PostgresError: write CONNECTION_CLOSED 10.0.17.2:5432",
    raised: 'ERROR: address 198.51.100.7 is refused (P0001)',
    v6: "connect ECONNREFUSED 2001:db8:4:5::1",
    v6port: "fetch failed: [2001:db8::17]:443 did not answer",
    v6full: "from 2001:0db8:0000:0000:0000:ff00:0042:8329",
    mapped: "peer ::ffff:203.0.113.9 went away",
    nested: { detail: ["via 192.0.2.44", "ok"] },
    mailbox: "sender someone@example.org bounced",
    // At the end of a sentence: the full stop was taken into the run and the
    // address read as no address (B106, after the observer's probe).
    sentence6: "could not reach 2001:db8:9::1.",
    sentence4: "could not reach 203.0.113.77.",
  }, "handler threw for 203.0.113.200");
  assertEquals(entry.sentence6, "could not reach <ip>.", "an IPv6 address ending a sentence survived");
  assertEquals(entry.sentence4, "could not reach <ip>.", "an IPv4 address ending a sentence survived");
  for (const address of ["10.0.17.2", "5432", "198.51.100.7", "2001:db8", "2001:0db8", "203.0.113.9", "192.0.2.44", "203.0.113.200", "203.0.113.77", "someone@example.org"]) {
    assert(!raw.includes(address), `${address} survived into the log line: ${raw}`);
  }
  assertEquals(entry.error, "PostgresError: write CONNECTION_CLOSED <ip>", "an IPv4 address with its port was not replaced whole");
  assertEquals(entry.v6port, "fetch failed: <ip> did not answer", "a bracketed IPv6 address with its port was not replaced whole");
  assertEquals(entry.msg, "handler threw for <ip>", "the message itself kept an address");
  assertEquals((entry.nested as { detail: string[] }).detail, ["via <ip>", "ok"], "an address inside a nested field survived");
  assertEquals(entry.mailbox, "sender <address> bounced", "a mailbox survived");
});

// What only looks like an address is left alone: a time of day, a timestamp,
// a version with a part past 255, a uuid, a table of counts, a path.
configured("times, versions, ids and paths are not taken for addresses", () => {
  const kept = {
    at: "failed at 11:10:33.089, again at 11:10:34",
    version: "Chrome/120.0.6099.109 Deno/2.1.4",
    // Four parts of up to three digits, one past 255: the shape of an address,
    // and not one — held by the octet check alone.
    build: "release 256.300.1.1",
    id: "4f0c2a4e-8d7b-4c1e-9f6a-1b2c3d4e5f60",
    counts: "1:2:3 of 10:20",
    path: "/v1/me/tables/3",
    code: "55P03",
    // SQL casts, as Postgres quotes the statement in an error and as our own
    // lines carry it: "1::" and "::da" read as a one-group compressed IPv6 and
    // were replaced (the observer's probe on B106).
    cast: "WHERE id = ANY($1::uuid[])",
    casts: "SELECT $2::int, now()::date, $3::bytea",
    // A cast after a space: nothing on the left keeps it out, only that it
    // runs into a letter on the right.
    spaced: "SELECT id ::text, code ::bytea",
    // Postgres cuts a long statement in an error's context with "...": then
    // only the left edge keeps "::..." after a ")" or "$1" from being read as
    // "::" and a sentence's stops.
    truncated: "LINE 1: SELECT now()::... WHERE id = $1::...",
    // A bare "::" names no host.
    bare: "a :: b",
    stack: "at file.ts:155:12, std::vector, a::b::c",
  };
  const { entry } = printedBy("error", kept);
  for (const [key, value] of Object.entries(kept)) {
    assertEquals(entry[key], value, `${key} was taken for an address`);
  }
  assert(typeof entry.ts === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(entry.ts as string), "the line's own timestamp was scrubbed");
});

// A mailbox in any script (review panel 6, security lens; B106): the intake
// takes any characters (lib/http.ts), and a refusal from SMTP or Resend quoting
// the recipient went into a stored error line whole — \w is ASCII only.
configured("a mailbox in any script is scrubbed, and a stack line, a path or user@host is not", () => {
  const { entry } = printedBy("error", {
    cyrillic: "550 иван@почта.рф: no such user",
    mixed: "rejected ivan@почта.рф and user@münchen.de",
    constraint: 'Key (email)=(Иван.Петров@mail.ru) already exists.',
    stack: "at assertEquals (https://jsr.io/@std/assert/1.0.19/equals.ts:67:9)",
    local: "user@host refused the connection",
    bare: "a@b",
    path: "/v1/me/@handle/tables",
  });
  assertEquals(entry.cyrillic, "550 <address>: no such user", "a Cyrillic mailbox survived");
  assertEquals(entry.mixed, "rejected <address> and <address>", "a mailbox with a non-ASCII domain survived");
  assertEquals(entry.constraint, "Key (email)=(<address>) already exists.", "the mailbox a unique constraint quotes survived");
  assertEquals(entry.stack, "at assertEquals (https://jsr.io/@std/assert/1.0.19/equals.ts:67:9)", "a stack line was taken for a mailbox");
  assertEquals(entry.local, "user@host refused the connection", "user@host, with no domain, was taken for a mailbox");
  assertEquals(entry.bare, "a@b", "a@b was taken for a mailbox");
  assertEquals(entry.path, "/v1/me/@handle/tables", "a path was taken for a mailbox");
});

// Not only plain objects (review panel 6; B106): every log() call hands over
// String(error) today, but an Error, an instance of a class or an object with
// no prototype reaching log() would have kept its addresses — or, for an
// Error, logged as {} and said nothing.
configured("an Error, a class instance and a null-prototype object are scrubbed, and an Error says what it was", () => {
  class Fault { constructor(public detail: string) {} }
  const bare = Object.create(null) as Record<string, unknown>;
  bare.detail = "from 198.51.100.61";
  const { raw, entry } = printedBy("error", {
    error: new Error("connect to 198.51.100.60:5432 failed", { cause: new Error("for someone@example.org") }),
    fault: new Fault("peer 2001:db8:77::1 went away"),
    bare,
    at: new Date("2026-09-26T12:00:00Z"),
  });
  for (const address of ["198.51.100.60", "someone@example.org", "2001:db8:77::1", "198.51.100.61"]) {
    assert(!raw.includes(address), `${address} survived into the log line inside an object: ${raw}`);
  }
  const error = entry.error as { name?: string; message?: string; cause?: { message?: string } };
  assertEquals(error.name, "Error", "an Error was logged without its name");
  assertEquals(error.message, "connect to <ip> failed", "an Error was logged without its message");
  assertEquals(error.cause?.message, "for <address>", "an Error's cause was dropped or kept its address");
  assertEquals(entry.at, "2026-09-26T12:00:00.000Z", "a Date was taken apart instead of written as itself");
});

// Every level: stdout keeps info lines, and a caller's address in one is the
// same leak one step before storage.
configured("warn and info lines are scrubbed too", () => {
  for (const level of ["warn", "info"] as const) {
    const { raw } = printedBy(level, { detail: "from 198.51.100.23:8080" });
    assert(!raw.includes("198.51.100.23"), `a ${level} line kept the address: ${raw}`);
  }
});

// Linear, and capped (B106, the coordinator's verifier). The first scrub was a
// set of regular expressions that backtracked, and log() scrubs every field —
// a caller's raw Origin header among them (lib/tenant.ts): a 60 KB Origin held
// the node for 3.4 s, a 100 KB one for 10 s, /health included. Shapes that
// hurt the regular version, at 100 KB, through the scrub itself and through
// log(); the budget is 50 ms where the old version took seconds.
function timed(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

configured("a 100 KB field of address-like text is scrubbed in under 50 ms, in the scrub and through log()", () => {
  const shapes: Record<string, string> = {
    brackets: "[1%".repeat(34_000),
    word: "a".repeat(100_000),
    digits: "1.".repeat(50_000),
    colons: "1:".repeat(50_000),
    at: "a@".repeat(50_000),
    origin: "https://" + "1.".repeat(49_000) + "x",
  };
  for (const [name, text] of Object.entries(shapes)) {
    const direct = timed(() => scrubAddresses(text));
    assert(direct < 50, `scrubAddresses took ${direct.toFixed(0)} ms on 100 KB of "${name}"`);
    const logged = timed(() => printedBy("warn", { origin: text }));
    assert(logged < 50, `log() took ${logged.toFixed(0)} ms on a 100 KB "${name}" field`);
  }
});

configured("a field longer than MAX_FIELD is cut before it is read, and says how much was cut", () => {
  const long = "x".repeat(MAX_FIELD + 1000) + " 198.51.100.9";
  const { entry, raw } = printedBy("warn", { origin: long, short: "y".repeat(MAX_FIELD) });
  assertEquals(entry.origin, "x".repeat(MAX_FIELD) + "…[+1013 chars]", "a long field was not cut at MAX_FIELD with its tail counted");
  assertEquals((entry.short as string).length, MAX_FIELD, "a field of exactly MAX_FIELD was cut");
  assert(!raw.includes("198.51.100.9"), "the address past the cut survived");
});

// Shapes that leaked past the first version (the coordinator's verifier on
// B106): a labelled address, a bracketed one with a five-digit port, eight
// groups and a port without brackets, a URL's host. And shapes it took for an
// address that are none: a browser's version, the unspecified listen address,
// a C++ namespace, a package with its version.
configured("a labelled, bracketed, ported or URL-borne address goes; a version, 0.0.0.0, a namespace and a package stay", () => {
  const { entry, raw } = printedBy("error", {
    labelled: "peer ip:2001:db8::1 dropped",
    bracketed: "from [2001:db8::17]:54321",
    unbracketed: "from 2001:db8:0:0:0:0:0:17:8443",
    url: "fetch http://10.0.0.5:8080/x/y failed",
    urlUser: "postgres://relay:pw@10.0.17.2:5432/relay",
    agent: "Chrome/120.0.0.0 on Mozilla/5.0",
    listen: "listening on 0.0.0.0:8080",
    namespace: "in abc::def and std::string",
    pkg: "npm:postgres@3.4.4 loaded",
  });
  assertEquals(entry.labelled, "peer ip:<ip> dropped", "a labelled IPv6 address survived");
  assertEquals(entry.bracketed, "from <ip>", "a bracketed IPv6 address with a five-digit port survived");
  assertEquals(entry.unbracketed, "from <ip>", "eight groups and a port without brackets survived");
  assertEquals(entry.url, "fetch http://<ip>/x/y failed", "a URL's host survived, or its path went with it");
  assertEquals(entry.urlUser, "postgres://relay:pw@<ip>/relay", "a URL's host after credentials survived");
  for (const address of ["2001:db8", "10.0.0.5", "10.0.17.2", "54321", "8443"]) {
    assert(!raw.includes(address), `${address} survived into the log line: ${raw}`);
  }
  assertEquals(entry.agent, "Chrome/120.0.0.0 on Mozilla/5.0", "a browser's version was taken for an address");
  assertEquals(entry.listen, "listening on 0.0.0.0:8080", "the unspecified listen address was taken for a host");
  assertEquals(entry.namespace, "in abc::def and std::string", "a namespace was taken for an IPv6 address");
  assertEquals(entry.pkg, "npm:postgres@3.4.4 loaded", "a package with its version was taken for a mailbox");
});

// The copy in storage is the line the panel reads without shell access
// (lib/log.ts persist); the scrub sits before both sinks, and this pins the
// stored one rather than trusting the order of two calls.
const scrubDir = await Deno.makeTempDir();
const storedScrub = suite({ STORAGE_TRANSPORT: "fs", STORAGE_DIR: scrubDir, NODE_ENV_NAME: "test" });

storedScrub("the copy of an error line in storage carries no address either", async () => {
  const directory = `${scrubDir}/server-logs/test`;
  const out = console.error;
  console.error = () => {};
  try {
    log("error", "handler threw for 203.0.113.201", { error: "write CONNECTION_CLOSED 10.0.17.2:5432", who: "someone@example.org" });
  } finally {
    console.error = out;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  const files = [...Deno.readDirSync(directory)].map((entry) => entry.name);
  assertEquals(files.length, 1, "the error line was not written to storage");
  const stored = await Deno.readTextFile(`${directory}/${files[0]}`);
  for (const address of ["203.0.113.201", "10.0.17.2", "5432", "someone@example.org"]) {
    assert(!stored.includes(address), `${address} reached the stored copy: ${stored}`);
  }
  assert(stored.includes("handler threw for <ip>"), `the stored copy lost the message: ${stored}`);
});
