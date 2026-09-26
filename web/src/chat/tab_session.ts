// The identity for as long as the tab lives — what W3 has instead of the
// unlock screen (W1c builds that on the vault: the long key sealed under the
// PIN and the node's share). Here the keys are kept as the non-extractable
// CryptoKey objects they are, in IndexedDB, under a random id that lives in
// sessionStorage: a new tab has no id and finds nothing, a reload of this tab
// finds its own record. Nothing here is sealed — said plainly, in the file's
// name and in the report: it is the reload of an e2e run, not a place to keep
// an identity, and it goes when the vault keeps the wrap pair (W1c, quorum
// 2026-09-26). The store is separate from the vault's (xor-vault), so the two
// do not read each other's rows.

import { Client } from "../../../depth/core/client.ts";
import { API_KEY, NODE_BASE } from "../config.ts";

const DB = "xor-tab";
const STORE = "session";
const TAB_KEY = "xor-tab-id";

export interface TabRecord {
  id: string;
  identityId: string;
  sessionId: string;
  longSpki: string;
  // Non-extractable signing key of the long key (HeldKey.signing()).
  longKey: CryptoKey;
  wrapPrivate: CryptoKey;
  wrapPublicSpki: string;
  deviceSalt: Uint8Array | null;
  wrappedLongKey: Uint8Array | null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function tabId(create: boolean): string | null {
  let id = sessionStorage.getItem(TAB_KEY);
  if (!id && create) {
    id = crypto.randomUUID();
    sessionStorage.setItem(TAB_KEY, id);
  }
  return id;
}

// After registration: what seat() needs to sign and to open wraps again.
export async function keepForTab(client: Client): Promise<{ longKey: CryptoKey }> {
  const held = client.held;
  if (!held) throw new Error("the client holds no long key to keep");
  const longKey = await held.signing();
  if (!client.wrapPrivate || !client.wrapPublicSpki) throw new Error("the client has no wrap pair to keep");
  const record: TabRecord = {
    id: tabId(true)!,
    identityId: client.identityId,
    sessionId: client.sessionId,
    longSpki: client.longSpki,
    longKey,
    wrapPrivate: client.wrapPrivate,
    wrapPublicSpki: client.wrapPublicSpki,
    deviceSalt: client.deviceSalt,
    wrappedLongKey: client.wrappedLongKey,
  };
  await tx("readwrite", (s) => s.put(record));
  return { longKey };
}

// On load: the tab's record, seated into a fresh client; null when this tab
// registered nothing.
export async function restoreForTab(): Promise<{ client: Client; longKey: CryptoKey } | null> {
  const id = tabId(false);
  if (!id) return null;
  const record = await tx("readonly", (s) => s.get(id) as IDBRequest<TabRecord | undefined>).catch(() => undefined);
  if (!record) return null;
  const client = new Client(NODE_BASE, API_KEY);
  client.seat({
    identityId: record.identityId,
    sessionId: record.sessionId,
    sessionKey: { privateKey: record.longKey, publicSpki: record.longSpki },
    longKey: record.longKey,
    longSpki: record.longSpki,
    wrapPrivate: record.wrapPrivate,
    wrapPublicSpki: record.wrapPublicSpki,
    deviceSalt: record.deviceSalt ?? undefined,
    wrappedLongKey: record.wrappedLongKey ?? undefined,
  });
  return { client, longKey: record.longKey };
}

export async function forgetTab(): Promise<void> {
  const id = tabId(false);
  if (id) await tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>).catch(() => undefined);
  sessionStorage.removeItem(TAB_KEY);
}
