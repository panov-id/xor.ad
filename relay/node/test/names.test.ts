// cleanName: what a name may be spelled with. Emoji spelling is allowed — a
// family is four people and three joiners — and nothing else that draws nothing.
import { assertEquals } from "jsr:@std/assert@1";
import { cleanName, foldLines, hasInvisible } from "../src/lib/names.ts";

const ZWJ = "‍";

Deno.test("emoji spelled with joiners, selectors and skin tones are names", () => {
  for (
    const name of [
      "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}", // family
      "❤️‍\u{1F525}", // heart on fire: selector before the joiner
      "\u{1F469}\u{1F3FD}‍\u{1F4BB}", // technologist, skin tone before the joiner
      "\u{1F3F3}️‍\u{1F308}", // rainbow flag
      "#️⃣", // keycap
      "Аня \u{1F3C3}‍♀️",
    ]
  ) assertEquals(cleanName(name), name, `refused ${JSON.stringify(name)}`);
});

Deno.test("a space between joiners is not a name", () => {
  assertEquals(cleanName(`${ZWJ} ${ZWJ}`), null);
  assertEquals(cleanName(`${ZWJ}  ${ZWJ}`), null);
});

Deno.test("a joiner or a selector between letters is refused, not drawn as nothing", () => {
  assertEquals(cleanName(`a${ZWJ}b`), null, "a joiner between letters passed for 'ab'");
  assertEquals(cleanName("a️b"), null, "a selector after a letter passed");
  assertEquals(cleanName(`${ZWJ}\u{1F525}`), null, "a leading joiner passed");
});

Deno.test("invisible characters the whitespace collapse would eat are refused, not washed", () => {
  for (const [label, ch] of [["CR", "\r"], ["VT", "\v"], ["FF", "\f"], ["U+FEFF", "﻿"], ["U+2028", " "], ["U+2029", " "]]) {
    for (const name of [`Аня${ch}Петрова`, `${ch}Аня`, `Аня${ch}`]) {
      assertEquals(cleanName(name), null, `${label} passed in ${JSON.stringify(name)}`);
    }
  }
});

Deno.test("foldLines turns CRLF and a lone CR into LF, and leaves the rest", () => {
  assertEquals(foldLines("a\r\nb\rc\nd"), "a\nb\nc\nd");
  assertEquals(foldLines("a\r\n\r\nb"), "a\n\nb", "two CRLF are two breaks, not one");
  assertEquals(hasInvisible(foldLines("a\r\nb")), false, "a folded CRLF is still refused");
  assertEquals(hasInvisible("a\r\nb"), true, "an unfolded CR is let through");
});

Deno.test("a tab or a line feed still collapses to a space", () => {
  assertEquals(cleanName("Аня\tПетрова"), "Аня Петрова");
  assertEquals(cleanName("Аня\nПетрова\n"), "Аня Петрова");
});

Deno.test("an ordinary name is trimmed and kept", () => {
  assertEquals(cleanName("  Аня   Петрова "), "Аня Петрова");
  assertEquals(cleanName("​"), null);
});

// V13 · what draws nothing outside Cc/Cf: the Hangul fillers, the combining
// grapheme joiner, the blank braille cell and the rest of
// Default_Ignorable_Code_Point. Each on its own, inside a name and inside a
// phrase — one case per character, so a red names which one got through.
const IGNORABLE: Array<[string, string]> = [
  ["U+034F combining grapheme joiner", "\u034F"],
  ["U+115F Hangul choseong filler", "\u115F"],
  ["U+1160 Hangul jungseong filler", "\u1160"],
  ["U+3164 Hangul filler", "\u3164"],
  ["U+FFA0 halfwidth Hangul filler", "\uFFA0"],
  ["U+2800 braille pattern blank", "\u2800"],
  ["U+17B4 Khmer vowel inherent aq", "\u17B4"],
  ["U+180B Mongolian free variation selector", "\u180B"],
  ["U+FE00 variation selector-1", "\uFE00"],
];
for (const [what, c] of IGNORABLE) {
  Deno.test(`V13: ${what} is refused alone, inside a name and inside a phrase`, () => {
    assertEquals(cleanName(c), null, `${what} alone passed as a name`);
    assertEquals(cleanName(`Ан${c}я`), null, `${what} inside a name passed`);
    assertEquals(hasInvisible(`гуляю у реки ${c}`), true, `${what} inside a phrase passed`);
  });
}

Deno.test("V13: Hangul written with its letters, braille with its dots and an emoji with its selector still pass", () => {
  assertEquals(cleanName("한글"), "한글");
  assertEquals(cleanName("⠓⠑⠇⠇⠕"), "⠓⠑⠇⠇⠕");
  assertEquals(cleanName("❤️"), "❤️");
  assertEquals(hasInvisible("гуляю у реки ❤️"), false);
});
