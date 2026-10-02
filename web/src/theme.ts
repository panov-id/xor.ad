// The brand's theme on <html> (contract web/design/gen/themes.md): data-brand
// from the build (config.ts BRAND, passed in), data-theme from the person's
// choice kept on this device under `theme:<brand>`. themes.gen.css draws each
// [data-brand][data-theme] pair; themes.gen.ts lists them.
//
// "auto" (the default) is the brand's light theme by day and its night pair at
// night OF THE PLACE (ui/phase.ts, the feed's sky). A theme picked by hand is
// literal: it does not turn at night, even when its file names a night pair.
//
// Kept free of React and of import.meta.env so node:test can run it
// (theme.test.ts); the React side is ui/useTheme.ts.
import type { Phase } from "./ui/phase.ts";
import { THEME_BG, THEMES } from "./themes.gen.ts";

export const AUTO = "auto";
export type Choice = string; // "auto" or a theme id of the brand

export const storageKey = (brand: string) => `theme:${brand}`;

// A theme the brand has, night-only files included (a stored id may be one).
function known(brand: string, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(THEME_BG[brand] ?? {}, id);
}

// Storage may throw (private window, blocked site data): then it is "auto".
export function readChoice(brand: string, storage: Pick<Storage, "getItem"> | null = safeStorage()): Choice {
  let value: string | null = null;
  try {
    value = storage?.getItem(storageKey(brand)) ?? null;
  } catch {
    value = null;
  }
  return value && value !== AUTO && known(brand, value) ? value : AUTO;
}

export function saveChoice(brand: string, choice: Choice, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (choice === AUTO) storage?.removeItem(storageKey(brand));
    else storage?.setItem(storageKey(brand), choice);
  } catch {
    // Not kept across reloads; the page still shows it now.
  }
}

export function resolveTheme(brand: string, choice: Choice, phase: Phase): string {
  if (choice !== AUTO && known(brand, choice)) return choice;
  if (phase !== "night") return "light";
  const night = THEMES[brand]?.find((t) => t.id === "light")?.night;
  return night && known(brand, night) ? night : "light";
}

let phaseNow: Phase | null = null;

// Puts the resolved theme on <html> and the page colour into meta
// theme-color. The phase is remembered, so a choice applied later (the
// picker) resolves against the place's current phase.
export function applyTheme(brand: string, phase?: Phase, doc: Document = document, storage = safeStorage()): string {
  if (phase) phaseNow = phase;
  const choice = readChoice(brand, storage);
  const id = resolveTheme(brand, choice, phaseNow ?? "day");
  const html = doc.documentElement;
  html.dataset.brand = brand;
  html.dataset.theme = id;
  html.dataset.themeChoice = choice;
  const bg = THEME_BG[brand]?.[id];
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (bg && meta) meta.content = bg;
  return id;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
