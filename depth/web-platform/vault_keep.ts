// The reload grace (depth/core/grace.ts) bound to the page's own stores, and the two ways of opening the
// record after a reload — by the PIN, and by the grace — for the faces with a disk (web, the app shell).
// A face calls `createKeep` once with where its node is and how long its grace lasts; what it gets back is
// the same set of calls the web's vault.ts has always exported.
//
//   sessionStorage  xor-grace, xor-grace-at, xor-grace-go   the tab's (grace.ts)
//   IndexedDB       grace[id]                                the shared key store (vault_store.ts)
//
// Moved out of web/src/vault.ts on 17.10.2026 (that file keeps what is the web's own: registering on this
// disk, a raise by the paper code, a move); the PIN's change followed on 18.10.2026. Behaviour is unchanged.
import { type Answer, Client } from "../core/client.ts";
import { open as unseal, seal, vaultKey } from "../core/lock.ts";
import { derivePin } from "../core/pin.ts";
import { fromBase64url } from "../core/seal.ts";
import { base64url } from "../core/sign.ts";
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

  // Changing the PIN re-seals the vault (W4, 2026-09-26): the vault key is
  // HKDF(local ‖ share), and POST /vault/pin gives the node a new auth and a
  // new share — after it, the old seal opens with nothing this device can
  // derive. So, in order: the old halves are proved and the seals opened
  // (POST /vault/share with the old proof, signed by the seated session), the
  // PIN is changed through the core, the new share is fetched with the new
  // proof, and both keys are sealed again. Between the change and the new
  // seal the old blobs stay on the disk; a crash there is the paper code's
  // case, as it is for a lost device. The core's counter answers a wrong old
  // PIN before anything is opened.
  async function changePinAndReseal(client: Client, current: string, next: string): Promise<Answer<{ error?: { code?: string; attempts_left?: number } }>> {
    const record = await readRecord();
    if (!record) throw new Error("this device keeps no identity to re-seal");
    const before = await derivePin(current, record.deviceSalt);
    const oldShare = await client.request<{ share?: string; error?: { code?: string; attempts_left?: number } }>(
      "POST", "/vault/share", { auth: base64url(before.auth) },
    );
    if (oldShare.status !== 200 || !oldShare.body?.share) {
      // A refused old PIN: what was derived from it goes now, not at the next collection.
      before.auth.fill(0);
      before.local.fill(0);
      return oldShare as Answer<{ error?: { code?: string; attempts_left?: number } }>;
    }
    const oldKey = await vaultKey(before.local, fromBase64url(oldShare.body.share));
    const longPkcs8 = await unseal(oldKey, record.sealedLong);
    const wrapPkcs8 = await unseal(oldKey, record.sealedWrap);
    // A device raised by the paper code keeps its session key under the same
    // seal; left under the old key it locks the vault after the next reload.
    const sessionPkcs8 = record.sealedSession ? await unseal(oldKey, record.sealedSession) : null;
    before.auth.fill(0);
    before.local.fill(0);
    try {
      const changed = await client.changePin(current, next);
      if (changed.status !== 200) return changed;
      const after = await derivePin(next, record.deviceSalt);
      const newShare = await client.request<{ share?: string }>("POST", "/vault/share", { auth: base64url(after.auth) });
      if (newShare.status !== 200 || !newShare.body?.share) throw new Error(`the node did not hand back its new share: ${newShare.status}`);
      const newKey = await vaultKey(after.local, fromBase64url(newShare.body.share));
      const resealed: Record_ = {
        ...record,
        sealedLong: await seal(newKey, longPkcs8),
        sealedWrap: await seal(newKey, wrapPkcs8),
        ...(sessionPkcs8 ? { sealedSession: await seal(newKey, sessionPkcs8) } : {}),
        savedAt: Date.now(),
      };
      after.auth.fill(0);
      await putRecord(resealed);
      // The tab's grace held the old halves; they open nothing now.
      await dropGrace();
      await armGrace(after.local, fromBase64url(newShare.body.share));
      after.local.fill(0);
      return changed;
    } finally {
      longPkcs8.fill(0);
      wrapPkcs8.fill(0);
      sessionPkcs8?.fill(0);
    }
  }

  return {
    changePinAndReseal,
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
