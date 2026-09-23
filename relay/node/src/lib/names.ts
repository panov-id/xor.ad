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

// The cleaned name, or null when nothing visible is left or something invisible is in it.
export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (STRAY_JOINER.test(name) || STRAY_SELECTOR.test(name)) return null;
  // Trimmed again once the spelling is out: a space between two joiners
  // survives the first trim and is all that would be left to see.
  const visible = name.replace(SPELLING, "").trim();
  if (visible.length === 0 || INVISIBLE.test(visible)) return null;
  return name;
}
