// The ad screens of docs/newdesign4 (261, 262, 263, 267, 271, 272): built, behind one flag, not visible to people (owner 02.11.2026).
// The flag is a build-time env, off unless it is exactly "1"; the node gives no ad data, so a slot shows the archive's own frame only.
// Pure functions: the slots' set and the flag's reading, tested in ads.test.ts.

export type AdSpec = { id: string; title: string; place: string; size: string; height: string };

/** The archive's slots by where they stand: its annotation (place), its size, and the box's height (the archive draws 320×100 and 320×250). */
export const AD_SLOTS = {
  "quiet-feed": { place: "quiet feed", size: "320×100", height: "var(--ad-slot-short)" },       // 262, under «Quiet around here»
  "under-liked": { place: "under Liked", size: "320×100", height: "var(--ad-slot-short)" },     // 263, under the liked list
  "talk-ended": { place: "talk ended", size: "320×250", height: "var(--ad-slot-tall)" },       // 267, a talk that faded
  "nothing-liked": { place: "nothing liked", size: "320×100", height: "var(--ad-slot-short)" }, // 271, the empty liked list
  "phrase-faded": { place: "phrase faded", size: "320×100", height: "var(--ad-slot-short)" },   // 272, one's own faded phrase
} as const;
export type AdSlotKey = keyof typeof AD_SLOTS;

/** 261: the sponsored tile stands as the third in the feed, as the archive draws it. */
export const NATIVE_AT = 2;

/** Off unless the build says exactly "1": a typo, "true", "0" or nothing all leave the ads out. */
export function adsOn(raw: unknown): boolean {
  return raw === "1";
}

/** What a slot's component takes: the whole spec with the flag on, nothing with it off (a component given nothing draws nothing). */
export function adSpec(slot: AdSlotKey, title: string, on: boolean): AdSpec | undefined {
  if (!on) return undefined;
  const s = AD_SLOTS[slot];
  return { id: s.place, title, place: s.place, size: s.size, height: s.height };
}

/** The feed's rows with a hole (null) where the sponsored tile goes; the rows unchanged with the flag off or with fewer than two. */
export function withAd<T>(rows: readonly T[], on: boolean): Array<T | null> {
  if (!on || rows.length < NATIVE_AT) return [...rows];
  return [...rows.slice(0, NATIVE_AT), null, ...rows.slice(NATIVE_AT)];
}
