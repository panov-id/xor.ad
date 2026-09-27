// A name as a person will see it (chat spec §8.2). Normalised to NFC, trimmed,
// inner whitespace collapsed — and refused if it carries what nobody can see:
// controls, format characters (zero-width joiners, direction overrides), line
// and paragraph separators. A moderator reads the name in the queue and a peer
// reads it in a chat; neither can read an invisible character, so a name made
// of them, or hiding them, is not a name (profile panel, 2026-09-22).
//
// One rule for registration and for PATCH /identities/me: two routes that
// cleaned names differently would let the second one wash what the first refused.

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

// Except these: the zero-width joiner and the variation selectors are how an
// emoji is spelled — "👨‍👩‍👧‍👦" is four people and three joiners. Refusing them
// refused a name a person can plainly see, and the identity suite caught it
// (23.09.2026). They are allowed inside a name and cannot make one on their
// own: what is left after removing them still has to be something.
const SPELLING = /[\u200D\uFE0E\uFE0F]/gu;

// And only where they spell an emoji. A joiner between two letters draws
// nothing: "a\u200Db" reads as "ab" and would pass for someone else's name. So
// a joiner must sit between two pictographs (a selector may come between), and
// a selector must follow a pictograph or a keycap base (review panel, 23.09.2026).
const STRAY_JOINER = /(?<![\p{Extended_Pictographic}\p{Emoji_Modifier}][\uFE0E\uFE0F]?)\u200D|\u200D(?!\p{Extended_Pictographic})/u;
const STRAY_SELECTOR = /(?<![\p{Extended_Pictographic}0-9#*])[\uFE0E\uFE0F]/u;

// Whether a text carries what nobody can see (FX3, X4, 27.09.2026): a table's
// name and lines, a phrase, a venue's and an offer's words, a complaint reach
// another person's screen — the terminal's too, where an ESC is a command —
// so they take the rule a name takes. Whitespace is not the question here:
// a line break collapses to a space in the reading, not in the text.
export function hasInvisible(text: string): boolean {
  return text.trim().length > 0 && cleanName(text) === null;
}

// A line break as a browser may send it: CRLF from a pasted or programmatic
// value (measured on the composer, V10), a lone CR from old clients. Folded to
// LF before hasInvisible and before storing, so a plain break is not refused
// as a CR (V11, 27.09.2026). Names do not take this: a name has no lines.
export const foldLines = (text: string): string => text.replace(/\r\n?/g, "\n");

// The cleaned name, or null when nothing visible is left or something invisible is in it.
export function cleanName(raw: string): string | null {
  // The raw text is asked first: trim and the whitespace collapse below eat
  // CR, VT, FF, U+FEFF and U+2028 as "space", and a check on the cleaned copy
  // let them through to the database (V5, 27.09.2026). Tab, line feed and the
  // spelling characters are all that may stand between visible letters.
  if (INVISIBLE.test(raw.replace(/[\t\n]/g, "").replace(SPELLING, ""))) return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (STRAY_JOINER.test(name) || STRAY_SELECTOR.test(name)) return null;
  // Trimmed again once the spelling is out: a space between two joiners
  // survives the first trim and is all that would be left to see.
  const visible = name.replace(SPELLING, "").trim();
  if (visible.length === 0 || INVISIBLE.test(visible)) return null;
  return name;
}
