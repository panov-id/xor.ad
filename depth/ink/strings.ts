// The screens' words, one file per language in ./locales.
//
// The set is the storefronts' own (sosed.place's seventeen, which contain
// neighbro.place's ten) — the owner's decision, 2026-09-22: a person who reads
// a storefront in Georgian should not meet the terminal in English. The
// language comes from the environment, the way every terminal program takes
// it; an unknown one falls back to English, never to an empty screen.
//
// A key missing from a file is a hole the gate catches
// (scripts/check-depth-i18n.sh), not something the screen hides at runtime:
// a missing key renders as the English one.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const LANGUAGES = [
  "ru", "en", "uk", "be", "kk", "ka", "pl", "fr", "de",
  "es", "el", "hy", "az", "uz", "ky", "tg", "ro",
] as const;
export type Language = (typeof LANGUAGES)[number];
export const FALLBACK: Language = "en";

const here = dirname(fileURLToPath(import.meta.url));
const load = (lang: Language): Record<string, string> =>
  JSON.parse(readFileSync(join(here, "locales", `${lang}.json`), "utf8"));

// "ru_RU.UTF-8", "ka-GE", "C" — the parts before the first separator, lowercased.
export function languageOf(env: Record<string, string | undefined>): Language {
  const raw = env.DEPTH_LANG ?? env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? "";
  const tag = raw.split(".")[0].split("@")[0].replace("_", "-").split("-")[0].toLowerCase();
  return (LANGUAGES as readonly string[]).includes(tag) ? (tag as Language) : FALLBACK;
}

export type Say = (key: string, values?: Record<string, string | number>) => string;

// {name} and {age} are filled in; an unknown key shows itself, so a hole is
// visible on the screen instead of silently empty.
export function strings(lang: Language): Say {
  const own = load(lang);
  const fallback = lang === FALLBACK ? own : load(FALLBACK);
  return (key, values) => {
    const template = own[key] ?? fallback[key] ?? key;
    return values
      ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
      : template;
  };
}
