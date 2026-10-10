// The web face's words (W13). Two dictionaries, one lookup: the terminal's
// (depth/ink/locales/<lang>.json — a line that means the same on both faces is
// the terminal's key and its translations) and the web's own
// (web/src/locales/<lang>.json, keys under "web."). The language is the one the
// person chose on this device (WP-3: the splash's corner and "me"), else the
// browser's first one both dictionaries know, else Russian; a key missing in
// that language falls back to Russian, then shows as itself.

const DEPTH = import.meta.glob("../../../depth/ink/locales/*.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
const WEB = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;

const byLang = (files: Record<string, Record<string, string>>) =>
  Object.fromEntries(Object.entries(files).map(([path, words]) => [path.replace(/^.*\/([a-z]{2})\.json$/, "$1"), words]));
const depth = byLang(DEPTH);
const web = byLang(WEB);

export const LANGUAGES = Object.keys(depth).filter((lang) => lang in web).sort();

// The choice is kept on this device only, as the theme is (localStorage
// "lang"): nothing about the person leaves it. Storage that throws (a private
// window, blocked site data) reads as no choice, and the browser decides.
const CHOSEN_KEY = "lang";
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
export function chosenLanguage(): string | null {
  try {
    const lang = storage()?.getItem(CHOSEN_KEY) ?? null;
    return lang && LANGUAGES.includes(lang) ? lang : null;
  } catch {
    return null;
  }
}

// The page is reloaded to speak the new language: words are read once, as the
// screens render, and some are held by the screens in state. A reload asks for
// the PIN again (the keys are not kept across one); a language is changed
// rarely, and a half-translated page is worse.
export function chooseLanguage(lang: string): void {
  if (!LANGUAGES.includes(lang) || lang === LANG) return;
  try {
    storage()?.setItem(CHOSEN_KEY, lang);
  } catch {
    return; // nowhere to keep it: a reload would come back to the browser's language
  }
  location.reload();
}

// A language named in itself — "Українська", "Қазақша" — from its own
// dictionary ("web.lang.self" in <lang>.json), so every name is in its own
// script whatever the browser's ICU data knows: Intl.DisplayNames answered
// "Belarusian" or "Tajik" in English for the languages a small ICU lacks (П3,
// text walk 10.10.2026). The browser's name, then the code, only where a
// dictionary has no name.
export function languageName(lang: string): string {
  const own = web[lang]?.["web.lang.self"];
  if (own) return own;
  try {
    const name = new Intl.DisplayNames([lang], { type: "language" }).of(lang);
    return name && name !== lang ? name.charAt(0).toLocaleUpperCase(lang) + name.slice(1) : lang.toUpperCase();
  } catch {
    return lang.toUpperCase();
  }
}

export function pickLanguage(
  wanted: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language],
  chosen: string | null = chosenLanguage(),
): string {
  if (chosen) return chosen;
  for (const tag of wanted) {
    const lang = tag.slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(lang)) return lang;
  }
  return "ru";
}

export const LANG = pickLanguage();
// The page speaks LANG, and says so to the browser and to a screen reader
// (WCAG 3.1.1): index.html's lang="ru" is only what a page that has not run
// yet is. A language is changed by a reload (chooseLanguage), so once is enough.
if (typeof document !== "undefined") document.documentElement.lang = LANG;
const STRINGS: Record<string, string> = { ...depth.ru, ...web.ru, ...depth[LANG], ...web[LANG] };

export function say(key: string, values?: Record<string, string | number>): string {
  const template = STRINGS[key] ?? key;
  return values
    ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
    : template;
}

// A calendar date of the node ("2026-09-16") as a person reads it in the
// interface's language, never the machine form. UTC on both ends, so the day
// does not move with the time zone. Anything that is not a plain date comes
// back as it was.
export function dateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Intl.DateTimeFormat(LANG, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}
