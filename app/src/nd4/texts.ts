// The words of a texts-mode screen (scripts/design/nd4-extract.py, «texts»): the archive's English texts are the keys
// (nd4/texts/<family>.en.json, generated); the Russian per key is data (<family>.ru.json, by hand). English shows the
// archive's own words; a missing Russian key falls back to them (nd4/texts.test.ts fails on any missing key).
import { LANG } from "../i18n";
import w1en from "./texts/wizard-1.en.json";
import w1ru from "./texts/wizard-1.ru.json";
import w2en from "./texts/wizard-2.en.json";
import w2ru from "./texts/wizard-2.ru.json";
import w3en from "./texts/wizard-3.en.json";
import w3ru from "./texts/wizard-3.ru.json";
import w4en from "./texts/wizard-4.en.json";
import w4ru from "./texts/wizard-4.ru.json";

export const TEXTS = {
  "wizard-1": [w1en, w1ru],
  "wizard-2": [w2en, w2ru],
  "wizard-3": [w3en, w3ru],
  "wizard-4": [w4en, w4ru],
} as const satisfies Record<string, readonly [string[], Record<string, string>]>;

export function words(family: keyof typeof TEXTS, lang: string = LANG): Record<string, string> {
  const [en, ru] = TEXTS[family];
  const own: Record<string, string> = lang === "ru" ? ru : {};
  return Object.fromEntries(en.map((k) => [k, own[k] ?? k]));
}
