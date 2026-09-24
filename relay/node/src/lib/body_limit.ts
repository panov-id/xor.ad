// A ceiling on the request body, before any route reads it.
//
// Nothing capped a body until 2026-09-24: the unsigned intake (/v1/waitlist
// reads its whole body before the quota, v1.ts) and the signature check itself
// (identity_guard.ts reads the body to hash it) took whatever arrived, so one
// POST of a few hundred megabytes was a way to spend the node's memory
// (review panel 2026-09-24, owner-decisions, finding 2). There is no proxy in
// front of the node that caps it either.
//
// limits.tsv request.body.bytes: 1 MiB. The node takes no files; its largest
// honest body is 4000 graphemes of text (a notice's reason, a support answer),
// and even written in ZWJ emoji and JSON escapes that stays near 200 KB.
//
// Read as a stream and stopped at the ceiling, not trusted from
// content-length: a chunked body has none, and a lying one says anything.
// What passes is handed on as a fresh Request over the bytes already read, so
// every route and the signature check see exactly what was counted.

import { json } from "./http.ts";

export const BODY_MAX_BYTES = 1024 * 1024;
// And a deadline for the whole body: a ceiling alone let slow connections each
// hold a buffer for as long as they liked (review panel 2026-09-24). Thirty
// seconds carries a megabyte over the slowest honest line many times over.
export const BODY_DEADLINE_MS = 30_000;

function tooLarge(): Response {
  return json({ error: { code: "invalid_body", message: `the body is larger than ${BODY_MAX_BYTES} bytes` } }, 413);
}

function tooSlow(): Response {
  return json({ error: { code: "invalid_body", message: "the body did not arrive in time" } }, 408);
}

export async function capBody(
  req: Request,
  max = BODY_MAX_BYTES,
  deadlineMs = BODY_DEADLINE_MS,
): Promise<Request | Response> {
  if (req.body === null) return req;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await req.body.cancel().catch(() => {});
    return tooLarge();
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), deadlineMs)));
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), late]);
      if (next === "late") {
        await reader.cancel().catch(() => {});
        return tooSlow();
      }
      const { done, value } = next;
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new Request(req.url, { method: req.method, headers: req.headers, body: bytes });
}
