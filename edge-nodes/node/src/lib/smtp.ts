// Minimal SMTP client — enough to hand an HTML email to Mailpit (dev/local),
// which needs no TLS/auth. Real sends go via Resend (HTTP), not this. Zero deps.

export interface SmtpMail {
  host: string;
  port: number;
  from: string; // "Name <addr>" or "addr"
  to: string;
  subject: string;
  html: string;
}

function addr(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}
function displayName(s: string): string {
  const m = s.match(/^(.*)<[^>]+>\s*$/);
  return m ? m[1].trim() : "";
}
function b64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
// RFC 2047 encoded-word for non-ASCII header text.
function mimeWord(s: string): string {
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=` : s;
}

function buildMessage(m: SmtpMail): string {
  const name = displayName(m.from);
  const fromHeader = name ? `${mimeWord(name)} <${addr(m.from)}>` : addr(m.from);
  const headers = [
    `From: ${fromHeader}`,
    `To: ${m.to}`,
    `Subject: ${mimeWord(m.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n");
  // Normalize newlines + SMTP dot-stuffing (lines starting with '.').
  const body = m.html.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");
  return `${headers}\r\n\r\n${body}`;
}

export async function sendSmtp(m: SmtpMail): Promise<void> {
  const conn = await Deno.connect({ hostname: m.host, port: m.port });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const buf = new Uint8Array(2048);
  const read = async () => {
    const n = await conn.read(buf);
    return n ? dec.decode(buf.subarray(0, n)) : "";
  };
  const send = async (line: string) => {
    await conn.write(enc.encode(line + "\r\n"));
    await read();
  };
  try {
    await read(); // greeting
    await send("EHLO edge-node");
    await send(`MAIL FROM:<${addr(m.from)}>`);
    await send(`RCPT TO:<${m.to}>`);
    await send("DATA");
    await conn.write(enc.encode(buildMessage(m) + "\r\n.\r\n"));
    await read();
    await send("QUIT");
  } finally {
    conn.close();
  }
}
