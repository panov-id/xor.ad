// POST /client-error — fire-and-forget client error sink from the landing.
// Low-value/noisy: kept out of the waitlist store, own prefix, capped fields.

import { config } from "../config.ts";
import { json, readJson } from "../lib/http.ts";
import { put, storageEnabled } from "../lib/storage.ts";

function cap(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function clientError(req: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return json({ ok: true }); // never argue with a logger

  const record = {
    kind: cap(body.kind, 64),
    message: cap(body.message, 1000),
    stack: cap(body.stack, 2000),
    page_url: cap(body.page_url, 500),
    user_agent: cap(body.user_agent, 300),
    source: cap(body.source, 120),
    extra: body.extra ?? null,
    node: config.nodeId,
    env: config.envName,
    received_at: new Date().toISOString(),
  };

  if (storageEnabled()) {
    const key = `client-errors/${config.envName}/${crypto.randomUUID()}.json`;
    put(key, record).catch((e) => console.error("[client-error] store failed", e));
  }
  return json({ ok: true });
}
