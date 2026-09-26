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

// Every level: stdout keeps info lines, and a caller's address in one is the
// same leak one step before storage.
configured("warn and info lines are scrubbed too", () => {
  for (const level of ["warn", "info"] as const) {
    const { raw } = printedBy(level, { detail: "from 198.51.100.23:8080" });
    assert(!raw.includes("198.51.100.23"), `a ${level} line kept the address: ${raw}`);
  }
});
