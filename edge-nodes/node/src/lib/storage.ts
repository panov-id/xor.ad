// Bunny Storage client — the v1 durable store. One object per item; the object
// key encodes identity (e.g. a hashed email), so a PUT is naturally idempotent
// and dedup is a cheap GET-before-PUT. No Bunny-specific SDK — just the HTTP API.

import { config } from "../config.ts";

function url(path: string): string {
  return `https://${config.bunny.host}/${config.bunny.zone}/${path}`;
}

function headers(): HeadersInit {
  return { AccessKey: config.bunny.key, "content-type": "application/json" };
}

export function storageEnabled(): boolean {
  return Boolean(config.bunny.zone && config.bunny.key);
}

export async function exists(path: string): Promise<boolean> {
  const res = await fetch(url(path), { method: "GET", headers: headers() });
  // Drain the body so the connection can be reused.
  await res.body?.cancel();
  return res.ok;
}

export async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(url(path), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`bunny storage PUT ${path} -> ${res.status}`);
}
