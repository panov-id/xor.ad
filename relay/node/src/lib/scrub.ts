// What must not survive into a log line: a mailbox, and an IP address with or
// without its port (B106). log() runs every line through scrubFields, so a
// caller that forgets cannot leak; mailer.ts's withoutAddresses is the same
// scrub under its older name.
//
// withoutAddresses used to cut mailboxes only, and addresses reached the stored
// error lines from text nobody here writes: a RAISE naming 198.51.100.7,
// postgres.js's "write CONNECTION_CLOSED 10.0.17.2:5432" with the database's
// own address and port, a caller's address in dispatch's "handler threw"
// (the coordinator's verifier on B98).
//
// Linear, and capped. The first version was a set of regular expressions, and
// they backtracked: log() scrubs every field, a caller's raw Origin header
// among them (tenant.ts), and a 100 KB Origin held the node for ten seconds —
// /health included (the coordinator's verifier on B106). Now one pass splits
// the text into words on a plain character class, each word is read by hand,
// and a string longer than MAX_FIELD is cut before it is read at all.

export const MAX_FIELD = 8192;

// A word: a run of anything but whitespace, brackets, quotes and , ; = —
// the characters an address never holds and a message puts around one.
// One character class, repeated: no nesting, nothing to backtrack into.
const WORD = /[^\s()<>"',;=]+/gu;

function digits(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) if (c < "0" || c > "9") return false;
  return true;
}

function isHex(s: string): boolean {
  if (s.length === 0 || s.length > 4) return false;
  for (const c of s) if (!((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F"))) return false;
  return true;
}

function isIPv4(s: string): boolean {
  const parts = s.split(".");
  return parts.length === 4 && parts.every((p) => p.length <= 3 && digits(p) && Number(p) <= 255);
}

// Groups of up to four hex digits, "::" at most once, a dotted IPv4 tail
// allowed; eight groups, or fewer and at least one with "::". And a decimal
// digit somewhere: "abc::def" and "a::b" are names, not hosts.
function isIPv6(s: string): boolean {
  if (!s.includes(":") || !/[0-9]/.test(s)) return false;
  let body = s;
  let tail = 0;
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    if (!isIPv4(s.slice(lastColon + 1))) return false;
    body = s.slice(0, lastColon + 1) + "0";
    tail = 1; // the dotted tail stands for two groups; one placeholder is in `body`
  }
  const halves = body.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (![...left, ...right].every(isHex)) return false;
  const written = left.length + right.length + tail;
  return halves.length === 2 ? written >= 1 && written <= 7 : written === 8;
}

// host, host:port, [v6], [v6]:port, v6%zone; the unspecified 0.0.0.0 names
// no host — "listening on 0.0.0.0:8080" — and is left.
function isHost(s: string): boolean {
  if (s.startsWith("[")) {
    const close = s.indexOf("]");
    if (close === -1) return false;
    const rest = s.slice(close + 1);
    if (rest !== "" && !(rest.startsWith(":") && rest.length <= 6 && digits(rest.slice(1)))) return false;
    return isIPv6(s.slice(1, close).replace(/%.*$/, ""));
  }
  const colon = s.indexOf(":");
  if (colon !== -1 && s.indexOf(":", colon + 1) === -1) {
    // One colon: IPv4 and a port.
    const port = s.slice(colon + 1);
    const v4 = s.slice(0, colon);
    return port.length <= 5 && digits(port) && isIPv4(v4) && v4 !== "0.0.0.0";
  }
  if (colon === -1) return isIPv4(s) && s !== "0.0.0.0";
  const bare = s.replace(/%.*$/, "");
  if (isIPv6(bare)) return true;
  // Eight groups and a port after them, written without brackets.
  const last = bare.lastIndexOf(":");
  const port = bare.slice(last + 1);
  return port.length <= 5 && digits(port) && !bare.includes("::") && bare.split(":").length === 9 &&
    isIPv6(bare.slice(0, last));
}

// A mailbox inside one piece of a word: exactly one @, something before it,
// a domain with a dot after it, its last label two characters or more and not
// all digits — so "npm:postgres@3.4.4", "user@host" and "a@b" are left.
function isMailbox(piece: string): boolean {
  const at = piece.indexOf("@");
  if (at <= 0 || piece.indexOf("@", at + 1) !== -1) return false;
  const domain = piece.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot <= 0) return false;
  const label = domain.slice(dot + 1);
  return label.length >= 2 && !digits(label) && !domain.includes("..");
}

// One word. A sentence's full stop is given back after it; a label before an
// address ("ip:2001:db8::1") is kept and the address goes; a URL's host
// ("http://10.0.0.5:8080/x") goes and its path stays; a mailbox goes from
// whatever piece of the word holds it. "Chrome/120.0.0.0" is a name and a
// version, not a host: after a single "/" a word is not read as an address.
function scrubWord(word: string): string {
  // By hand, not /\.+$/: that one retries from every dot of a long run.
  let end = word.length;
  while (end > 0 && word[end - 1] === ".") end--;
  const trimmed = word.slice(0, end);
  const stop = word.slice(trimmed.length);
  if (trimmed === "") return word;
  if (isHost(trimmed)) return "<ip>" + stop;
  const label = /^[A-Za-z][A-Za-z_-]*:/.exec(trimmed);
  if (label && isHost(trimmed.slice(label[0].length))) return label[0] + "<ip>" + stop;
  if (trimmed.includes("//")) {
    const at = trimmed.indexOf("//") + 2;
    const end = trimmed.indexOf("/", at);
    const authority = end === -1 ? trimmed.slice(at) : trimmed.slice(at, end);
    const host = authority.slice(authority.lastIndexOf("@") + 1);
    if (isHost(host)) {
      return trimmed.slice(0, at) + authority.slice(0, authority.length - host.length) + "<ip>" +
        (end === -1 ? "" : trimmed.slice(end)) + stop;
    }
  }
  if (!trimmed.includes("@")) return word;
  // Pieces between / and :, each checked on its own.
  const pieces = trimmed.split(/([/:])/);
  let changed = false;
  for (let i = 0; i < pieces.length; i += 2) {
    if (isMailbox(pieces[i])) {
      pieces[i] = "<address>";
      changed = true;
    }
  }
  return changed ? pieces.join("") + stop : word;
}

export function scrubAddresses(text: string): string {
  return text.replace(WORD, scrubWord);
}

function capped(text: string): string {
  return text.length <= MAX_FIELD ? text : `${text.slice(0, MAX_FIELD)}…[+${text.length - MAX_FIELD} chars]`;
}

// Every string in a log entry, cut to MAX_FIELD and scrubbed, down through
// arrays and objects of any kind; everything else as it is.
//
// Not only plain objects (review panel 6; B106). Every log() call hands over
// String(error) today, but an Error, a class instance or an object with no
// prototype would have kept its addresses past a walk that stopped at plain
// objects. Walked rather than refused: a gate against objects would fail a
// caller at the moment it logs a failure, and an Error given to JSON as it is
// comes out as {} — so it is written as its name, message and cause.
export function scrubFields(value: unknown): unknown {
  if (typeof value === "string") return scrubAddresses(capped(value));
  if (Array.isArray(value)) return value.map((item) => scrubFields(item));
  if (value instanceof Error) {
    const out: Record<string, unknown> = { name: value.name, message: scrubAddresses(capped(value.message)) };
    if (value.cause !== undefined) out.cause = scrubFields(value.cause);
    return out;
  }
  if (value !== null && typeof value === "object") {
    // A value that writes itself — a Date — as it writes itself.
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubFields(v)]));
  }
  return value;
}
