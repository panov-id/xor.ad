// The browser's disk for the record this device keeps (depth/core/enroll.ts Record_) and for the reload
// grace's key (depth/core/grace.ts KeyStore): one IndexedDB, the scheme the web face has always had, shared
// by the web and the app shell so that an identity made by either opens in the other:
//
//   database  "xor-vault", version 2
//   store     "identity"  keyPath "id"   the record, key "me"   (CryptoKeys stored as they are: structured clone)
//   store     "grace"     out-of-line    {key: G, at} by the grace row's id   (version 2 added it, 14.10.2026)
//
// This is the DOM's: depth/core stays free of it (Deno and Node run the core), and a face's own folder cannot
// be imported by the other face. Moved out of web/src/vault.ts on 17.10.2026; the scheme and every name are
// the same — changing one is a migration of both faces' disks.
import type { KeyStore } from "../core/grace.ts";
import type { Record_ } from "../core/enroll.ts";

export const DB = "xor-vault";
export const DB_VERSION = 2;
export const STORE = "identity";
export const GRACE_STORE = "grace";

export function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GRACE_STORE)) db.createObjectStore(GRACE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
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
