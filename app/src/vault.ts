// The keys on this device, as the web keeps them (web/src/vault.ts; chat spec §8.2): the record in IndexedDB
// "xor-vault" with the private halves sealed under the PIN-and-node storage key, the reload grace in this tab.
// The scheme, the names and the way the record opens are the SDK's and the platform's, imported, not copied:
// depth/core/enroll.ts (the record), depth/core/unlock.ts (opening it), depth/core/grace.ts (the grace),
// depth/web-platform/vault_store.ts (the IndexedDB), vault_keep.ts (the grace bound to this tab) — so an
// identity made by the web opens here and one made here opens in the web.
//
// The PIN's change, the raise by the paper code and the reissue keep through this same keep.
import { idleMsOf } from "@platform/idle.ts";
import { createArrive } from "@platform/arrive_keep.ts";
import { createKeep } from "@platform/vault_keep.ts";
import type { Client } from "@sdk/client.ts";
import { GRACE_MS } from "@sdk/grace.ts";
import { API_KEY, NODE_BASE } from "./config";

export { watchIdle } from "@platform/idle.ts";
export { watchLifecycle } from "@platform/vault_keep.ts";
export type { Record_ } from "@sdk/enroll.ts";

// The stand's build (VITE_STAND=1) takes the grace's and the idle lock's waits from sessionStorage
// ("xor-grace-ms", "xor-idle-ms") so a test does not sit through 30 s and five minutes; a real page never reads them.
const stand = import.meta.env.VITE_STAND === "1";
function graceMsOf(): number {
  if (!stand) return GRACE_MS;
  const given = Number(sessionStorage.getItem("xor-grace-ms") ?? "");
  return Number.isFinite(given) && given >= 0 ? given : GRACE_MS;
}
/** The idle lock's wait: five minutes, or the stand's. */
export const idleMs = (): number => idleMsOf(stand);

const keep = createKeep({ node: { base: NODE_BASE, key: API_KEY }, graceMs: graceMsOf });
export const {
  readRecord, registerAndKeep, forget, stampGrace, dropGrace, leavingWithGrace, returningWithGrace, hiddenWithGrace, unlockAfterReload, unlockByGrace,
  changePinAndReseal,
} = keep;
// The paper-code raise (screens/Gate.tsx Restore) keeps through this same keep, so its grace is the one lock and dropGrace clear.
export const { putRecord, armGrace } = keep;

// A move in (depth/web-platform/arrive_keep.ts, as the web's vault.ts): the claim, then the first PIN seals the record here.
export type { Arriving } from "@platform/arrive_keep.ts";
export const { claimArrival, keepArrived } = createArrive({ node: { base: NODE_BASE, key: API_KEY }, putRecord: keep.putRecord, armGrace: keep.armGrace });

// After a reissue of the paper code (screens/me/Reissue.tsx): the long key under the new code, as the core now holds
// it (recovery.ts reissue → holdWrappedLongKey), into the record — a later reissue opens it from here after a reload.
// The web's own (web/src/vault.ts rememberWrappedLongKey), the same three lines.
export async function rememberWrappedLongKey(client: Client): Promise<void> {
  const record = await keep.readRecord();
  const wrapped = client.wrappedLongKey;
  if (!record || !wrapped) return;
  await keep.putRecord({ ...record, wrappedLongKey: wrapped, savedAt: Date.now() });
}
