// sosed's look on <html> (owner 2026-10-30, docs/newdesign4 README_design §1–2): four themes named after stones —
// limestone, amber, marble, chalk — each with a day and a night; «when» picks day or night: by the sun at the person's
// place (the default), always day, always night; an accent named after a gem paints the button, the like, the PIN dots.
// Tokens: app/tokens/nd4-themes.gen.css (scripts/design/nd4-tokens.py), keyed by data-theme, data-time and data-accent.
// Kept on this device: the theme under the web's key `theme:sosed` (web/src/theme.ts), «when» and the accent beside it;
// an id an older build kept reads as the nearest new one and is written back once. Free of React, so node:test runs it.
export const THEMES = ["limestone", "amber", "marble", "chalk"] as const;
export type ThemeId = (typeof THEMES)[number];
export type Choice = ThemeId;
export const DEFAULT_CHOICE: Choice = "limestone";

export const WHENS = ["sun", "day", "night"] as const;
export type When = (typeof WHENS)[number];
export const DEFAULT_WHEN: When = "sun";

export const ACCENTS = ["carnelian", "coral", "citrine", "peridot", "turquoise", "lapis", "amethyst", "tourmaline"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = "carnelian";

export const STORAGE_KEY = "theme:sosed";
export const WHEN_KEY = "theme-when:sosed";
export const ACCENT_KEY = "theme-accent:sosed";
/** Ids older builds kept (the web's light / dark / auto, the old shell's Dusk, the 26.10 four and their two followers). */
export const OLD_IDS: Record<string, Choice> = {
  light: "limestone", dark: "limestone", auto: "limestone", dusk: "amber",
  sea: "limestone", plum: "amber", white: "marble", black: "marble", colour: "limestone", classic: "marble",
};

type Get = Pick<Storage, "getItem">;
type Put = Pick<Storage, "setItem" | "removeItem">;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);   // a list, not an object: «toString» in the storage is not a theme

function kept(storage: Get | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function readChoice(storage: Get | null = safeStorage()): Choice {
  const value = kept(storage, STORAGE_KEY);
  if (!value) return DEFAULT_CHOICE;
  if (has(THEMES, value)) return value;
  return Object.hasOwn(OLD_IDS, value) ? OLD_IDS[value] : DEFAULT_CHOICE;
}

export function readWhen(storage: Get | null = safeStorage()): When {
  const v = kept(storage, WHEN_KEY);
  return v && has(WHENS, v) ? v : DEFAULT_WHEN;
}

export function readAccent(storage: Get | null = safeStorage()): Accent {
  const v = kept(storage, ACCENT_KEY);
  return v && has(ACCENTS, v) ? v : DEFAULT_ACCENT;
}

function save(key: string, value: string, fallback: string, storage: Put | null) {
  try {
    if (value === fallback) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch { /* kept for this page only */ }
}

export const saveChoice = (c: Choice, storage: Put | null = safeStorage()) => save(STORAGE_KEY, c, DEFAULT_CHOICE, storage);
export const saveWhen = (w: When, storage: Put | null = safeStorage()) => save(WHEN_KEY, w, DEFAULT_WHEN, storage);
export const saveAccent = (a: Accent, storage: Put | null = safeStorage()) => save(ACCENT_KEY, a, DEFAULT_ACCENT, storage);

/** Sunrise and sunset (UTC hours) at a latitude and longitude on a date: the NOAA approximation, good to a few minutes. */
export function sunHours(lat: number, lon: number, date: Date): { rise: number; set: number } | null {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const g = (2 * Math.PI / 365) * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return null;   // polar day or night
  const h = Math.acos(cosH) / rad;
  const noon = 720 - 4 * lon - eqt;   // minutes UTC
  return { rise: (noon - 4 * h) / 60, set: (noon + 4 * h) / 60 };
}

/** Day or night: «sun» asks the sun at the place; a polar day or night keeps the season's side. */
export function resolveTime(when: When, at: { lat: number; lon: number }, now: Date = new Date()): "day" | "night" {
  if (when !== "sun") return when;
  const s = sunHours(at.lat, at.lon, now);
  if (!s) {
    const summer = (now.getUTCMonth() >= 3 && now.getUTCMonth() <= 8) === at.lat >= 0;
    return summer ? "day" : "night";
  }
  const h = ((now.getUTCHours() + now.getUTCMinutes() / 60 - s.rise) % 24 + 24) % 24;
  return h < s.set - s.rise ? "day" : "night";
}

export function applyTheme(doc: Document = document, storage = safeStorage(), at = placeNow(), now: Date = new Date()): ThemeId {
  const raw = kept(storage, STORAGE_KEY);
  const choice = readChoice(storage);
  if (raw && !has(THEMES, raw)) saveChoice(choice, storage);
  const root = doc.documentElement.dataset;
  root.theme = choice;
  root.time = resolveTime(readWhen(storage), at, now);
  root.accent = readAccent(storage);
  return choice;
}

/** Turns day and night over at the sun's hour: checks every minute; returns the stop. */
export function followSun(apply: () => void = () => void applyTheme()): () => void {
  try {
    const t = setInterval(apply, 60_000);
    return () => clearInterval(t);
  } catch { return () => {}; }
}

function placeNow(): { lat: number; lon: number } {
  try {
    const p = JSON.parse(localStorage.getItem("place.v1") ?? "null");
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: p.lat, lon: p.lon };
  } catch { /* no place: the island's own sun */ }
  return { lat: 34.7, lon: 33.0 };   // Limassol, where sosed starts
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
