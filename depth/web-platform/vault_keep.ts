// The reload grace (depth/core/grace.ts) bound to the page's own stores, and the two ways of opening the
// record after a reload — by the PIN, and by the grace — for the faces with a disk (web, the app shell).
// A face calls `createKeep` once with where its node is and how long its grace lasts; what it gets back is
// the same set of calls the web's vault.ts has always exported.
//
//   sessionStorage  xor-grace, xor-grace-at, xor-grace-go   the tab's (grace.ts)
//   IndexedDB       grace[id]                                the shared key store (vault_store.ts)
//
// Moved out of web/src/vault.ts on 17.10.2026 (that file keeps what is the web's own: registering on this
// disk, the PIN's change, a raise by the paper code, a move). Behaviour is unchanged.
import { Client } from "../core/client.ts";
import { type Record_, registerIdentity } from "../core/enroll.ts";
import * as grace from "../core/grace.ts";
import { type NodeAt, type Opened, openWith, unlockWithPin } from "../core/unlock.ts";
import { deleteRecord, graceKeys, putRecord, readRecord } from "./vault_store.ts";

export interface KeepConfig {
  node: NodeAt;
  /** The grace's wait: the real one, or (the stand's build only) a given one. */
  graceMs: () => number;
}

export function createKeep(config: KeepConfig) {
  const graceDeps = (): grace.GraceDeps => ({ tab: sessionStorage, keys: graceKeys, graceMs: config.graceMs() });
  // One Keeper for the document: the halves in memory, on the disk only while
  // the input is fresh (grace.ts Keeper). A storage that refuses (private mode,
  // quota) costs the grace, never the unlock.
  let keeper: grace.Keeper | null = null;
  const keeperOf = (): grace.Keeper => (keeper ??= new grace.Keeper(graceDeps()));
  async function armGrace(local: Uint8Array, share: Uint8Array): Promise<void> {
    try { await keeperOf().hold(local, share); } catch { /* no grace, the PIN as before */ }
  }
  // An input (idle.ts): the stamp, the row's age, the clock over; armed again after a quiet spell.
  const stampGrace = (): void => { void keeperOf().touch().catch(() => undefined); };
  // The lock, «forget», the closing of the identity: memory and both stores, every tab.
  const dropGrace = (): Promise<void> => keeperOf().release().catch(() => undefined);
  // The document is leaving: a reload may take the grace, a duplicate may not (grace.ts leaving).
  const leavingWithGrace = (): void => { try { grace.leaving({ tab: sessionStorage }); } catch { /* storage blocked */ } };
  // Back from the back/forward cache: the leave mark goes (grace.ts returning).
  const returningWithGrace = (): void => { try { grace.returning({ tab: sessionStorage }); } catch { /* storage blocked */ } };
  // The tab hidden or frozen: nothing on the disk until the next input in view (grace.ts Keeper.suspend).
  const hiddenWithGrace = (): void => { void keeperOf().suspend().catch(() => undefined); };

  // Forgetting the identity drops the grace with it: nothing of the vault key stays in any tab.
  const forget = async (): Promise<undefined> => {
    await dropGrace();
    return await deleteRecord();
  };

  // A registered client and the record this device keeps of it. The paper code is the caller's to show and to
  // ask back; it is not written anywhere here. The registration itself is the core's (enroll.ts
  // registerIdentity); keeping it on this disk and arming the reload grace are the platform's.
  async function registerAndKeep(
    who: { name: string; age: number },
    secrets: { pin: string; paperCode: string },
  ): Promise<{ client: Client; record: Record_; share: Uint8Array }> {
    const { client, record, share, local } = await registerIdentity(new Client(config.node.base, config.node.key), who, secrets);
    await putRecord(record);
    await armGrace(local, share);
    return { client, record, share };
  }

  // After a reload: the PIN, the unlock key's one signed call for the share, the seals opened, the grace armed.
  const unlockAfterReload = (record: Record_, pin: string) => unlockWithPin(record, pin, config.node, armGrace);

  // A reload within the grace (grace.ts; owner 14.10.2026): the halves the tab kept open the seals without
  // the PIN and without a call to the node — no attempt is spent, none is reset. null when there is no grace:
  // the screen asks the PIN as before.
  async function unlockByGrace(record: Record_): Promise<Opened | null> {
    const deps = graceDeps();
    // Rows of tabs that died mid-window go first (security review 15.10.2026).
    await grace.sweep(deps);
    const halves = await grace.take(deps).catch(() => null);
    // No grace: the stamp goes too; the shared store is other tabs' and stays.
    if (!halves) { deps.tab.removeItem(grace.STAMP_KEY); return null; }
    try {
      return await openWith(record, halves.local, halves.share, config.node, armGrace);
    } catch {
      // A seal that does not open with what the tab kept (a PIN changed in
      // another tab re-sealed the record): the PIN, not an error — and nothing
      // of the grace left behind.
      await dropGrace();
      return null;
    } finally {
      halves.local.fill(0);
      halves.share.fill(0);
    }
  }

  return {
    readRecord, putRecord, registerAndKeep, forget, armGrace, stampGrace, dropGrace, leavingWithGrace, returningWithGrace, hiddenWithGrace,
    unlockAfterReload, unlockByGrace,
  };
}

/**
 * The page's lifecycle, for the grace (web App.tsx, the app's App.tsx): the document leaving (a reload, a
 * same-tab address) leaves the leave mark — a duplicate of the tab gets none, and so no grace; hidden or
 * frozen (a mobile tab may be discarded with its timers) the grace leaves the disk at once; back from the
 * bfcache the leave mark goes. Chromium fires visibilitychange → hidden on a reload too, right before
 * pagehide, in the same task (Page Lifecycle): so the suspend waits a task, and pagehide — the reload —
 * calls it off; a tab merely switched away from has no pagehide, and its suspend runs at once. Returns the stop.
 */
export function watchLifecycle(keep: { hiddenWithGrace(): void; leavingWithGrace(): void; returningWithGrace(): void }): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;
  const onVisibility = () => {
    if (document.visibilityState !== "hidden") return;
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => { pending = null; keep.hiddenWithGrace(); }, 0);
  };
  const onHide = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
    keep.leavingWithGrace();
  };
  const onShow = (e: Event) => { if ((e as PageTransitionEvent).persisted) keep.returningWithGrace(); };
  addEventListener("pagehide", onHide);
  addEventListener("pageshow", onShow);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("freeze", keep.hiddenWithGrace);
  return () => {
    removeEventListener("pagehide", onHide);
    removeEventListener("pageshow", onShow);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("freeze", keep.hiddenWithGrace);
  };
}
