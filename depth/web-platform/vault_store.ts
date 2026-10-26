/// <reference lib="dom" />
// The browser's disk for the record this device keeps (depth/core/enroll.ts Record_) and for the reload
// grace's key (depth/core/grace.ts KeyStore): one IndexedDB, the scheme the web face has always had, shared
// by the web and the app shell so that an identity made by either opens in the other:
//
//   database  "xor-vault", version 3
//   store     "identity"  keyPath "id"   the record, key "me"   (CryptoKeys stored as they are: structured clone)
//   store     "grace"     out-of-line    {key: G, at} by the grace row's id   (version 2 added it, 14.10.2026)
//   store     "pairs"     out-of-line    a chat's ephemeral pair between consent and the chat's first open, wrapped
//                                        under the session's wrap key (seal.ts Ephemeral.generateKept), by
//                                        "<identity>|<match or chat>|<epoch>"   (version 3, 24.10.2026)
//
// This is the DOM's: depth/core stays free of it (Deno and Node run the core), and a face's own folder cannot
// be imported by the other face. Moved out of web/src/vault.ts on 17.10.2026; the scheme and every name are
// the same — changing one is a migration of both faces' disks.
import type { KeyStore } from "../core/grace.ts";
import type { Record_ } from "../core/enroll.ts";

export const DB = "xor-vault";
export const DB_VERSION = 3;
export const STORE = "identity";
export const GRACE_STORE = "grace";
export const PAIR_STORE = "pairs";

export function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GRACE_STORE)) db.createObjectStore(GRACE_STORE);
      if (!db.objectStoreNames.contains(PAIR_STORE)) db.createObjectStore(PAIR_STORE);
    };
    // A newer version opened in another tab: let it upgrade instead of hanging its open().
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

export function tx<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>, name = STORE): Promise<T> {
  return open().then((db) =>
    new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(name, mode).objectStore(name));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

export const readRecord = (): Promise<Record_ | undefined> => tx("readonly", (s) => s.get("me") as IDBRequest<Record_ | undefined>);
export const putRecord = async (record: Record_): Promise<void> => { await tx("readwrite", (s) => s.put(record)); };
export const deleteRecord = (): Promise<undefined> => tx("readwrite", (s) => s.delete("me") as IDBRequest<undefined>);

type GraceRow = { key: CryptoKey; at: number };

/** The grace's shared key store (grace.ts): G born non-extractable, kept here unsealed. */
export const graceKeys: KeyStore = {
  put: async (id, row) => { await tx("readwrite", (s) => s.put(row, id), GRACE_STORE); },
  // One readwrite transaction: the get and the delete inside it, so a second
  // taker of the same id — a duplicate tab, a tab reloaded twice — finds nothing.
  take: (id) => open().then((db) =>
    new Promise<GraceRow | undefined>((resolve, reject) => {
      const t = db.transaction(GRACE_STORE, "readwrite");
      const store = t.objectStore(GRACE_STORE);
      const got = store.get(id) as IDBRequest<GraceRow | undefined>;
      let row: GraceRow | undefined;
      got.onsuccess = () => { row = got.result; store.delete(id); };
      t.oncomplete = () => resolve(row);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  prune: (before) => open().then((db) =>
    new Promise<void>((resolve, reject) => {
      const t = db.transaction(GRACE_STORE, "readwrite");
      const walk = t.objectStore(GRACE_STORE).openCursor();
      walk.onsuccess = () => {
        const c = walk.result;
        if (!c) return;
        if ((c.value as GraceRow).at < before) c.delete();
        c.continue();
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  clear: async () => { await tx("readwrite", (s) => s.clear(), GRACE_STORE); },
};

/** A kept pair (chat/keys.ts): the box opens only with the session's wrap private half (after the PIN), so nothing in
 * this store is a usable key on its own (SEC-2). `at` is when it was kept: an old row is pruned. */
export type PairRow = { kept: string; spki: string; epoch: number; at: number };

export const pairKeys = {
  // One readwrite transaction: a second tab consenting to the same match finds the first one's row and uses it.
  getOrPut: (id: string, make: () => PairRow): Promise<PairRow> => open().then((db) =>
    new Promise<PairRow>((resolve, reject) => {
      const t = db.transaction(PAIR_STORE, "readwrite");
      const store = t.objectStore(PAIR_STORE);
      const got = store.get(id) as IDBRequest<PairRow | undefined>;
      let row: PairRow;
      got.onsuccess = () => { row = got.result ?? make(); if (!got.result) store.put(row, id); };
      t.oncomplete = () => resolve(row);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  get: (id: string): Promise<PairRow | undefined> => tx("readonly", (s) => s.get(id) as IDBRequest<PairRow | undefined>, PAIR_STORE),
  put: async (id: string, row: PairRow): Promise<void> => { await tx("readwrite", (s) => s.put(row, id), PAIR_STORE); },
  drop: async (id: string): Promise<void> => { await tx("readwrite", (s) => s.delete(id), PAIR_STORE); },
  prune: (before: number): Promise<void> => open().then((db) =>
    new Promise<void>((resolve, reject) => {
      const t = db.transaction(PAIR_STORE, "readwrite");
      const walk = t.objectStore(PAIR_STORE).openCursor();
      walk.onsuccess = () => {
        const c = walk.result;
        if (!c) return;
        if ((c.value as PairRow).at < before) c.delete();
        c.continue();
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  clear: async (): Promise<void> => { await tx("readwrite", (s) => s.clear(), PAIR_STORE); },
};
