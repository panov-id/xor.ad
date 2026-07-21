// Store abstraction — one object per item. `bunny` (Bunny Storage over HTTP) on
// the pool; `fs` (a mounted dir) for the local stand so it's self-contained and
// you can eyeball the JSON. Object key encodes identity → PUT is idempotent.

import { config } from "../config.ts";

const s = config.storage;

export function storageEnabled(): boolean {
  return s.transport === "fs" || Boolean(s.zone && s.key);
}

// --- fs ---
function fsPath(path: string): string {
  return `${s.dir}/${path}`;
}

// --- bunny ---
function bunnyUrl(path: string): string {
  return `https://${s.host}/${s.zone}/${path}`;
}
function bunnyHeaders(): HeadersInit {
  return { AccessKey: s.key, "content-type": "application/json" };
}

export async function exists(path: string): Promise<boolean> {
  if (s.transport === "fs") {
    try {
      await Deno.stat(fsPath(path));
      return true;
    } catch {
      return false;
    }
  }
  const res = await fetch(bunnyUrl(path), { headers: bunnyHeaders() });
  await res.body?.cancel();
  return res.ok;
}

export async function put(path: string, body: unknown): Promise<void> {
  if (s.transport === "fs") {
    const file = fsPath(path);
    await Deno.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(file, JSON.stringify(body, null, 2));
    return;
  }
  const res = await fetch(bunnyUrl(path), {
    method: "PUT",
    headers: bunnyHeaders(),
    body: JSON.stringify(body),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`bunny storage PUT ${path} -> ${res.status}`);
}

export async function get<T = unknown>(path: string): Promise<T | null> {
  if (s.transport === "fs") {
    try {
      return JSON.parse(await Deno.readTextFile(fsPath(path))) as T;
    } catch {
      return null;
    }
  }
  const res = await fetch(bunnyUrl(path), { headers: bunnyHeaders() });
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return await res.json() as T;
}

export async function del(path: string): Promise<void> {
  if (s.transport === "fs") {
    try {
      await Deno.remove(fsPath(path));
    } catch { /* already gone */ }
    return;
  }
  const res = await fetch(bunnyUrl(path), { method: "DELETE", headers: bunnyHeaders() });
  await res.body?.cancel();
}

// List object file names (not sub-dirs) under a prefix. Bunny returns a JSON
// directory listing for a path ending in "/"; fs reads the directory.
export async function list(prefix: string): Promise<string[]> {
  if (s.transport === "fs") {
    try {
      return [...Deno.readDirSync(fsPath(prefix))].filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }
  const res = await fetch(bunnyUrl(prefix.endsWith("/") ? prefix : prefix + "/"), {
    headers: bunnyHeaders(),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return [];
  }
  const items = await res.json() as Array<{ ObjectName: string; IsDirectory: boolean }>;
  return items.filter((i) => !i.IsDirectory).map((i) => i.ObjectName);
}
