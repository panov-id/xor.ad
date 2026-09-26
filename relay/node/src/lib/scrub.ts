// What must not survive into a log line: a mailbox, and an IP address with or
// without its port (B106). log() runs every line through scrubAddresses, so a
// caller that forgets cannot leak; mailer.ts's withoutAddresses is the same
// function under its older name.
//
// withoutAddresses used to cut mailboxes only, and addresses reached the stored
// error lines from text nobody here writes: a RAISE naming 198.51.100.7,
// postgres.js's "write CONNECTION_CLOSED 10.0.17.2:5432" with the database's
// own address and port, a caller's address in dispatch's "handler threw"
// (the coordinator's verifier on B98).
//
// By shape, then by reading: a candidate is replaced only if it parses as an
// address — octets up to 255, IPv6 groups of up to four hex digits with "::" or
// all eight of them — so a time of day (11:10:33), a version with a part past
// 255 (120.0.6099.109) or a ratio (1:2:3) is left as it is.

const MAILBOX = /[\w.+-]+@[\w.-]+\.\w+/g;

// [v6](%zone)(:port), or a bare run of hex, colons and dots with at least two
// colons, an optional zone after it.
const V6_CANDIDATE = /\[([0-9a-fA-F:.]+)(?:%[^\]\s]*)?\](?::\d{1,5})?|(?<![0-9A-Za-z:.])([0-9a-fA-F]*:[0-9a-fA-F:]*:[0-9a-fA-F:.]*)(?:%[\w.-]+)?/g;
const V4_CANDIDATE = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?![\d.])/g;

function isIPv4(s: string): boolean {
  const parts = s.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIPv6(s: string): boolean {
  let groups = s;
  let tailGroups = 0;
  const lastColon = s.lastIndexOf(":");
  if (lastColon === -1) return false;
  if (s.slice(lastColon + 1).includes(".")) {
    if (!isIPv4(s.slice(lastColon + 1))) return false;
    groups = s.slice(0, lastColon + 1) + "0";
    tailGroups = 1; // the dotted tail stands for two groups; one placeholder is in `groups`
  }
  if (!/^[0-9a-fA-F:]+$/.test(groups)) return false;
  const halves = groups.split("::");
  if (halves.length > 2) return false;
  const count = (h: string) => (h ? h.split(":") : []);
  const left = count(halves[0]), right = halves.length === 2 ? count(halves[1]) : [];
  if ([...left, ...right].some((g) => g.length === 0 || g.length > 4)) return false;
  const written = left.length + right.length + tailGroups;
  return halves.length === 2 ? written <= 7 : written === 8;
}

export function scrubAddresses(text: string): string {
  return text
    .replace(MAILBOX, "<address>")
    .replace(V6_CANDIDATE, (match, bracketed?: string, bare?: string) =>
      isIPv6((bracketed ?? bare ?? "").replace(/%.*/, "")) ? "<ip>" : match)
    .replace(V4_CANDIDATE, (match, address: string) => isIPv4(address) ? "<ip>" : match);
}

// Every string in a log entry, down through objects and arrays; everything else
// as it is. The line's own timestamp passes untouched: 14:19:21.795 is no
// address by the reading above.
export function scrubFields(value: unknown): unknown {
  if (typeof value === "string") return scrubAddresses(value);
  if (Array.isArray(value)) return value.map((item) => scrubFields(item));
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubFields(v)]));
  }
  return value;
}
