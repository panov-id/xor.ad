// The reload grace (owner, 14.10.2026: «обновил страницу — пин не спрашивать;
// пин спрашивать после 30 секунд простоя»): a page reloaded within GRACE_MS of
// the person's last input opens without the PIN; after that, or in a new tab,
// the PIN is asked as before (vault.ts unlockAfterReload).
//
// What the vault model says (vault.ts, its header): the storage key is
// HKDF(local ‖ share), and the disk alone cannot make it — local comes from
// the PIN, share from the node against the PIN's proof. A grace that skips the
// PIN must therefore keep those 64 bytes somewhere across the reload; there is
// no way around that inside the model (the node's share route takes nothing
// but the proof: relay routes/identity.ts /vault/share). So the grace keeps
// them for as long as the input is fresh, split in two so that neither half
// is the secret on its own:
//
//   sessionStorage  xor-grace    = {id, c}   c = AES-GCM(local ‖ share) under G
//   IndexedDB       grace[id]    = {key: G, at}   G born non-extractable
//   sessionStorage  xor-grace-at = <ms>      the last input (idle.ts → Keeper)
//   sessionStorage  xor-grace-go = 1         written on pagehide, spent by take
//
// Where the halves live, and for how long (security review, 15.10.2026):
//   · on disk — only while the input is fresh and the tab is in view: the
//     Keeper drops G and the ciphertext GRACE_MS after the last input, and
//     the moment the tab is hidden or frozen (App.tsx visibilitychange,
//     freeze — a timer may never fire in a discarded mobile tab), and arms
//     them again from its own memory on the next input. What remains: a tab
//     that crashes, is killed or loses power inside the window, in view,
//     leaves its row G on the disk until the next start of the page prunes
//     rows older than the window (sweep), and its ciphertext in the tab's
//     sessionStorage, which the browser's session restore may write to disk
//     — a copy of the disk taken then, with both, yields the halves without
//     the PIN. That is the whole of the price;
//   · in the page's memory — in the Keeper, as the core already holds them
//     (depth/core/client.ts #pinLocal, #share) for its own lock.
// Why one tab only: sessionStorage is the tab's own and dies with it; another
// tab sees neither the ciphertext nor the stamp. «Duplicate tab» copies
// sessionStorage, so the ciphertext travels — but xor-grace-go does not: it is
// written on pagehide, which a reload fires and a duplicate does not, and take
// spends it. Take is one shot and atomic (one readwrite transaction gets and
// deletes G): of two documents with the same ciphertext at most one opens.
// The in-page idle lock (App.tsx watchIdle), «forget» and the closing of the
// identity release the Keeper, which wipes its memory and clears both stores
// for every tab (G lives in the shared store).
//
// Not stored: the PIN, the long key, the vault key. Not localStorage.
// The stores and the clock are parameters so that node:test exercises the
// rules without a browser (grace.test.ts); vault.ts binds the real ones.

import { base64url } from "../../depth/core/sign.ts";

export const GRACE_MS = 30_000;
export const TAB_KEY = "xor-grace";
export const STAMP_KEY = "xor-grace-at";
export const GO_KEY = "xor-grace-go";
// How often a live tab refreshes its row's `at` in the shared store, so the
// sweep tells a tab in use from one that died: within the window plus this.
export const REFRESH_MS = 10_000;

export interface TabStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface KeyStore {
  put(id: string, row: { key: CryptoKey; at: number }): Promise<void>;
  // The row, and its deletion, in one transaction: a second taker finds nothing.
  take(id: string): Promise<{ key: CryptoKey; at: number } | undefined>;
  // Every row with `at` before the moment given: tabs that died mid-window.
  prune(before: number): Promise<void>;
  clear(): Promise<void>;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface GraceDeps {
  tab: TabStore;
  keys: KeyStore;
  now?: () => number;
  graceMs?: number;
}

const GCM = { name: "AES-GCM", length: 256 };

// iv(12) ‖ AES-GCM — the shape of depth/core/lock.ts seal()/open(), written
// again here: lock.ts has parameter properties, which node:test's strip-only
// TypeScript refuses to load (run-web-unit-tests.sh).
async function seal(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv, 0);
  out.set(sealed, iv.length);
  return out;
}
async function unseal(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < 12 + 16) throw new Error("the sealed blob is too short");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(0, 12) }, key, sealed.slice(12) as BufferSource));
}

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// The last input, as idle.ts sees it: the grace counts from here.
export function stamp(deps: Pick<GraceDeps, "tab" | "now">): void {
  deps.tab.setItem(STAMP_KEY, String((deps.now ?? Date.now)()));
}

// The document is leaving (pagehide): a reload may take the grace. A
// duplicate of the tab, made while this document lives, copies no such mark.
export function leaving(deps: Pick<GraceDeps, "tab">): void {
  if (deps.tab.getItem(TAB_KEY)) deps.tab.setItem(GO_KEY, "1");
}

// The document came back from the back/forward cache (pageshow, persisted):
// the mark pagehide left is spent by no reload, so it goes — a later
// duplicate of the tab must not inherit it.
export function returning(deps: Pick<GraceDeps, "tab">): void {
  deps.tab.removeItem(GO_KEY);
}

// Arms the grace with both halves of the vault key: a fresh G in the key
// store, the halves sealed under it in the tab. Answers G and its id, for the
// Keeper to refresh the row. The caller's copies stay the caller's.
export async function arm(local: Uint8Array, share: Uint8Array, deps: GraceDeps): Promise<{ id: string; key: CryptoKey }> {
  if (local.length !== 32 || share.length !== 32) throw new Error("the grace takes two 32-byte halves");
  const ikm = new Uint8Array(64);
  ikm.set(local, 0);
  ikm.set(share, 32);
  try {
    const key = await crypto.subtle.generateKey(GCM, false, ["encrypt", "decrypt"]);
    const id = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const c = base64url(await seal(key, ikm));
    await deps.keys.put(id, { key, at: (deps.now ?? Date.now)() });
    deps.tab.setItem(TAB_KEY, JSON.stringify({ id, c }));
    stamp(deps);
    return { id, key };
  } finally {
    ikm.fill(0);
  }
}

// Rows of tabs that died mid-window: older than the window plus a refresh.
export async function sweep(deps: GraceDeps): Promise<void> {
  const graceMs = deps.graceMs ?? GRACE_MS;
  await deps.keys.prune((deps.now ?? Date.now)() - graceMs - REFRESH_MS).catch(() => undefined);
}

// The halves back, once, if this tab was armed, its document left by a
// reload, and its last input is within the grace; otherwise null, and
// whatever was there is gone. The bytes are the caller's to wipe.
export async function take(deps: GraceDeps): Promise<{ local: Uint8Array; share: Uint8Array } | null> {
  const raw = deps.tab.getItem(TAB_KEY);
  const at = Number(deps.tab.getItem(STAMP_KEY) ?? "");
  const went = deps.tab.getItem(GO_KEY) === "1";
  deps.tab.removeItem(TAB_KEY);
  deps.tab.removeItem(GO_KEY);
  if (!raw) return null;
  let parsed: { id?: unknown; c?: unknown };
  try { parsed = JSON.parse(raw) as { id?: unknown; c?: unknown }; } catch { return null; }
  if (typeof parsed.id !== "string" || typeof parsed.c !== "string") return null;
  // G is spent whether or not the rest holds: a refused take leaves nothing.
  const row = await deps.keys.take(parsed.id).catch(() => undefined);
  if (!row || !went) return null;
  const graceMs = deps.graceMs ?? GRACE_MS;
  const now = (deps.now ?? Date.now)();
  // A stamp missing, in the future, or older than the grace: no grace.
  if (graceMs <= 0 || !Number.isFinite(at) || now - at < 0 || now - at > graceMs) return null;
  let ikm: Uint8Array;
  try {
    ikm = await unseal(row.key, fromBase64url(parsed.c));
  } catch {
    return null;
  }
  if (ikm.length !== 64) { ikm.fill(0); return null; }
  return { local: ikm.slice(0, 32), share: ikm.slice(32) };
}

// Everything, both sides, every tab: after the lock, «forget» and the closing of the identity.
export async function drop(deps: Pick<GraceDeps, "tab" | "keys">): Promise<void> {
  deps.tab.removeItem(TAB_KEY);
  deps.tab.removeItem(STAMP_KEY);
  deps.tab.removeItem(GO_KEY);
  await deps.keys.clear().catch(() => undefined);
}

// The grace's life inside one document: holds the halves in memory, keeps
// them on the disk only while the input is fresh — GRACE_MS after the last
// touch the stores are cleared, and the next touch arms them again from
// memory — refreshes the row's `at` every REFRESH_MS of use, and on release
// wipes the memory and the stores.
export class Keeper {
  #halves: { local: Uint8Array; share: Uint8Array } | null = null;
  #armed: { id: string; key: CryptoKey } | null = null;
  #timer: unknown = null;
  #refreshed = 0;
  #busy: Promise<void> = Promise.resolve();
  readonly deps: GraceDeps;
  readonly clock: Clock;

  // No parameter properties: node:test's strip-only TypeScript (run-web-unit-tests.sh).
  constructor(deps: GraceDeps, clock: Clock = realClock) {
    this.deps = deps;
    this.clock = clock;
  }

  get armed(): boolean {
    return this.#armed !== null;
  }

  // When whatever is queued has run (a test's sync point).
  settled(): Promise<void> {
    return this.#busy;
  }

  // The halves just proved (a PIN, a registration): copied, armed, the clock started.
  hold(local: Uint8Array, share: Uint8Array): Promise<void> {
    this.#wipe();
    this.#halves = { local: local.slice(), share: share.slice() };
    return this.#queue(() => this.#arm());
  }

  // An input: the stamp, the row's age, the clock over; armed again if the
  // window had run out and the halves are still held.
  touch(): Promise<void> {
    return this.#queue(async () => {
      if (!this.#halves) return;
      const now = this.clock.now();
      if (!this.#armed) return await this.#arm();
      stamp({ tab: this.deps.tab, now: () => now });
      if (now - this.#refreshed >= REFRESH_MS) {
        this.#refreshed = now;
        await this.deps.keys.put(this.#armed.id, { key: this.#armed.key, at: now }).catch(() => undefined);
      }
      this.#restart();
    });
  }

  // The window ran out without input: nothing on the disk, the halves kept.
  suspend(): Promise<void> {
    return this.#queue(async () => {
      this.#stop();
      if (!this.#armed) return;
      this.#armed = null;
      await drop(this.deps);
    });
  }

  // The lock, «forget», the closing of the identity: memory and stores.
  release(): Promise<void> {
    return this.#queue(async () => {
      this.#stop();
      this.#wipe();
      this.#armed = null;
      await drop(this.deps);
    });
  }

  // One thing at a time: an arm and a suspend do not race on the stores.
  #queue(op: () => Promise<void>): Promise<void> {
    const next = this.#busy.then(op, op);
    this.#busy = next.catch(() => undefined);
    return next;
  }

  async #arm(): Promise<void> {
    if (!this.#halves) return;
    const graceMs = this.deps.graceMs ?? GRACE_MS;
    if (graceMs <= 0) return;
    this.#armed = await arm(this.#halves.local, this.#halves.share, this.deps);
    this.#refreshed = this.clock.now();
    this.#restart();
  }

  #restart(): void {
    this.#stop();
    const graceMs = this.deps.graceMs ?? GRACE_MS;
    this.#timer = this.clock.setTimeout(() => { this.#timer = null; void this.suspend(); }, graceMs);
  }

  #stop(): void {
    if (this.#timer !== null) this.clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #wipe(): void {
    this.#halves?.local.fill(0);
    this.#halves?.share.fill(0);
    this.#halves = null;
  }
}
