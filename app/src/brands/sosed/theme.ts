// sosed's theme on <html> (owner 2026-10-26: four themes, white, sea, plum and black, and «auto»: white by day, black by
// night). The choice is kept on this device under the web's key `theme:sosed` (web/src/theme.ts), so a choice made
// there carries over; the web's old ids read as the nearest new one. Free of React, so node:test runs it.
export const THEMES = ["white", "sea", "plum", "black"] as const;
export type ThemeId = (typeof THEMES)[number];
export type Choice = ThemeId | "auto";

export const STORAGE_KEY = "theme:sosed";
/** The web's and the old shell's ids (light, dark, Dusk) and what each is now (NEWDESIGN_PLAN §3.4). */
export const OLD_IDS: Record<string, Choice> = { light: "white", dark: "black", dusk: "plum", auto: "auto" };

export function readChoice(storage: Pick<Storage, "getItem"> | null = safeStorage()): Choice {
  let value: string | null = null;
  try { value = storage?.getItem(STORAGE_KEY) ?? null; } catch { value = null; }
  if (!value) return "auto";
  if ((THEMES as readonly string[]).includes(value)) return value as ThemeId;
  return OLD_IDS[value] ?? "auto";
}

export function saveChoice(choice: Choice, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (choice === "auto") storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, choice);
  } catch { /* kept for this page only */ }
}

/** Night is 21–5 on the device's clock, as the web's sky (web/src/ui/phase.ts). */
export function resolveTheme(choice: Choice, hour: number): ThemeId {
  if (choice !== "auto") return choice;
  return hour >= 5 && hour < 21 ? "white" : "black";
}

export function applyTheme(doc: Document = document, storage = safeStorage(), now = new Date()): ThemeId {
  const choice = readChoice(storage);
  const id = resolveTheme(choice, now.getHours());
  doc.documentElement.dataset.theme = id;
  doc.documentElement.dataset.themeChoice = choice;
  return id;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
