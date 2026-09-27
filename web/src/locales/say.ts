// The web face's words (W13). Two dictionaries, one lookup: the terminal's
// (depth/ink/locales/<lang>.json — a line that means the same on both faces is
// the terminal's key and its translations) and the web's own
// (web/src/locales/<lang>.json, keys under "web."). The language is the
// browser's first one both dictionaries know, else Russian; a key missing in
// that language falls back to Russian, then shows as itself.

const DEPTH = import.meta.glob("../../../depth/ink/locales/*.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
const WEB = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;

const byLang = (files: Record<string, Record<string, string>>) =>
  Object.fromEntries(Object.entries(files).map(([path, words]) => [path.replace(/^.*\/([a-z]{2})\.json$/, "$1"), words]));
const depth = byLang(DEPTH);
const web = byLang(WEB);

export const LANGUAGES = Object.keys(depth).filter((lang) => lang in web).sort();

export function pickLanguage(wanted: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): string {
  for (const tag of wanted) {
    const lang = tag.slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(lang)) return lang;
  }
  return "ru";
}

export const LANG = pickLanguage();
const STRINGS: Record<string, string> = { ...depth.ru, ...web.ru, ...depth[LANG], ...web[LANG] };

export function say(key: string, values?: Record<string, string | number>): string {
  const template = STRINGS[key] ?? key;
  return values
    ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
    : template;
}
