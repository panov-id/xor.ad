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
