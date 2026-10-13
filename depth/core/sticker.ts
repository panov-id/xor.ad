// A sticker inside a conversation's ciphertext — one rule for every face (decided by quorum 3/3,
// 13.10.2026; docs/depth-client_EN.md §4a: only the identifier travels inside the ciphertext). The
// plaintext of a message stays the person's text byte for byte; a sticker is the private-use mark
// U+E000, "sticker:" and one of the fixed ids. The node sees a ciphertext as always. Anything else — an
// unknown id, a stray mark — is text, so nobody can make a client draw what the set does not hold.
// The set's order and ids are the sheets' (scripts/design/adaptive-sheets.py STICKERS); the web's
// generated art (web/src/ui/stickerArt.ts) is held to it by a test.

export const STICKER_IDS = ["hi", "thanks", "deal", "wow", "coffee", "move", "again", "giveup"] as const;
export const STICKER_MARK = "\uE000sticker:";

export function stickerText(id: string): string {
  if (!(STICKER_IDS as readonly string[]).includes(id)) throw new Error(`not a sticker of the set: ${id}`);
  return `${STICKER_MARK}${id}`;
}

export function stickerOf(text: string): string | null {
  if (!text.startsWith(STICKER_MARK)) return null;
  const id = text.slice(STICKER_MARK.length);
  return (STICKER_IDS as readonly string[]).includes(id) ? id : null;
}
