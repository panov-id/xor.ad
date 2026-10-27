// sosed's theme on <html> (owner 2026-10-26): four themes, sea, plum, white and black, each to pick for good, and two that
// follow the device's own light or dark (prefers-color-scheme), never the clock: «colour» (sea / plum, the default) and
// «classic» (white / black). The choice is kept on this device under the web's key `theme:sosed` (web/src/theme.ts); an
// id an older build kept there reads as the nearest new one and is written back once. Free of React, so node:test runs it.
export const THEMES = ["sea", "plum", "white", "black"] as const;
export type ThemeId = (typeof THEMES)[number];
export const FOLLOWS = { colour: ["sea", "plum"], classic: ["white", "black"] } as const satisfies Record<string, readonly [ThemeId, ThemeId]>;
export type Choice = ThemeId | keyof typeof FOLLOWS;
export const DEFAULT_CHOICE: Choice = "colour";

export const STORAGE_KEY = "theme:sosed";
/** Ids older builds kept (the web's light / dark / auto, the old shell's Dusk) and what each is now. */
export const OLD_IDS: Record<string, Choice> = { light: "white", dark: "black", dusk: "plum", auto: "colour" };

const known = (v: string): v is Choice => (THEMES as readonly string[]).includes(v) || Object.hasOwn(FOLLOWS, v);   // own keys only: «toString» in the storage is not a theme

export function readChoice(storage: Pick<Storage, "getItem"> | null = safeStorage()): Choice {
  let value: string | null = null;
  try { value = storage?.getItem(STORAGE_KEY) ?? null; } catch { value = null; }
  if (!value) return DEFAULT_CHOICE;
  if (known(value)) return value;
  return Object.hasOwn(OLD_IDS, value) ? OLD_IDS[value] : DEFAULT_CHOICE;
}

export function saveChoice(choice: Choice, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (choice === DEFAULT_CHOICE) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, choice);
  } catch { /* kept for this page only */ }
}

/** `dark`: the device says it is in dark mode. */
export function resolveTheme(choice: Choice, dark: boolean): ThemeId {
  if (Object.hasOwn(FOLLOWS, choice)) return FOLLOWS[choice as keyof typeof FOLLOWS][dark ? 1 : 0];
  return choice as ThemeId;
}

export function deviceIsDark(): boolean {
  try { return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

export function applyTheme(doc: Document = document, storage = safeStorage(), dark = deviceIsDark()): ThemeId {
  let kept: string | null = null;
  try { kept = storage?.getItem(STORAGE_KEY) ?? null; } catch { kept = null; }
  const choice = readChoice(storage);
  if (kept && !known(kept)) saveChoice(choice, storage);
  const id = resolveTheme(choice, dark);
  doc.documentElement.dataset.theme = id;
  doc.documentElement.dataset.themeChoice = choice;
  return id;
}

/** Turns the theme when the device switches between light and dark; returns the unsubscribe. */
export function followDevice(apply: () => void = () => void applyTheme()): () => void {
  try {
    const q = matchMedia("(prefers-color-scheme: dark)");
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  } catch { return () => {}; }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
