// Tenant-scoped access to storage — the only door a route uses to reach tenant
// data. The prefix is decided here, from the subject, and never from anything
// the caller sent: that is the whole point, so "which tenant" cannot be argued
// about at the call site.
//
// A platform operator (brand null) gets an empty prefix — the pre-tenancy
// layout, which is exactly where objects written before the migration still are.

import { del, exists, get, list, listDetailed, put, type StorageEntry } from "./storage.ts";

export interface ScopedStorage {
  readonly brand: string | null;
  put(path: string, body: unknown): Promise<void>;
  get<T = unknown>(path: string): Promise<T | null>;
  exists(path: string): Promise<boolean>;
  del(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  listDetailed(prefix: string): Promise<StorageEntry[]>;
}

export function scopedForBrand(brand: string | null): ScopedStorage {
  const at = brand ? `tenants/${brand}/` : "";
  return {
    brand,
    put: (path, body) => put(at + path, body),
    get: <T>(path: string) => get<T>(at + path),
    exists: (path) => exists(at + path),
    del: (path) => del(at + path),
    list: (prefix) => list(at + prefix),
    listDetailed: (prefix) => listDetailed(at + prefix),
  };
}

export function scoped(subject: { brand: string | null }): ScopedStorage {
  return scopedForBrand(subject.brand);
}
