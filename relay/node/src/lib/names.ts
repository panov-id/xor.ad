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

// The cleaned name, or null when nothing visible is left or something invisible is in it.
export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length === 0 || INVISIBLE.test(name)) return null;
  return name;
}
