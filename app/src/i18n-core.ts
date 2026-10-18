// The shell's words and language choice, as pure functions (no import.meta, no
// window): src/i18n.ts wires them to the dictionaries and the browser, and the
// unit tests (screens/*.test.ts) run them as they are. Behaviour mirrors
// web/src/locales/say.ts: the choice is kept on this device (localStorage
// "lang"), else the browser's first language both dictionaries know, else
// Russian; a key missing in the language falls back to Russian, then shows as itself.

export type Dict = Record<string, string>;
export type Dicts = Record<string, Dict>;

/** { "../x/ru.json": {...} } -> { ru: {...} } (the two-letter code in the file name). */
export function byLang(files: Record<string, Dict>): Dicts {
  return Object.fromEntries(Object.entries(files).map(([path, words]) => [path.replace(/^.*\/([a-z]{2})\.json$/, "$1"), words]));
}

/** The languages both dictionaries (terminal and web) know, sorted. */
export function languagesOf(depth: Dicts, web: Dicts): string[] {
  return Object.keys(depth).filter((lang) => lang in web).sort();
}

export type Store = Pick<Storage, "getItem" | "setItem">;
const CHOSEN_KEY = "lang";
const ASKED_KEY = "lang-asked";

/** The language this device kept, if it is one we speak. Storage that throws reads as no choice. */
export function chosenLanguage(languages: readonly string[], store: Store | null): string | null {
  try {
    const lang = store?.getItem(CHOSEN_KEY) ?? null;
    return lang && languages.includes(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** Chosen, else the browser's first known language, else Russian. */
export function pickLanguage(languages: readonly string[], wanted: readonly string[], chosen: string | null): string {
  if (chosen) return chosen;
  for (const tag of wanted) {
    const lang = tag.slice(0, 2).toLowerCase();
    if (languages.includes(lang)) return lang;
  }
  return "ru";
}

/** The language list comes first, once per device. Storage that throws (or none) reads as asked,
 *  so a blocked device is never held on the list. */
export function languageAsked(store: Store | null): boolean {
  try {
    return store === null || store.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

/** Keeps another language and reloads in it: true when the page reloads. Nothing to keep it in: false. */
export function chooseLanguage(lang: string, d: { languages: readonly string[]; current: string; store: Store | null; reload: () => void }): boolean {
  if (!d.languages.includes(lang) || lang === d.current) return false;
  try {
    if (d.store === null) return false;
    d.store.setItem(CHOSEN_KEY, lang);
  } catch {
    return false; // a reload would come back to the browser's language
  }
  d.reload();
  return true;
}

/** The list was passed. The page's own language: true (nothing to reload); another: the page reloads, false. */
export function keepLanguage(lang: string, d: { languages: readonly string[]; current: string; store: Store | null; reload: () => void }): boolean {
  try {
    d.store?.setItem(ASKED_KEY, "1");
  } catch { /* nowhere to keep it: the list is passed for this visit */ }
  return !chooseLanguage(lang, d);
}

/** A language named in itself ("web.lang.self" of its own dictionary); else the browser's name for it,
 *  else the code. */
export function languageName(web: Dicts, lang: string): string {
  const own = web[lang]?.["web.lang.self"];
  if (own) return own;
  try {
    const name = new Intl.DisplayNames([lang], { type: "language" }).of(lang);
    return name && name !== lang ? name.charAt(0).toLocaleUpperCase(lang) + name.slice(1) : lang.toUpperCase();
  } catch {
    return lang.toUpperCase();
  }
}

export type Say = (key: string, values?: Record<string, string | number>) => string;

/** Russian under the chosen language, then the language itself; the shell's own words on top. */
export function makeSay(lang: string, dicts: readonly Dicts[]): Say {
  const strings: Dict = {};
  for (const d of dicts) Object.assign(strings, d.ru);
  for (const d of dicts) Object.assign(strings, d[lang]);
  return (key, values) => {
    const template = strings[key] ?? key;
    return values ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole)) : template;
  };
}

export type SayCount = (key: string, n: number, values?: Record<string, string | number>) => string;

/** A line that agrees with its number: `${key}.${form}`, the form the language's own (Intl.PluralRules: one, few,
 *  many, other ...), {n} filled; a form the dictionaries do not have is the plain key. */
export function makeSayCount(lang: string, say: Say): SayCount {
  const rules = new Intl.PluralRules(lang);
  return (key, n, values) => {
    const form = `${key}.${rules.select(n)}`;
    const line = say(form, { n, ...values });
    return line === form ? say(key, { n, ...values }) : line;
  };
}

/** The first letter in capitals, the rest as it is: the dictionaries keep a label in running case ("repeat the PIN"),
 *  a sheet sets it as a label ("Repeat the PIN"). The language's own rules for the capital (Turkish i). */
export function capital(text: string, lang: string): string {
  const first = [...text][0];
  return first ? first.toLocaleUpperCase(lang) + text.slice(first.length) : text;
}
